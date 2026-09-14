import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';

import {
  getHouseholdForUser,
  getHouseholdMembers,
  createHouseholdInvite,
  getHouseholdInviteByToken,
  listHouseholdInvites,
  revokeHouseholdInvite,
  redeemHouseholdInvite,
  removeHouseholdMember,
} from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { enqueueHouseholdInvite } from '../workers/queue.js';

const router = Router();

// Feature flag — while HOUSEHOLD_INVITES_ENABLED is not "true"
// in the environment, the write endpoints refuse. Read endpoints
// stay on so the Settings UI can still show current membership
// (households of one, post-backfill).
function requireInvitesEnabled(_req, res, next) {
  if (process.env.HOUSEHOLD_INVITES_ENABLED === 'true') return next();
  return res.status(403).json({ error: 'Household invites are not enabled yet.' });
}

// ============================================================
// PUBLIC — GET /household/invites/:token
// Preview page fetches this to show "Jane invited you to the Smith
// family" before the user signs in. No auth: the token IS the auth.
// ============================================================
router.get('/invites/:token',
  [param('token').isHexadecimal().isLength({ min: 32, max: 32 })],
  async (req, res) => {
    if (!validationResult(req).isEmpty()) {
      return res.status(422).json({ error: 'Bad token' });
    }
    const invite = await getHouseholdInviteByToken(req.params.token);
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.redeemed_at) return res.status(410).json({ error: 'This invite has already been used.' });
    if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'This invite has expired.' });

    // Only ship the non-sensitive fields — no household_id, no email.
    res.json({
      invite: {
        household_name:  invite.household_name,
        invited_by_name: invite.invited_by_name,
        expires_at:      invite.expires_at,
      },
    });
  }
);

// Everything below requires auth.
router.use(requireAuth);

// ============================================================
// GET /api/household/members
// Always safe — post-backfill every user is in a household. The
// UI shows the invite button only when `invites_enabled` is true.
// ============================================================
router.get('/members', async (req, res) => {
  const invitesEnabled = process.env.HOUSEHOLD_INVITES_ENABLED === 'true';
  const [household, members] = await Promise.all([
    getHouseholdForUser(req.user.id),
    getHouseholdMembers(req.user.id),
  ]);
  const pending_invites = invitesEnabled && household
    ? await listHouseholdInvites(household.id)
    : [];
  res.json({
    household,
    members,
    pending_invites,
    invites_enabled: invitesEnabled,
    max_members: 2,
  });
});

// ============================================================
// POST /api/household/invites
// Create an invite token and email it. Requires the household
// to have room (v1 cap = 2).
// ============================================================
router.post('/invites',
  requireInvitesEnabled,
  [
    body('email').isEmail().normalizeEmail(),
  ],
  async (req, res) => {
    if (!validationResult(req).isEmpty()) {
      return res.status(422).json({ error: 'Enter a valid email.' });
    }

    const household = await getHouseholdForUser(req.user.id);
    if (!household) return res.status(500).json({ error: 'No household' });

    const members = await getHouseholdMembers(req.user.id);
    if (members.length >= 2) {
      return res.status(409).json({ error: 'Your household already has two members.' });
    }

    const invite = await createHouseholdInvite({
      householdId:   household.id,
      invitedBy:     req.user.id,
      invitedEmail:  req.body.email,
      expiresInDays: 7,
    });

    await enqueueHouseholdInvite({
      inviteToken:   invite.token,
      inviterUserId: req.user.id,
      invitedEmail:  req.body.email,
    });

    res.status(201).json({
      invite: {
        token:         invite.token,
        invited_email: invite.invited_email,
        expires_at:    invite.expires_at,
      },
    });
  }
);

// ============================================================
// POST /api/household/invites/:token/redeem
// Accept an invite. Moves the signed-in user into the inviter's
// household. Their kids/sources come along because they hang off
// user_id, not household_id.
// ============================================================
router.post('/invites/:token/redeem',
  requireInvitesEnabled,
  [param('token').isHexadecimal().isLength({ min: 32, max: 32 })],
  async (req, res) => {
    if (!validationResult(req).isEmpty()) {
      return res.status(422).json({ error: 'Bad token' });
    }
    const result = await redeemHouseholdInvite(req.params.token, req.user.id);
    if (result.error === 'not_found')        return res.status(404).json({ error: 'Invite not found' });
    if (result.error === 'expired')          return res.status(410).json({ error: 'This invite has expired.' });
    if (result.error === 'already_redeemed') return res.status(410).json({ error: 'This invite has already been used.' });
    if (result.error === 'household_full')   return res.status(409).json({ error: 'That household already has two members.' });
    if (result.error === 'already_member')   return res.status(409).json({ error: "You're already in that household." });
    if (result.error) return res.status(500).json({ error: 'Could not accept invite.' });
    res.json({ ok: true });
  }
);

// ============================================================
// DELETE /api/household/invites/:token
// Cancel an unredeemed invite from your own household.
// ============================================================
router.delete('/invites/:token',
  requireInvitesEnabled,
  [param('token').isHexadecimal().isLength({ min: 32, max: 32 })],
  async (req, res) => {
    if (!validationResult(req).isEmpty()) {
      return res.status(422).json({ error: 'Bad token' });
    }
    const household = await getHouseholdForUser(req.user.id);
    const revoked = await revokeHouseholdInvite(req.params.token, household.id);
    if (!revoked) return res.status(404).json({ error: 'Invite not found' });
    res.json({ ok: true });
  }
);

// ============================================================
// DELETE /api/household/members/:user_id
// Kick someone out (or leave yourself). The removed user gets a
// fresh solo household so the one-user-one-household invariant
// holds.
// ============================================================
router.delete('/members/:user_id',
  [param('user_id').isUUID()],
  async (req, res) => {
    if (!validationResult(req).isEmpty()) {
      return res.status(422).json({ error: 'Bad user id' });
    }
    const result = await removeHouseholdMember(req.user.id, req.params.user_id);
    if (result.error === 'not_in_same_household') {
      return res.status(403).json({ error: "You can't remove someone from another household." });
    }
    if (result.error) return res.status(500).json({ error: 'Could not remove member.' });
    res.json({ ok: true });
  }
);

export default router;
