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
} from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { welcomeEmail } from '../emails/templates.js';

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);

const router = Router();

// Tight rate limit on auth endpoints to prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts — try again in 15 minutes' },
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
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const { email, password, name } = req.body;

    const existing = await getUserByEmail(email);
    if (existing) {
      // Don't reveal whether the email exists — return same error
      return res.status(422).json({ errors: [{ msg: 'Invalid email or password' }] });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await createUser({ email, passwordHash, name });

    // Send welcome email (non-blocking — don't fail signup if email fails)
    if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 're_xxxxxxxxxxxx') {
      const { subject, html, text } = welcomeEmail(user);
      resend.emails.send({
        from: `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM}>`,
        to:   user.email,
        subject,
        html,
        text,
      }).catch(err => console.error('[auth] welcome email failed:', err.message));
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
