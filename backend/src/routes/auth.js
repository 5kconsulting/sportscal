import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { Resend } from 'resend';

import {
  getUserByEmail,
  createUser,
  updateUser,
  rotateFeedToken,
  getUserById,
  ensureInboundToken,
  query,
} from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { welcomeEmail } from '../emails/templates.js';
import { sendVerificationEmail } from './emailVerification.js';

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);


// Tight rate limit on auth endpoints to prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts — try again in 15 minutes' },
  keyGenerator: (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip,
  skip: (req) => process.env.NODE_ENV === 'development',
});

// ============================================================
// POST /api/auth/signup
// ============================================================
router.post('/signup',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('sms_consent').optional().isBoolean(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const { email, password, name, referral_source, sms_consent } = req.body;

    const existing = await getUserByEmail(email);
    if (existing) {
      return res.status(422).json({ errors: [{ msg: 'Invalid email or password' }] });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    // Capture SMS consent at the moment of agreement: timestamp + IP.
    // This is the parent's direct consent record for A2P 10DLC.
    const smsConsented = sms_consent === true || sms_consent === 'true';
    const consentIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || null;
    const user = await createUser({
      email, passwordHash, name,
      referralSource: referral_source?.trim().slice(0, 100) || null,
      smsConsentAt: smsConsented ? new Date() : null,
      smsConsentIp: smsConsented ? consentIp : null,
    });

    // Send welcome + verification emails (non-blocking)
    if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 're_xxxxxxxxxxxx') {
      const { subject, html, text } = welcomeEmail(user);
      resend.emails.send({
        from: `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM}>`,
        to:   user.email,
        subject,
        html,
        text,
      }).catch(err => console.error('[auth] welcome email failed:', err.message));

      sendVerificationEmail(user)
        .catch(err => console.error('[auth] verification email failed:', err.message));
    }

    const token = signToken(user.id);

    res.status(201).json({
      token,
      user: safeUser(user),
    });
  }
);

// ============================================================
// POST /api/auth/login
// ============================================================
router.post('/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const user = await getUserByEmail(email);

    // Always run bcrypt compare to prevent timing attacks
    const validPassword = user
      ? await bcrypt.compare(password, user.password_hash)
      : await bcrypt.compare(password, '$2b$12$invalidhashpadding000000000000000');

    if (!user || !validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user.id);

    res.json({
      token,
      user: safeUser(user),
    });
  }
);

// ============================================================
// GET /api/auth/me
// ============================================================
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: safeUser(req.user) });
});

// ============================================================
// PATCH /api/auth/me  — update name, timezone, digest prefs
// ============================================================
router.patch('/me',
  requireAuth,
  [
    body('name').optional().trim().notEmpty(),
    body('timezone').optional().isString(),
    body('digest_enabled').optional().isBoolean(),
    body('digest_day').optional().isInt({ min: 0, max: 6 }),
    body('digest_hour').optional().isInt({ min: 0, max: 23 }),
    body('reminder_hours_before').optional().isInt({ min: 1, max: 72 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const allowed = [
      'name', 'timezone', 'digest_enabled',
      'digest_day', 'digest_hour', 'reminder_hours_before',
    ];
    const fields = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    );

    const updated = await updateUser(req.user.id, fields);
    res.json({ user: safeUser(updated) });
  }
);

// ============================================================
// POST /api/auth/rotate-feed-token
// User requested a new .ics feed URL
// ============================================================
router.post('/rotate-feed-token', requireAuth, async (req, res) => {
  const result = await rotateFeedToken(req.user.id);
  res.json({ feed_token: result.feed_token });
});

// ============================================================
// GET /api/auth/inbound-address
// Returns the user's per-account inbound mail address. Lazily generates
// the inbound_token on first call so existing accounts don't all get
// addresses they didn't ask for.
//
// INBOUND_DOMAIN env var configures the host (default 'inbox.sportscalapp.com').
// Plus-addressing keeps the lookup O(1) — Resend's `to` field carries
// `add+<token>@<domain>` and the webhook strips the +<token> piece.
// ============================================================
router.get('/inbound-address', requireAuth, async (req, res) => {
  try {
    const token = await ensureInboundToken(req.user.id);
    if (!token) {
      return res.status(500).json({ error: 'Could not generate inbound address' });
    }
    const domain  = process.env.INBOUND_DOMAIN || 'inbox.sportscalapp.com';
    const address = `add+${token}@${domain}`;
    res.json({ address, token, configured: !!process.env.RESEND_WEBHOOK_SECRET });
  } catch (err) {
    console.error('[auth/inbound-address] error:', err.message);
    res.status(500).json({ error: 'Failed to load inbound address' });
  }
});

// ============================================================
// DELETE /api/auth/delete-account
// Permanently deletes user account and all associated data.
// Cancels Stripe subscription if applicable.
// ============================================================
router.delete('/delete-account', requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Cancel Stripe subscription if premium
    if (user.stripe_subscription_id) {
      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        await stripe.subscriptions.cancel(user.stripe_subscription_id);
        console.log(`[auth] cancelled Stripe subscription for ${user.email}`);
      } catch (err) {
        console.error('[auth] Stripe cancellation error:', err.message);
        // Continue with deletion even if Stripe fails
      }
    }

    // Delete user — cascades to kids, sources, events, tokens
    await query(`DELETE FROM users WHERE id = $1`, [req.user.id]);
    console.log(`[auth] deleted account: ${user.email}`);

    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] delete account error:', err.message);
    res.status(500).json({ error: 'Failed to delete account. Please contact support.' });
  }
});

// ============================================================
// Helpers
// ============================================================
function signToken(userId) {
  return jwt.sign(
    { sub: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// Strip sensitive fields before sending to client
function safeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

export default router;
