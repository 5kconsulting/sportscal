// ============================================================================
// inbound.js — Resend Inbound webhook handler.
//
// POST /api/inbound/resend  (public; signature-verified)
//
// Resend posts a thin "email.received" event with metadata only — no body,
// no attachments. We:
//   1. Verify the svix signature against the RAW request body (the body
//      parser middleware in server.js skips this path so we get bytes).
//   2. Look at the `to[]` list for any address shaped `add+<token>@<host>`,
//      resolve `<token>` -> user.
//   3. Fetch the full email via GET https://api.resend.com/emails/receiving/{id}
//      to read text/html bodies (where the parent's calendar URL lives).
//   4. Extract iCal URLs (lib/inboundParser), pass each through
//      lib/sourceIntake to detect app + name, then create the source and
//      link the user's kid (auto-link only when the user has exactly one
//      kid — no signal otherwise).
//   5. Send a confirmation email back so the parent knows it worked.
//
// Required env:
//   RESEND_API_KEY            — already set; used for outbound mail
//   RESEND_WEBHOOK_SECRET     — set when creating the webhook in Resend
//   INBOUND_DOMAIN (optional) — defaults to 'inbox.sportscalapp.com'
//
// We always 200 even on no-op so Resend doesn't keep retrying. Real errors
// are logged + emailed back to the user when possible.
// ============================================================================

import { Router } from 'express';
import { Webhook } from 'svix';
import { Resend } from 'resend';

import {
  getUserByInboundToken,
  getKidsByUser,
  createSource,
  setKidSources,
  getUserPlanLimits,
  countUserSources,
  query,
} from '../db/index.js';
import { intakeFromUrl } from '../lib/sourceIntake.js';
import { extractIcalUrls } from '../lib/inboundParser.js';
import { enqueueIcalFetch } from '../workers/queue.js';

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);

const RESEND_API_BASE = 'https://api.resend.com';

// Pull the per-user token out of the `to` list. We accept the first match
// — a forwarded message can land in multiple inboxes, but only one of
// them is ours.
function findInboundToken(toList) {
  if (!Array.isArray(toList)) return null;
  const domain = (process.env.INBOUND_DOMAIN || 'inbox.sportscalapp.com').toLowerCase();
  for (const raw of toList) {
    if (typeof raw !== 'string') continue;
    // Normalize "Name <addr@domain>" -> "addr@domain"
    const m = raw.match(/<([^>]+)>/);
    const addr = (m ? m[1] : raw).trim().toLowerCase();
    const plus = addr.match(new RegExp(`^add\\+([a-f0-9]{6,16})@${domain.replace(/\./g, '\\.')}$`));
    if (plus) return plus[1];
  }
  return null;
}

async function fetchReceivedEmail(emailId) {
  const res = await fetch(`${RESEND_API_BASE}/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend GET /emails/receiving/${emailId} failed: ${res.status} ${body}`);
  }
  return res.json();
}

async function autoCreateSourceFromUrl(user, kid, url) {
  const candidate = intakeFromUrl(url);
  if (!candidate) {
    return { ok: false, reason: 'not-a-calendar-url', url };
  }

  // Plan limit guard. Mirror the check in routes/sources.js so an inbound
  // email can't sneak past it.
  const [limits, count] = await Promise.all([
    getUserPlanLimits(user.id),
    countUserSources(user.id),
  ]);
  if (count >= limits.max_sources) {
    return { ok: false, reason: 'plan-limit', candidate, limits, count };
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

  if (kid) {
    await setKidSources(source.id, [kid.id]);
  }

  // First fetch — same shape as routes/sources.js:114
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
// Route handler. server.js mounts express.raw() ahead of express.json()
// for this path so req.body is a Buffer here, not a parsed object.
// ============================================================
router.post('/resend', async (req, res) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[inbound] RESEND_WEBHOOK_SECRET not configured');
    return res.status(503).json({ error: 'Inbound mail is not configured' });
  }

  // Verify signature on the RAW bytes. svix's verify throws on mismatch.
  let payload;
  try {
    const wh = new Webhook(secret);
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
    payload = wh.verify(raw, {
      'svix-id':        req.headers['svix-id'],
      'svix-timestamp': req.headers['svix-timestamp'],
      'svix-signature': req.headers['svix-signature'],
    });
  } catch (err) {
    console.warn('[inbound] signature verify failed:', err.message);
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  if (payload?.type !== 'email.received') {
    // Other event types (e.g. delivery confirmations) — accept and ignore.
    return res.status(200).json({ ok: true, ignored: payload?.type || 'unknown' });
  }

  const data    = payload.data || {};
  const emailId = data.email_id || data.id;
  const toList  = data.to || [];
  const fromAddr = data.from || '(unknown sender)';

  const token = findInboundToken(toList);
  if (!token) {
    console.log('[inbound] no add+<token> address in to list:', toList);
    return res.status(200).json({ ok: true, reason: 'no-token-in-to' });
  }

  const user = await getUserByInboundToken(token);
  if (!user) {
    console.log(`[inbound] token ${token} matched no user`);
    return res.status(200).json({ ok: true, reason: 'unknown-token' });
  }

  // Fetch the full email body (the webhook only delivers metadata).
  let email;
  try {
    email = await fetchReceivedEmail(emailId);
  } catch (err) {
    console.error('[inbound] body fetch failed:', err.message);
    return res.status(200).json({ ok: true, error: 'body-fetch-failed' });
  }

  const urls = extractIcalUrls({ text: email.text, html: email.html });
  if (urls.length === 0) {
    console.log(`[inbound] no calendar URLs in email ${emailId} from ${fromAddr}`);
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

  // Auto-link to the only kid if there's exactly one. Multi-kid users
  // assign in app — no good signal in the email body.
  const kids = await getKidsByUser(user.id).catch(() => []);
  const linkKid = kids.length === 1 ? kids[0] : null;

  const results = [];
  for (const url of urls) {
    try {
      const r = await autoCreateSourceFromUrl(user, linkKid, url);
      results.push(r);
    } catch (err) {
      console.error('[inbound] source create failed:', err.message);
      results.push({ ok: false, reason: 'create-error', url, message: err.message });
    }
  }

  const created = results.filter(r => r.ok);
  const failed  = results.filter(r => !r.ok);

  // Build a friendly confirmation summary.
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
      : `Couldn\'t add any calendars from that email`,
    text: lines.join('\n') + '\n\n— SportsCal',
  });

  console.log(
    `[inbound] user=${user.id} created=${created.length} failed=${failed.length}`,
  );
  res.status(200).json({ ok: true, created: created.length, failed: failed.length });
});

export default router;
