// ============================================================================
// inbound.js — receives inbound mail from a Cloudflare Email Worker.
//
// POST /api/inbound/mail   (public; shared-secret protected)
//
// Architecture
// ------------
// Cloudflare Email Routing on `INBOUND_DOMAIN` (default inbox.sportscalapp.com)
// catches mail addressed to `add+<token>@<domain>` and hands the raw MIME to a
// Cloudflare Worker (see cloudflare/inbound-mail/). The Worker parses the
// MIME with `postal-mime` and POSTs us a small JSON envelope:
//
//   { envelope_to, envelope_from, from, to, subject, text, html }
//
// We authenticate the request with a shared secret (X-Intake-Secret header).
// No svix / HMAC dance is needed — both sides are ours, and the Worker speaks
// only to this endpoint over HTTPS.
//
// We then:
//   1. Extract the per-user token from `envelope_to` (`add+<token>@<domain>`).
//   2. Resolve to a user via getUserByInboundToken.
//   3. Run lib/inboundParser.extractIcalUrls on the body.
//   4. For each URL, run lib/sourceIntake -> createSource + first-fetch.
//   5. Auto-link to the user's only kid if they have exactly one.
//   6. Send a confirmation email back via Resend outbound.
//
// Required env on Railway:
//   INBOUND_SECRET    — must match the Cloudflare Worker's INTAKE_SECRET binding
//   INBOUND_DOMAIN    — defaults to 'inbox.sportscalapp.com'
//   RESEND_API_KEY    — already set; used for the confirmation email
//
// We always 200 (or 401/503 for config errors) so a misconfigured Worker
// doesn't bombard us with retries.
// ============================================================================

import { Router } from 'express';
import { Resend } from 'resend';

import {
  getUserByInboundToken,
  getKidsByUser,
  createSource,
  setKidSources,
  getUserPlanLimits,
  countUserSources,
} from '../db/index.js';
import { intakeFromUrl } from '../lib/sourceIntake.js';
import { extractIcalUrls } from '../lib/inboundParser.js';
import { enqueueIcalFetch } from '../workers/queue.js';

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);

// "add+<token>@<domain>" -> "<token>". Returns null on shape mismatch.
function tokenFromEnvelopeTo(envelopeTo) {
  if (typeof envelopeTo !== 'string') return null;
  const domain = (process.env.INBOUND_DOMAIN || 'inbox.sportscalapp.com').toLowerCase();
  const m = envelopeTo.trim().toLowerCase().match(
    new RegExp(`^add\\+([a-f0-9]{6,16})@${domain.replace(/\./g, '\\.')}$`),
  );
  return m ? m[1] : null;
}

async function autoCreateSourceFromUrl(user, kid, url) {
  const candidate = intakeFromUrl(url);
  if (!candidate) return { ok: false, reason: 'not-a-calendar-url', url };

  // Plan-limit guard. Mirrors POST /api/sources so an inbound email
  // can't bypass it.
  const [limits, count] = await Promise.all([
    getUserPlanLimits(user.id),
    countUserSources(user.id),
  ]);
  if (count >= limits.max_sources) {
    return { ok: false, reason: 'plan-limit', candidate, limits, count, url };
  }

  const source = await createSource({
    userId:                 user.id,
    name:                   candidate.candidate.name,
    app:                    candidate.candidate.app,
    fetchType:              candidate.candidate.fetch_type,
    icalUrl:                candidate.candidate.ical_url,
    scrapeUrl:              null,
    scrapeConfig:           null,
    refreshIntervalMinutes: 120,
  });

  if (kid) await setKidSources(source.id, [kid.id]);

  // First fetch. Same shape as routes/sources.js.
  await enqueueIcalFetch({ ...source, user_id: user.id });

  return { ok: true, source };
}

async function notifyUserBySendingEmail(user, summary) {
  if (!process.env.RESEND_API_KEY) return;
  const FROM = process.env.RESEND_FROM || 'SportsCal <hello@sportscalapp.com>';
  try {
    await resend.emails.send({
      from: FROM,
      to: user.email,
      subject: summary.subject,
      text: summary.text,
    });
  } catch (err) {
    console.error('[inbound] confirmation send failed:', err.message);
  }
}

// ============================================================
// POST /api/inbound/mail
// ============================================================
router.post('/mail', async (req, res) => {
  const expected = process.env.INBOUND_SECRET;
  if (!expected) {
    console.error('[inbound] INBOUND_SECRET not configured');
    return res.status(503).json({ error: 'Inbound mail is not configured' });
  }

  // Constant-time-ish compare. Header could be array if duplicated; coerce.
  const got = String(req.headers['x-intake-secret'] || '');
  if (got.length !== expected.length || got !== expected) {
    console.warn('[inbound] secret mismatch from', req.ip);
    return res.status(401).json({ error: 'Bad inbound secret' });
  }

  const {
    envelope_to:   envelopeTo,
    envelope_from: envelopeFrom,
    from:          fromHeader,
    subject,
    text,
    html,
  } = req.body || {};

  const token = tokenFromEnvelopeTo(envelopeTo);
  if (!token) {
    console.log('[inbound] envelope_to does not match add+<token>@<domain>:', envelopeTo);
    return res.status(200).json({ ok: true, reason: 'no-token-in-envelope' });
  }

  const user = await getUserByInboundToken(token);
  if (!user) {
    console.log(`[inbound] token ${token} matched no user`);
    return res.status(200).json({ ok: true, reason: 'unknown-token' });
  }

  const fromAddr = fromHeader || envelopeFrom || '(unknown sender)';
  const urls = extractIcalUrls({ text, html });
  if (urls.length === 0) {
    console.log(`[inbound] no calendar URLs from ${fromAddr} (subject="${subject}")`);
    await notifyUserBySendingEmail(user, {
      subject: 'Couldn\'t find a calendar link in that email',
      text:
        'Hi ' + (user.name || 'there') + ',\n\n' +
        'I scanned the email you forwarded but couldn\'t find a calendar link in it. ' +
        'Sports apps usually share a "Subscribe to calendar" URL ending in .ics — make sure ' +
        'that link is in the body of the email and forward it again.\n\n' +
        'You can also paste the URL directly in the SportsCal setup helper.\n\n' +
        '— SportsCal',
    });
    return res.status(200).json({ ok: true, found: 0 });
  }

  const kids = await getKidsByUser(user.id).catch(() => []);
  const linkKid = kids.length === 1 ? kids[0] : null;

  const results = [];
  for (const url of urls) {
    try {
      results.push(await autoCreateSourceFromUrl(user, linkKid, url));
    } catch (err) {
      console.error('[inbound] source create failed:', err.message);
      results.push({ ok: false, reason: 'create-error', url, message: err.message });
    }
  }

  const created = results.filter(r => r.ok);
  const failed  = results.filter(r => !r.ok);

  // Build a friendly confirmation.
  const lines = [];
  if (created.length) {
    lines.push(
      `Added ${created.length} calendar${created.length === 1 ? '' : 's'} to your SportsCal:`,
      ...created.map(r => `  • ${r.source.name}`),
    );
    if (linkKid) lines.push(`\nLinked to ${linkKid.name}.`);
    else if (kids.length > 1) lines.push('\nOpen the app to assign these to a kid.');
  }
  if (failed.length) {
    lines.push('', `Couldn't add ${failed.length} link${failed.length === 1 ? '' : 's'}:`);
    for (const r of failed) {
      const why =
        r.reason === 'plan-limit'
          ? `you've hit your ${r.limits?.max_sources}-source plan limit — upgrade to add more`
          : r.reason === 'not-a-calendar-url'
            ? 'that URL didn\'t look like a calendar feed'
            : (r.message || 'unexpected error');
      lines.push(`  • ${r.url || '(unknown)'}: ${why}`);
    }
  }

  await notifyUserBySendingEmail(user, {
    subject: created.length
      ? `Added ${created.length} calendar${created.length === 1 ? '' : 's'} to SportsCal`
      : 'Couldn\'t add any calendars from that email',
    text: lines.join('\n') + '\n\n— SportsCal',
  });

  console.log(
    `[inbound] user=${user.id} created=${created.length} failed=${failed.length} from=${fromAddr}`,
  );
  res.status(200).json({ ok: true, created: created.length, failed: failed.length });
});

export default router;
