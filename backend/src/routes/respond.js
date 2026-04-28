// Public landing page for team ride requests.
//
// The team-request flow sends a group iMessage with a single short
// link of the form https://sportscalapp.com/r/<token>. Any parent
// taps that link, lands here, and sees event details + a button per
// pending team member ("I'm Linda — I'll do it"). The button links
// to the existing /api/logistics/offer/<their-token>/confirmed
// endpoint which atomically claims the offer (first wins, others
// get superseded in the same DB transaction).
//
// Pure server-rendered HTML so it loads instantly on a phone in a
// group thread — no React boot, no JS required to claim.

import { Router } from 'express';
import { query, queryOne } from '../db/index.js';

const router = Router();

const APP_URL = process.env.FRONTEND_URL || 'https://www.sportscalapp.com';

router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Resolve the token to its offer to find the batch's
    // (event_id, role). The token itself can be any one of the
    // per-parent tokens — they all point at the same request.
    const seed = await queryOne(
      `SELECT id, event_id, role FROM event_logistics_offers WHERE token = $1`,
      [token]
    );
    if (!seed) {
      return res.type('html').status(404).send(notFoundPage());
    }

    // Fetch every offer for this batch (any status), the event,
    // and the parent's name in one round-trip.
    const offers = await query(
      `SELECT
         o.id, o.token, o.status, o.contact_id, o.resolved_at,
         c.name AS contact_name
       FROM event_logistics_offers o
       JOIN contacts c ON c.id = o.contact_id
      WHERE o.event_id = $1 AND o.role = $2
      ORDER BY c.name`,
      [seed.event_id, seed.role]
    );
    const event = await queryOne(
      `SELECT e.id, e.display_title, e.starts_at, e.ends_at, e.location, e.all_day,
              u.name AS parent_name
         FROM events e
         JOIN users u ON u.id = e.user_id
        WHERE e.id = $1`,
      [seed.event_id]
    );
    if (!event) {
      return res.type('html').status(404).send(notFoundPage());
    }

    const winner  = offers.find(o => o.status === 'confirmed');
    const pending = offers.filter(o => o.status === 'pending');

    return res
      .type('html')
      .set('Cache-Control', 'no-store')   // never cache; status changes per click
      .send(renderRespondPage({ event, role: seed.role, winner, pending }));
  } catch (err) {
    console.error('[respond] error:', err.message);
    return res.type('html').status(500).send(errorPage());
  }
});

// ------------------------------------------------------------------
// HTML rendering
// ------------------------------------------------------------------

function renderRespondPage({ event, role, winner, pending }) {
  const action = role === 'pickup' ? 'pick up' : 'drop off';
  const kid    = (event.display_title || '').split('—')[0].trim();
  const eventName = event.display_title.includes('—')
    ? event.display_title.split('—').slice(1).join('—').trim()
    : event.display_title;
  const startsAt = new Date(event.starts_at);
  const dateStr  = startsAt.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  const timeStr  = event.all_day
    ? 'All day'
    : startsAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const safe = (s) => String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[c]));

  // Body: either "claimed by X" state, or the per-parent button list.
  let body;
  if (winner) {
    body = `
      <div class="claimed">
        <div class="check">✓</div>
        <h2>${safe(winner.contact_name)} has it</h2>
        <p>${safe(winner.contact_name)} confirmed the ${safe(role)}
        ${winner.resolved_at
          ? safe(timeAgo(winner.resolved_at))
          : ''
        }. ${safe(event.parent_name)} has been notified.</p>
      </div>`;
  } else if (!pending.length) {
    body = `
      <div class="claimed">
        <p>This request has expired or been superseded.</p>
      </div>`;
  } else {
    const buttons = pending.map(o => `
      <a class="claim-btn" href="${APP_URL}/api/logistics/offer/${safe(o.token)}/confirmed">
        I'm ${safe(o.contact_name.split(' ')[0])} — I'll ${safe(action)}
      </a>`).join('');
    body = `
      <p class="prompt">Tap your name to claim. First to tap wins; everyone else gets locked out.</p>
      <div class="buttons">${buttons}</div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex">
  <title>SportsCal · ${safe(role)} for ${safe(kid)}</title>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: rgba(0,0,0,0.05); }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f4f6fa; color: #0f1629;
      min-height: 100vh; padding: 24px 16px env(safe-area-inset-bottom, 24px);
      display: flex; flex-direction: column; align-items: center;
    }
    .brand { font-size: 14px; font-weight: 600; color: #00d68f; letter-spacing: -0.01em; margin-bottom: 24px; }
    .card {
      width: 100%; max-width: 440px;
      background: #fff; border-radius: 16px;
      box-shadow: 0 1px 3px rgba(15,22,41,0.06), 0 8px 24px rgba(15,22,41,0.04);
      padding: 28px 24px; border: 1px solid #e8ecf4;
    }
    h1 { font-size: 22px; line-height: 1.25; margin: 0 0 8px; letter-spacing: -0.02em; }
    h1 .ask { color: #4a5670; font-weight: 500; }
    h2 { font-size: 18px; margin: 0 0 4px; letter-spacing: -0.01em; }
    .meta { font-size: 14px; color: #4a5670; margin: 4px 0; }
    .meta strong { color: #0f1629; font-weight: 500; }
    .divider { height: 1px; background: #e8ecf4; margin: 18px 0; }
    .prompt { font-size: 13px; color: #4a5670; margin: 0 0 14px; line-height: 1.5; }
    .buttons { display: flex; flex-direction: column; gap: 8px; }
    .claim-btn {
      display: block; padding: 14px 16px;
      background: #00d68f; color: #0f1629;
      text-decoration: none; font-weight: 600; font-size: 15px;
      border-radius: 10px; text-align: center;
      transition: background 0.15s, transform 0.05s;
    }
    .claim-btn:hover { background: #00b377; }
    .claim-btn:active { transform: scale(0.98); }
    .claimed { text-align: center; padding: 8px 0; }
    .claimed .check {
      width: 48px; height: 48px; margin: 0 auto 12px;
      background: #00d68f; color: #fff;
      border-radius: 50%; font-size: 28px; line-height: 48px;
    }
    .claimed p { font-size: 14px; color: #4a5670; margin: 6px 0 0; line-height: 1.55; }
    .footer { font-size: 12px; color: #8896b0; margin-top: 20px; text-align: center; }
    .footer a { color: #00b377; text-decoration: none; }
  </style>
</head>
<body>
  <div class="brand">SportsCal</div>
  <div class="card">
    <h1><span class="ask">Can someone ${safe(action)}</span> ${safe(kid)}?</h1>
    <div class="meta"><strong>${safe(eventName)}</strong></div>
    <div class="meta">📅 ${safe(dateStr)}${event.all_day ? '' : ' · ' + safe(timeStr)}</div>
    ${event.location ? `<div class="meta">📍 ${safe(event.location)}</div>` : ''}
    <div class="divider"></div>
    ${body}
  </div>
  <div class="footer">
    Sent via <a href="${APP_URL}">sportscalapp.com</a> on behalf of ${safe(event.parent_name)}.
  </div>
</body>
</html>`;
}

function notFoundPage() {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SportsCal</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f4f6fa;color:#0f1629;padding:48px 24px;text-align:center;}h1{font-size:20px;margin-bottom:8px}p{color:#4a5670;font-size:14px}</style>
</head>
<body><h1>Request not found</h1><p>This link may have expired or been superseded by a newer request.</p></body></html>`;
}

function errorPage() {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SportsCal</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f4f6fa;color:#0f1629;padding:48px 24px;text-align:center;}h1{font-size:20px;margin-bottom:8px}p{color:#4a5670;font-size:14px}</style>
</head>
<body><h1>Something went wrong</h1><p>Please try the link again or contact ${APP_URL.replace(/^https?:\/\//, '')} for help.</p></body></html>`;
}

function timeAgo(ts) {
  const ms = Date.now() - new Date(ts).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1)   return 'just now';
  if (min < 60)  return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)   return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const d = Math.floor(hr / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export default router;
