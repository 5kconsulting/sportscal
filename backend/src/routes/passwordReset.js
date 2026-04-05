import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { Resend } from 'resend';
import { getUserByEmail, getUserById, query, queryOne } from '../db/index.js';

const router  = Router();
const resend  = new Resend(process.env.RESEND_API_KEY);
const FROM    = `${process.env.EMAIL_FROM_NAME || 'SportsCal'} <${process.env.EMAIL_FROM || 'noreply@mail.sportscalapp.com'}>`;
const APP_URL = process.env.FRONTEND_URL || 'https://www.sportscalapp.com';

// Tight rate limit — prevent abuse
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many reset attempts. Try again in 15 minutes.' },
});

// ============================================================
// POST /api/auth/forgot-password
// Sends a reset email if the address exists.
// Always returns 200 — never reveal whether email exists.
// ============================================================
router.post('/forgot-password',
  resetLimiter,
  [body('email').isEmail().normalizeEmail()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    // Always respond with success regardless of whether email exists
    res.json({ ok: true, message: 'If that email exists you will receive a reset link shortly.' });

    // Do the actual work after responding (fire and forget)
    try {
      const user = await getUserByEmail(req.body.email);
      if (!user) return; // silent — don't reveal non-existence

      // Generate a secure random token
      const token     = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Invalidate any existing unused tokens for this user
      await query(
        `DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL`,
        [user.id]
      );

      // Store hashed token
      await query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, tokenHash, expiresAt]
      );

      const resetUrl = `${APP_URL}/reset-password?token=${token}`;

      await resend.emails.send({
        from: FROM,
        to:   user.email,
        subject: 'Reset your SportsCal password',
        html: buildResetEmail(user.name, resetUrl),
        text: `Hi ${user.name},\n\nReset your password here:\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.\n\nSportsCal`,
      });
    } catch (err) {
      console.error('[auth] forgot-password error:', err.message);
    }
  }
);

// ============================================================
// POST /api/auth/reset-password
// Validates token and sets new password.
// ============================================================
router.post('/reset-password',
  resetLimiter,
  [
    body('token').notEmpty(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const { token, password } = req.body;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find valid unused token
    const resetToken = await queryOne(
      `SELECT * FROM password_reset_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()`,
      [tokenHash]
    );

    if (!resetToken) {
      return res.status(400).json({
        error: 'This reset link is invalid or has expired. Please request a new one.',
      });
    }

    // Update password
    const passwordHash = await bcrypt.hash(password, 12);
    await query(
      `UPDATE users SET password_hash = $1 WHERE id = $2`,
      [passwordHash, resetToken.user_id]
    );

    // Mark token as used
    await query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`,
      [resetToken.id]
    );

    res.json({ ok: true, message: 'Password updated successfully. You can now sign in.' });
  }
);

// ============================================================
// Reset email HTML
// ============================================================
function buildResetEmail(name, resetUrl) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#fff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#0f1629;padding:24px 32px;">
          <span style="font-size:16px;font-weight:600;color:#fff;letter-spacing:-0.02em;">SportsCal</span>
        </td></tr>
        <tr><td style="padding:36px 32px;">
          <p style="margin:0 0 8px;font-size:22px;font-weight:600;color:#0f1629;letter-spacing:-0.02em;">Reset your password</p>
          <p style="margin:0 0 28px;font-size:15px;color:#8896b0;line-height:1.6;">
            Hi ${name}, we received a request to reset your SportsCal password. Click the button below to choose a new one.
          </p>
          <p style="text-align:center;margin:0 0 28px;">
            <a href="${resetUrl}"
               style="display:inline-block;background:#00d68f;color:#0f1629;font-weight:600;font-size:15px;padding:14px 32px;border-radius:8px;text-decoration:none;">
              Reset my password
            </a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;color:#8896b0;line-height:1.6;">
            This link expires in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email — your password won't change.
          </p>
          <p style="margin:16px 0 0;font-size:12px;color:#b8c4d8;word-break:break-all;">
            Or copy this link: ${resetUrl}
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #f4f6fa;">
          <p style="margin:0;font-size:12px;color:#b8c4d8;text-align:center;">SportsCal · hello@sportscalapp.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export default router;
