// ============================================================================
// track.js — POST /api/track
//
// A plain log of the steps a signed-in person takes on the way to their
// first calendar (intro shown, which team app they tapped, link pasted,
// photo scanned, …). Signup, calendars and chat messages already live in
// their own tables; this fills in the screens and taps between them, so
// "where do people give up?" can be answered with a query instead of a guess.
//
//   Body: { event: 'snake_case_name', props?: { … small JSON … }, platform?: 'ios'|'web' }
//   204 on success. Never surfaces an error to the app — tracking must not
//   get in a parent's way.
// ============================================================================

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/index.js';

const router = Router();
router.use(requireAuth);

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 400,
  keyGenerator: (req) => `track:${req.user?.id || req.ip}`,
  standardHeaders: false,
  legacyHeaders: false,
  handler: (req, res) => res.status(204).end(),
});

const EVENT_RE = /^[a-z][a-z0-9_]{1,48}$/;

export async function recordOnboardingEvent(userId, event, props = null, platform = null) {
  if (!userId || !EVENT_RE.test(String(event))) return;
  let json = null;
  if (props && typeof props === 'object') {
    const s = JSON.stringify(props);
    if (s.length <= 2000) json = s;
  }
  await query(
    `INSERT INTO onboarding_events (user_id, event, props, platform) VALUES ($1, $2, $3, $4)`,
    [userId, event, json, platform ? String(platform).slice(0, 16) : null],
  );
}

router.post('/', limiter, async (req, res) => {
  const { event, props, platform } = req.body || {};
  try {
    await recordOnboardingEvent(req.user.id, event, props, platform);
  } catch (err) {
    console.error('[track] write failed (non-fatal):', err.message);
  }
  res.status(204).end();
});

export default router;
