// Public self-signup landing for team invites.
//
// Server-rendered HTML, identical pattern to /r/:token (group ride
// requests): the page loads instantly on a phone in a group thread,
// no SPA boot required, no JS needed to submit. The form POSTs to
// the same path; the handler creates a contact in the team owner's
// account and adds it to the team's members list, then redirects
// back here with ?status=joined for the confirmation view.

import { Router, urlencoded } from 'express';
import { query, queryOne, withTransaction } from '../db/index.js';
import { toE164 } from '../lib/sms.js';

const router = Router();
const APP_URL = process.env.FRONTEND_URL || 'https://www.sportscalapp.com';

// urlencoded middleware just for this route — the rest of the API
// is JSON; here we accept browser form submissions.
router.use(urlencoded({ extended: false }));

router.get('/:token', async (req, res) => {
  try {
    const invite = await loadInvite(req.params.token);
    if (!invite) return res.type('html').status(404).send(notFoundPage());

    const status   = String(req.query.status || '');
    const newName  = String(req.query.name   || '');
    const errorMsg = String(req.query.error  || '');

    res
      .type('html')
      .set('Cache-Control', 'no-store')
      .send(renderJoinPage({ invite, status, newName, errorMsg }));
  } catch (err) {
    console.error('[joinTeam] GET error:', err.message);
    res.type('html').status(500).send(errorPage());
  }
});

router.post('/:token', async (req, res) => {
  try {
    const invite = await loadInvite(req.params.token);
    if (!invite) return res.type('html').status(404).send(notFoundPage());

    const name  = String(req.body.name  || '').trim();
    const phone = String(req.body.phone || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!name) {
      return res.redirect(`/join/${req.params.token}?error=name`);
    }

    const normalizedPhone = phone ? (toE164(phone) || phone) : null;
    const normalizedEmail = email || null;

    await withTransaction(async (client) => {
      const { rows: [contact] } = await client.query(
        `INSERT INTO contacts (user_id, name, email, phone)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [invite.user_id, name, normalizedEmail, normalizedPhone]
      );
      await client.query(
        `INSERT INTO team_members (team_id, contact_id)
         VALUES ($1, $2) ON CONFLICT (team_id, contact_id) DO NOTHING`,
        [invite.team_id, contact.id]
      );
    });

    return res.redirect(
      `/join/${req.params.token}?status=joined&name=${encodeURIComponent(name)}`
    );
  } catch (err) {
    console.error('[joinTeam] POST error:', err.message);
    res.redirect(`/join/${req.params.token}?error=server`);
  }
});

// ------------------------------------------------------------------

async function loadInvite(token) {
  return queryOne(
    `SELECT i.id, i.team_id, i.user_id, i.token, i.expires_at, i.revoked_at,
            t.name AS team_name,
            u.name AS owner_name
       FROM team_invites i
       JOIN teams t ON t.id = i.team_id
       JOIN users u ON u.id = i.user_id
      WHERE i.token = $1
        AND i.revoked_at IS NULL
        AND (i.expires_at IS NULL OR i.expires_at > NOW())`,
    [token]
  );
}

function safe(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[c]));
}

function renderJoinPage({ invite, status, newName, errorMsg }) {
  const isJoined = status === 'joined';
  const errorText =
    errorMsg === 'name'   ? 'Please enter your name.'
    : errorMsg === 'server' ? 'Something went wrong. Please try again.'
    : '';

  const body = isJoined
    ? `
      <div class="success">
        <div class="check">✓</div>
        <h2>You're in${newName ? ', ' + safe(newName) : ''}.</h2>
        <p>You've been added to <strong>${safe(invite.team_name)}</strong> on SportsCal.
        ${safe(invite.owner_name)} can now ask the whole group for rides at once
        — when they do, you'll get a text from their phone with a link you can tap
        to claim.</p>
        <p class="small">No SportsCal account required. Close this page when you're done.</p>
      </div>`
    : `
      ${errorText ? `<div class="error">${safe(errorText)}</div>` : ''}
      <p class="prompt">${safe(invite.owner_name)} invited you to join the
      <strong>${safe(invite.team_name)}</strong> group. Add your contact info so
      they can include you in ride coordination.</p>
      <form method="post" action="/join/${safe(invite.token)}">
        <label>Your name <span class="req">*</span>
          <input name="name" type="text" required autofocus
                 placeholder="e.g. Linda Smith" autocomplete="name">
        </label>
        <label>Phone <span class="hint">(so the group can text you for rides)</span>
          <input name="phone" type="tel" placeholder="(503) 555-0100"
                 autocomplete="tel" inputmode="tel">
        </label>
        <label>Email <span class="hint">(optional)</span>
          <input name="email" type="email" placeholder="linda@email.com"
                 autocomplete="email">
        </label>
        <button type="submit">Join the group</button>
        <p class="small">By joining, you agree that ${safe(invite.owner_name)} may
        include your contact info in their SportsCal group for ride coordination.
        You won't receive marketing or promotional messages from SportsCal.</p>
      </form>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex">
  <title>Join ${safe(invite.team_name)} — SportsCal</title>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: rgba(0,0,0,0.05); }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f4f6fa; color: #0f1629;
      min-height: 100vh; padding: 24px 16px env(safe-area-inset-bottom, 24px);
      display: flex; flex-direction: column; align-items: center;
    }
    .brand { font-size: 14px; font-weight: 600; color: #00d68f; margin-bottom: 24px; }
    .card {
      width: 100%; max-width: 440px;
      background: #fff; border-radius: 16px;
      box-shadow: 0 1px 3px rgba(15,22,41,0.06), 0 8px 24px rgba(15,22,41,0.04);
      padding: 28px 24px; border: 1px solid #e8ecf4;
    }
    h1 { font-size: 22px; line-height: 1.25; margin: 0 0 16px; letter-spacing: -0.02em; }
    h2 { font-size: 20px; margin: 0 0 8px; letter-spacing: -0.01em; }
    .prompt { font-size: 14px; color: #4a5670; margin: 0 0 20px; line-height: 1.55; }
    label { display: block; font-size: 13px; color: #4a5670; margin-bottom: 16px; font-weight: 500; }
    .req { color: #ef4444; }
    .hint { color: #8896b0; font-weight: 400; }
    input {
      width: 100%; margin-top: 6px; padding: 12px 14px;
      font-size: 16px; line-height: 1.4; color: #0f1629;
      background: #f4f6fa; border: 1px solid #e8ecf4; border-radius: 10px;
      font-family: inherit;
    }
    input:focus { outline: none; border-color: #00d68f; background: #fff; }
    button[type=submit] {
      width: 100%; padding: 14px; font-size: 16px; font-weight: 600;
      color: #0f1629; background: #00d68f; border: 0; border-radius: 10px;
      cursor: pointer; margin-top: 4px;
    }
    button[type=submit]:hover { background: #00b377; }
    .small { font-size: 12px; color: #8896b0; margin-top: 16px; line-height: 1.55; }
    .error {
      background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c;
      padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px;
    }
    .success { text-align: center; padding: 8px 0; }
    .success .check {
      width: 48px; height: 48px; margin: 0 auto 12px;
      background: #00d68f; color: #fff;
      border-radius: 50%; font-size: 28px; line-height: 48px;
    }
    .success p { font-size: 14px; color: #4a5670; line-height: 1.55; margin: 8px 0; }
    .footer { font-size: 12px; color: #8896b0; margin-top: 20px; text-align: center; }
    .footer a { color: #00b377; text-decoration: none; }
  </style>
</head>
<body>
  <div class="brand">SportsCal</div>
  <div class="card">
    <h1>${isJoined ? 'Welcome' : 'Join ' + safe(invite.team_name)}</h1>
    ${body}
  </div>
  <div class="footer">
    <a href="${APP_URL}">sportscalapp.com</a>
  </div>
</body>
</html>`;
}

function notFoundPage() {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SportsCal</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f4f6fa;color:#0f1629;padding:48px 24px;text-align:center;}h1{font-size:20px;margin-bottom:8px}p{color:#4a5670;font-size:14px;line-height:1.55}</style>
</head>
<body><h1>Invite not found</h1><p>This invite link is invalid, expired, or has been revoked. Ask the person who shared it for a fresh link.</p></body></html>`;
}

function errorPage() {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SportsCal</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f4f6fa;color:#0f1629;padding:48px 24px;text-align:center;}h1{font-size:20px;margin-bottom:8px}p{color:#4a5670;font-size:14px}</style>
</head>
<body><h1>Something went wrong</h1><p>Please try the link again in a moment.</p></body></html>`;
}

export default router;
