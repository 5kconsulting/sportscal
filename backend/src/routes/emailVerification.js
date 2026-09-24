import { Router } from 'express';
import crypto from 'crypto';
import { Resend } from 'resend';
import { query, queryOne, getUserById } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { verifyEmail } from '../emails/templates.js';

const router = Router();
const resend  = new Resend(process.env.RESEND_API_KEY);
const FROM    = `${process.env.EMAIL_FROM_NAME || 'SportsCal'} <${process.env.EMAIL_FROM || 'noreply@mail.sportscalapp.com'}>`;
const APP_URL = process.env.FRONTEND_URL || 'https://www.sportscalapp.com';

// ============================================================
// GET /api/auth/verify-email?token=...
// Verifies email and marks user as verified
// ============================================================
router.get('/verify-email', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.redirect(`${APP_URL}/login?verify=missing`);
  }

  const user = await queryOne(
    `SELECT * FROM users WHERE verification_token = $1`,
    [token]
  );

  if (!user) {
    // Token didn't match any user. Historically we cleared the token on
    // first successful verify, so a repeat click (Gmail link scanner
    // consuming it first, user tapping twice, back button, etc.) landed
    // here as "invalid_token" — indistinguishable to the user from a
    // truly broken link. Route those to a friendly login page hint
    // instead of a scary error state.
    return res.redirect(`${APP_URL}/login?verify=used`);
  }

  // Mark verified but DON'T clear the token: a re-click of the same
  // magic link now stays idempotent and lands cleanly on the dashboard.
  // The token is a bearer secret; keeping it around is harmless because
  // the endpoint only sets email_verified from true→true on re-verify.
  // A subsequent /resend-verification call overwrites the column with
  // a new token, invalidating the old link.
  if (!user.email_verified) {
    await query(
      `UPDATE users SET email_verified = true WHERE id = $1`,
      [user.id]
    );
  }

  return res.redirect(`${APP_URL}/dashboard?verified=1`);
});

// ============================================================
// POST /api/auth/resend-verification
// Resends verification email to logged-in user
// ============================================================
router.post('/resend-verification', requireAuth, async (req, res) => {
  const user = await getUserById(req.user.id);

  if (user.email_verified) {
    return res.json({ ok: true, message: 'Email already verified.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  await query(
    `UPDATE users SET verification_token = $1 WHERE id = $2`,
    [token, user.id]
  );

  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${token}`;

  try {
    const { subject, html, text } = verifyEmail(user, verifyUrl);
    await resend.emails.send({ from: FROM, to: user.email, subject, html, text });
  } catch (err) {
    console.error('[verify] email send error:', err.message);
    return res.status(500).json({ error: 'Failed to send verification email.' });
  }

  res.json({ ok: true, message: 'Verification email sent.' });
});

// ============================================================
// Send verification email helper (called from auth.js on signup).
// The HTML/text/subject all live in emails/templates.js so the
// verification email inherits the shared header (real logo mark)
// and stays consistent with welcome / digest / reminder styling.
// ============================================================
export async function sendVerificationEmail(user) {
  const token = crypto.randomBytes(32).toString('hex');

  await query(
    `UPDATE users SET verification_token = $1 WHERE id = $2`,
    [token, user.id]
  );

  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${token}`;
  const { subject, html, text } = verifyEmail(user, verifyUrl);
  await resend.emails.send({ from: FROM, to: user.email, subject, html, text });
}

export default router;
