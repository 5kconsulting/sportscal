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
      // Forward attachments so the backend can pick up .ics invites from
      // Google/Apple/Outlook calendar guest invites — the "add this single
      // event to my SportsCal" pattern. Cap at ~2MB total to keep the JSON
      // payload reasonable; .ics attachments are typically <10KB.
      attachments:   serializeAttachments(parsed.attachments),
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
      // Network / DNS error reaching the backend (e.g. Railway is mid-deploy).
      // Use setReject so the sender's mail server retries instead of marking
      // the message permanently delivered. Tradeoff: prolonged backend
      // outages eventually bounce mail back to the sender, which is loud but
      // recoverable. Silent loss is worse — that's how we lost two PDFs the
      // night this fix shipped.
      console.error('[inbound-mail] fetch failed (setReject for retry):', err && err.message);
      message.setReject('SportsCal backend is temporarily unreachable; please retry');
      return;
    }

    // 5xx from the backend is the same shape as a connection failure from
    // the sender's perspective: try again later. 4xx (auth/validation) is
    // our problem — accept and log so we can debug without bouncing the
    // sender. 2xx is the happy path.
    if (res.status >= 500) {
      const body = await res.text().catch(() => '');
      console.error(
        '[inbound-mail] backend 5xx (setReject for retry):',
        res.status, body.slice(0, 500),
      );
      message.setReject(`SportsCal backend error ${res.status}; please retry`);
      return;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(
        '[inbound-mail] backend 4xx (accepting at SMTP, debug server-side):',
        res.status, body.slice(0, 500),
      );
      // Don't reject 4xx — config bugs on our side shouldn't bounce the
      // parent's email. Logged for our side to fix.
    }
  },
};

// postal-mime hands attachments back as { filename, mimeType, content (ArrayBuffer
// or Uint8Array), disposition, ... }. We base64-encode for JSON transport and cap
// total payload to ~2MB. .ics files are tiny (<10KB typical); the cap is just a
// safety net for surprise inline images.
const MAX_ATTACHMENT_TOTAL_BYTES = 2 * 1024 * 1024;

function serializeAttachments(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const out = [];
  let total = 0;
  for (const a of list) {
    const bytes = a.content instanceof Uint8Array
      ? a.content
      : new Uint8Array(a.content || new ArrayBuffer(0));
    if (total + bytes.byteLength > MAX_ATTACHMENT_TOTAL_BYTES) {
      console.warn('[inbound-mail] attachment cap reached; dropping rest');
      break;
    }
    total += bytes.byteLength;
    out.push({
      filename:     a.filename     || '',
      mime_type:    a.mimeType     || 'application/octet-stream',
      disposition:  a.disposition  || null,
      size:         bytes.byteLength,
      content_b64:  uint8ToBase64(bytes),
    });
  }
  return out;
}

// Workers don't have Node's Buffer; btoa expects a binary string. Build one in
// 32K chunks to avoid blowing the call stack with String.fromCharCode.apply.
function uint8ToBase64(u8) {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
  }
  return btoa(s);
}
