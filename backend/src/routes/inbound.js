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
//   3. Process .ics attachments (Google/Apple/Outlook iMIP "invite a guest"
//      pattern). Each VEVENT becomes an event in the user's per-account
//      "Email invites" pseudo-source. METHOD:CANCEL deletes events.
//   4. Run lib/inboundParser.extractIcalUrls on the body. For each URL,
//      run lib/sourceIntake -> createSource + first-fetch.
//   5. Auto-link the user's only kid (for both invites + URLs) if exactly one.
//   6. Send a confirmation email back via Resend outbound summarizing both.
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
import ical from 'node-ical';

import {
  getUserByInboundToken,
  getKidsByUser,
  createSource,
  setKidSources,
  getUserPlanLimits,
  countUserSources,
  getOrCreateEmailInviteSource,
  getKidsForSource,
  upsertEvent,
  query,
  invalidateFeedCache,
} from '../db/index.js';
import { intakeFromUrl } from '../lib/sourceIntake.js';
import { extractIcalUrls } from '../lib/inboundParser.js';
import { normalizeIcalFeed } from '../normalizer.js';
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

// Pull .ics attachments out of the Worker payload, parse each with
// node-ical, and upsert each VEVENT into the user's per-account
// "Email invites" source. METHOD:CANCEL invites delete the matching
// event by source_uid. Returns a summary the caller folds into the
// confirmation email.
async function processIcalAttachments(user, attachments) {
  const icsAttachments = (attachments || []).filter(a =>
    a && (a.mime_type === 'text/calendar' || /\.ics$/i.test(a.filename || '')),
  );
  if (icsAttachments.length === 0) return { added: [], updated: [], cancelled: [] };

  const source = await getOrCreateEmailInviteSource(user.id);

  // First-invite kid auto-link: if the user has exactly one kid and the
  // source has no kid linked yet, link them so the event picks up the
  // kid color and shows up in the kid's per-feed iCal. Multi-kid users
  // assign in app — same policy as the URL inbound path.
  const kidsForSource = await getKidsForSource(source.id);
  if (kidsForSource.length === 0) {
    const allKids = await getKidsByUser(user.id);
    if (allKids.length === 1) {
      await setKidSources(source.id, [allKids[0].id]);
      kidsForSource.push(allKids[0]);
    }
  }

  const added = [];
  const updated = [];
  const cancelled = [];

  for (const att of icsAttachments) {
    let text;
    try {
      text = Buffer.from(att.content_b64 || '', 'base64').toString('utf8');
    } catch {
      console.warn('[inbound] failed to b64-decode .ics attachment:', att.filename);
      continue;
    }

    // METHOD:CANCEL invites are removals. Detect before parsing because
    // node-ical doesn't expose top-level METHOD on parsed output.
    const isCancel = /\bMETHOD:\s*CANCEL\b/i.test(text);

    let parsed;
    try {
      parsed = ical.sync.parseICS(text);
    } catch (err) {
      console.warn('[inbound] .ics parse error:', err.message);
      continue;
    }

    if (isCancel) {
      // Delete VEVENTs from this source by their UID. We trust the iMIP
      // sender — if a parent leaks their inbox token and someone CANCELs
      // events maliciously, that's a breach we can fix by rotating the
      // token (a future feature). Acceptable risk for v1.
      for (const raw of Object.values(parsed)) {
        if (raw.type !== 'VEVENT' || !raw.uid) continue;
        const r = await query(
          'DELETE FROM events WHERE source_id = $1 AND source_uid = $2 RETURNING raw_title',
          [source.id, raw.uid],
        );
        if (r.rowCount > 0) {
          cancelled.push(r.rows[0].raw_title || raw.summary || 'Untitled event');
        }
      }
      continue;
    }

    const events = normalizeIcalFeed(parsed, source.id, user.id, kidsForSource);
    for (const ev of events) {
      const result = await upsertEvent(ev);
      if (result.inserted) added.push(ev.displayTitle || ev.rawTitle);
      else updated.push(ev.displayTitle || ev.rawTitle);
    }
  }

  if (added.length || updated.length || cancelled.length) {
    await invalidateFeedCache(user.id);
  }

  return { added, updated, cancelled, source };
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
    attachments,
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

  // Two intake paths run in parallel for the same email:
  //   1. .ics attachments -> Google/Apple/Outlook iMIP guest invite. Each
  //      VEVENT becomes an event in the user's "Email invites" source.
  //      METHOD:CANCEL deletes events.
  //   2. Calendar URLs in the body -> subscribe-the-whole-feed flow.
  // Most emails will exercise exactly one of these; the canonical
  // Google-invite path uses (1), the canonical "I forwarded my league's
  // welcome email" path uses (2). We run both because we don't know which
  // shape we got and there's no harm if both paths return zero hits.
  const inviteSummary = await processIcalAttachments(user, attachments).catch(err => {
    console.error('[inbound] ics processing failed:', err.message);
    return { added: [], updated: [], cancelled: [], error: err.message };
  });

  const urls    = extractIcalUrls({ text, html });
  const kids    = await getKidsByUser(user.id).catch(() => []);
  const linkKid = kids.length === 1 ? kids[0] : null;

  const urlResults = [];
  for (const url of urls) {
    try {
      urlResults.push(await autoCreateSourceFromUrl(user, linkKid, url));
    } catch (err) {
      console.error('[inbound] source create failed:', err.message);
      urlResults.push({ ok: false, reason: 'create-error', url, message: err.message });
    }
  }
  const urlCreated = urlResults.filter(r => r.ok);
  const urlFailed  = urlResults.filter(r => !r.ok);

  const totalAdded =
    inviteSummary.added.length + inviteSummary.updated.length + urlCreated.length;
  const totalCancelled = inviteSummary.cancelled.length;

  // No calendar URLs AND no .ics attachments -> friendly "we couldn't find anything" reply.
  if (totalAdded === 0 && totalCancelled === 0 && urlFailed.length === 0) {
    console.log(`[inbound] no calendar content from ${fromAddr} (subject="${subject}")`);
    await notifyUserBySendingEmail(user, {
      subject: 'Couldn\'t find a calendar in that email',
      text:
        'Hi ' + (user.name || 'there') + ',\n\n' +
        'I scanned the email you forwarded but didn\'t find a calendar URL or invite ' +
        'attachment. A few ways to add events to SportsCal:\n\n' +
        '  • Forward an email that has a "Subscribe to calendar" link in it.\n' +
        '  • In Google/Apple/Outlook Calendar, invite this address as a guest on ' +
        'the event you want — we\'ll add it automatically.\n' +
        '  • Open the app and use the setup helper.\n\n' +
        '— SportsCal',
    });
    return res.status(200).json({ ok: true, found: 0 });
  }

  // Build the confirmation summary.
  const lines = [];
  if (inviteSummary.added.length) {
    lines.push(
      `Added ${inviteSummary.added.length} event${inviteSummary.added.length === 1 ? '' : 's'} from your invite:`,
      ...inviteSummary.added.map(t => `  • ${t}`),
    );
  }
  if (inviteSummary.updated.length) {
    if (lines.length) lines.push('');
    lines.push(
      `Updated ${inviteSummary.updated.length} event${inviteSummary.updated.length === 1 ? '' : 's'}:`,
      ...inviteSummary.updated.map(t => `  • ${t}`),
    );
  }
  if (inviteSummary.cancelled.length) {
    if (lines.length) lines.push('');
    lines.push(
      `Removed ${inviteSummary.cancelled.length} cancelled event${inviteSummary.cancelled.length === 1 ? '' : 's'}:`,
      ...inviteSummary.cancelled.map(t => `  • ${t}`),
    );
  }
  if (urlCreated.length) {
    if (lines.length) lines.push('');
    lines.push(
      `Added ${urlCreated.length} calendar${urlCreated.length === 1 ? '' : 's'} to your SportsCal:`,
      ...urlCreated.map(r => `  • ${r.source.name}`),
    );
    if (linkKid) lines.push(`\nLinked to ${linkKid.name}.`);
    else if (kids.length > 1) lines.push('\nOpen the app to assign these to a kid.');
  }
  if (urlFailed.length) {
    if (lines.length) lines.push('');
    lines.push(`Couldn't add ${urlFailed.length} link${urlFailed.length === 1 ? '' : 's'}:`);
    for (const r of urlFailed) {
      const why =
        r.reason === 'plan-limit'
          ? `you've hit your ${r.limits?.max_sources}-source plan limit — upgrade to add more`
          : r.reason === 'not-a-calendar-url'
            ? 'that URL didn\'t look like a calendar feed'
            : (r.message || 'unexpected error');
      lines.push(`  • ${r.url || '(unknown)'}: ${why}`);
    }
  }

  const subjectLine = totalAdded > 0
    ? `Added ${totalAdded} ${totalAdded === 1 ? 'item' : 'items'} to SportsCal`
    : (totalCancelled > 0
        ? `Removed ${totalCancelled} cancelled event${totalCancelled === 1 ? '' : 's'}`
        : 'Couldn\'t add anything from that email');

  await notifyUserBySendingEmail(user, {
    subject: subjectLine,
    text: lines.join('\n') + '\n\n— SportsCal',
  });

  console.log(
    `[inbound] user=${user.id} invite_added=${inviteSummary.added.length}` +
    ` invite_updated=${inviteSummary.updated.length}` +
    ` invite_cancelled=${inviteSummary.cancelled.length}` +
    ` url_created=${urlCreated.length} url_failed=${urlFailed.length}` +
    ` from=${fromAddr}`,
  );
  res.status(200).json({
    ok: true,
    invites:    { added: inviteSummary.added.length, updated: inviteSummary.updated.length, cancelled: inviteSummary.cancelled.length },
    urls:       { created: urlCreated.length, failed: urlFailed.length },
  });
});

export default router;
