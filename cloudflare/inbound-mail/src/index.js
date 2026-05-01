// =============================================================================
// inbound-mail/src/index.js — Cloudflare Email Worker.
//
// Catches mail addressed to add+<token>@INBOUND_DOMAIN, parses the MIME with
// postal-mime, and POSTs a tiny JSON envelope to the SportsCal backend's
// /api/inbound/mail endpoint. The backend handles user resolution, URL
// extraction, source creation, and confirmation email.
//
// Why this Worker exists
// ----------------------
// Cloudflare's ForwardableEmailMessage hands you envelope metadata + a raw
// MIME ReadableStream — no parsed text/html. We do the MIME parsing here in
// the Worker (in 4ms or so) so the backend just deals with structured JSON.
//
// Bindings (configure via wrangler.toml or the dashboard):
//   INTAKE_URL     URL of the backend route, e.g.
//                  https://sportscal-production.up.railway.app/api/inbound/mail
//   INTAKE_SECRET  shared secret, must match Railway's INBOUND_SECRET
// =============================================================================

import PostalMime from 'postal-mime';

export default {
  /**
   * @param {ForwardableEmailMessage} message
   * @param {{ INTAKE_URL: string, INTAKE_SECRET: string }} env
   * @param {ExecutionContext} ctx
   */
  async email(message, env, ctx) {
    if (!env.INTAKE_URL || !env.INTAKE_SECRET) {
      console.error('[inbound-mail] missing INTAKE_URL or INTAKE_SECRET binding');
      message.setReject('SportsCal inbound mail is not configured');
      return;
    }

    // Parse the raw MIME stream. postal-mime accepts the WHATWG ReadableStream
    // that Cloudflare exposes; no manual buffering needed.
    let parsed;
    try {
      parsed = await PostalMime.parse(message.raw);
    } catch (err) {
      console.error('[inbound-mail] MIME parse failed:', err && err.message);
      // Don't reject — the parent doesn't know what went wrong on our side.
      // Accept the message; backend will get a payload with empty bodies and
      // reply with the standard "couldn't find a calendar link" template.
      parsed = { text: '', html: '', subject: '' };
    }

    const payload = {
      // envelope_to / envelope_from are SMTP-level (the address the routing
      // rule actually matched and the bounce-to). These are what the backend
      // uses to extract the per-user `add+<token>` token, so they must come
      // from message.{to,from}, NOT from MIME headers.
      envelope_to:   message.to   || '',
      envelope_from: message.from || '',
      from:          (parsed.from && parsed.from.address) || message.from || '',
      to:            (parsed.to    || []).map(a => a.address).filter(Boolean),
      subject:       parsed.subject || '',
      text:          parsed.text || '',
      html:          parsed.html || '',
    };

    let res;
    try {
      res = await fetch(env.INTAKE_URL, {
        method: 'POST',
        headers: {
          'Content-Type':    'application/json',
          'X-Intake-Secret': env.INTAKE_SECRET,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      // Network / DNS error reaching the backend. Don't reject the email
      // (sender bounce isn't the right UX for a backend hiccup); log and
      // move on. Cloudflare won't retry.
      console.error('[inbound-mail] fetch failed:', err && err.message);
      return;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[inbound-mail] backend rejected:', res.status, body.slice(0, 500));
      // Same logic — accept the email at the SMTP layer; let the backend's
      // error logging tell the story.
    }
  },
};
