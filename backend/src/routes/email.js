// ============================================================
// /api/email — public, link-authenticated email endpoints.
//
// GET  /api/email/unsubscribe?u=<userId>&t=<hmac>   footer link
// POST /api/email/unsubscribe?u=<userId>&t=<hmac>   RFC 8058 one-click
//      (Gmail / Apple Mail "Unsubscribe" button, via List-Unsubscribe-Post)
//
// Turns off tips / welcome-series email only. The weekly digest, account
// email and replies to forwarded mail keep coming.
// ============================================================

import { Router } from 'express';
import { setTipsOptedOut } from '../db/index.js';
import { verifyTipsUnsubscribe } from '../lib/unsubscribe.js';

const router = Router();
const BASE_URL = process.env.FRONTEND_URL || 'https://sportscalapp.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function unsubscribe(req) {
  const { u, t } = req.query;
  if (!UUID.test(String(u || '')) || !verifyTipsUnsubscribe(String(u), String(t || ''))) return false;
  await setTipsOptedOut(String(u));
  return true;
}

function page(title, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · SportsCal</title></head>
<body style="margin:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0F172A;">
<div style="max-width:440px;margin:15vh auto 0;padding:32px 24px;background:#fff;border-radius:12px;">
<h1 style="margin:0 0 12px;font-size:20px;">${title}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155;">${body}</p>
<a href="${BASE_URL}" style="font-size:14px;font-weight:600;color:#2563EB;text-decoration:none;">Back to SportsCal →</a>
</div></body></html>`;
}

router.get('/unsubscribe', async (req, res) => {
  const ok = await unsubscribe(req).catch(() => false);
  res.status(ok ? 200 : 400).type('html').send(ok
    ? page("You're unsubscribed", "We won't send you any more tips or feature emails. Your weekly digest, account emails and replies to things you forward aren't affected.")
    : page('That link didn’t work', 'It may have been cut off by your mail app. Reply to any SportsCal email and we’ll take you off the list by hand.'));
});

router.post('/unsubscribe', async (req, res) => {
  const ok = await unsubscribe(req).catch(() => false);
  res.status(ok ? 200 : 400).json({ ok });
});

export default router;
