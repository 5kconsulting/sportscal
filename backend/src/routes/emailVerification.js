import { Router } from 'express';
import crypto from 'crypto';
import { Resend } from 'resend';
import { query, queryOne, getUserById } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

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
    await resend.emails.send({
      from: FROM,
      to:   user.email,
      subject: 'Verify your SportsCal email',
      html: buildVerifyEmail(user.name, verifyUrl),
      text: `Hi ${user.name},\n\nVerify your email here:\n${verifyUrl}\n\nSportsCal`,
    });
  } catch (err) {
    console.error('[verify] email send error:', err.message);
    return res.status(500).json({ error: 'Failed to send verification email.' });
  }

  res.json({ ok: true, message: 'Verification email sent.' });
});

// ============================================================
// Send verification email helper (called from auth.js on signup)
// ============================================================
export async function sendVerificationEmail(user) {
  const token = crypto.randomBytes(32).toString('hex');

  await query(
    `UPDATE users SET verification_token = $1 WHERE id = $2`,
    [token, user.id]
  );

  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${token}`;

  await resend.emails.send({
    from: FROM,
    to:   user.email,
    subject: 'Verify your SportsCal email',
    html: buildVerifyEmail(user.name, verifyUrl),
    text: `Hi ${user.name},\n\nVerify your SportsCal email here:\n${verifyUrl}\n\nSportsCal`,
  });
}

function buildVerifyEmail(name, verifyUrl) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#fff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#2563EB;padding:24px 32px;">
          <span style="font-size:16px;font-weight:600;color:#fff;letter-spacing:-0.02em;">SportsCal</span>
        </td></tr>
        <tr><td style="padding:36px 32px;">
          <p style="margin:0 0 8px;font-size:22px;font-weight:600;color:#0F172A;letter-spacing:-0.02em;">Verify your email</p>
          <p style="margin:0 0 28px;font-size:15px;color:#64748B;line-height:1.6;">
            Hi ${name}, thanks for signing up! Click the button below to verify your email address.
          </p>
          <p style="text-align:center;margin:0 0 28px;">
            <a href="${verifyUrl}"
               style="display:inline-block;background:#D97706;color:#ffffff !important;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;text-decoration:none;border:2px solid #D97706;">
              Verify my email
            </a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;color:#64748B;line-height:1.6;">
            If you didn't create a SportsCal account, you can safely ignore this email.
          </p>
          <p style="margin:16px 0 0;font-size:12px;color:#b8c4d8;word-break:break-all;">
            Or copy this link: ${verifyUrl}
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #F8FAFC;">
          <p style="margin:0;font-size:12px;color:#b8c4d8;text-align:center;">SportsCal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export default router;
