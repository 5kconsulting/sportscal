// ============================================================
// One-click unsubscribe links for tips / welcome-series email.
//
// The link carries the user id plus an HMAC of it, so it works without
// signing in (mail apps' "Unsubscribe" button can't sign in) and can't
// be forged for someone else's account. Keyed on JWT_SECRET: rotating
// that secret also invalidates old unsubscribe links, which is fine —
// every email carries a fresh one.
// ============================================================

import crypto from 'node:crypto';

const API_BASE = process.env.FRONTEND_URL || 'https://sportscalapp.com';

function sign(userId) {
  return crypto
    .createHmac('sha256', process.env.JWT_SECRET || '')
    .update(`tips-unsubscribe:${userId}`)
    .digest('base64url')
    .slice(0, 32);
}

export function tipsUnsubscribeUrl(userId) {
  return `${API_BASE}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${sign(userId)}`;
}

export function verifyTipsUnsubscribe(userId, token) {
  if (typeof userId !== 'string' || typeof token !== 'string') return false;
  const expected = Buffer.from(sign(userId));
  const got = Buffer.from(token);
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}
