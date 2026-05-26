import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { Expo } from 'expo-server-sdk';

import {
  upsertPushToken,
  deletePushToken,
  setUserPushEnabled,
} from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// ============================================================
// POST /api/push-tokens
// Body: { token, platform }
//
// Called by the mobile app on launch (and on permission grant) with
// the Expo push token returned by Notifications.getExpoPushTokenAsync.
// We upsert because the same token may bounce between users on a
// shared device. Flips push_enabled=true on the user — that's the
// "Default ON post-permission" design: the iOS permission ask IS the
// opt-in, no second toggle.
// ============================================================
router.post('/',
  body('token').isString().notEmpty().custom((v) => {
    if (!Expo.isExpoPushToken(v)) throw new Error('Not a valid Expo push token');
    return true;
  }),
  body('platform').isIn(['ios', 'android']),
  async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

    const { token, platform } = req.body;
    await upsertPushToken({ userId: req.user.id, token, platform });
    await setUserPushEnabled(req.user.id, true);
    res.json({ ok: true });
  }
);

// ============================================================
// DELETE /api/push-tokens/:token
// Called on explicit sign-out so the device stops receiving pushes
// targeted at the previous account. URL-encoded because Expo tokens
// contain '[' and ']'.
// ============================================================
router.delete('/:token', async (req, res) => {
  await deletePushToken(req.params.token);
  res.json({ ok: true });
});

export default router;
