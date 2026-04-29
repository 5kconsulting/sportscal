import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query, queryOne, withTransaction } from '../db/index.js';
import { toE164 } from '../lib/sms.js';

const router = Router();
router.use(requireAuth);

// ============================================================
// GET /api/teams
// List the user's teams with their members joined in. Members
// arrive as a JSON array of { id, name, email, phone,
// sms_consent_status } per team — single round-trip, no N+1.
// ============================================================
router.get('/', async (req, res) => {
  try {
    const teams = await query(
      `SELECT
         t.id, t.name, t.created_at,
         COALESCE(
           (
             SELECT json_agg(
               json_build_object(
                 'id', c.id,
                 'name', c.name,
                 'email', c.email,
                 'phone', c.phone,
                 'sms_consent_status', c.sms_consent_status
               ) ORDER BY c.name
             )
             FROM team_members tm
             JOIN contacts c ON c.id = tm.contact_id
             WHERE tm.team_id = t.id
           ),
           '[]'::json
         ) AS members
       FROM teams t
       WHERE t.user_id = $1
       ORDER BY t.name`,
      [req.user.id]
    );
    res.json({ teams });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/teams
// Create a team. Optionally seed it with members in the same
// request (body: { name, contact_ids: [...] }). Member adds
// silently skip contact_ids that don't belong to the user.
// ============================================================
router.post('/', async (req, res) => {
  try {
    const { name, contact_ids } = req.body;
    if (!name?.trim()) return res.status(422).json({ error: 'Team name is required' });

    const team = await queryOne(
      `INSERT INTO teams (user_id, name) VALUES ($1, $2) RETURNING *`,
      [req.user.id, name.trim()]
    );

    if (Array.isArray(contact_ids) && contact_ids.length) {
      await addMembers(team.id, req.user.id, contact_ids);
    }
    res.status(201).json({ team });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PATCH /api/teams/:id
// Rename a team (only field worth editing for now).
// ============================================================
router.patch('/:id', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(422).json({ error: 'Team name is required' });
    const team = await queryOne(
      `UPDATE teams SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
      [name.trim(), req.params.id, req.user.id]
    );
    if (!team) return res.status(404).json({ error: 'Team not found' });
    res.json({ team });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DELETE /api/teams/:id
// Delete a team. team_members rows cascade. Pending offers tied
// to this team are NOT deleted — we keep the offer rows so any
// outstanding ride request can still be claimed; the team_id FK
// nulls out per the schema's ON DELETE SET NULL.
// ============================================================
router.delete('/:id', async (req, res) => {
  try {
    await query(
      `DELETE FROM teams WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/teams/:id/members
// Add one or more contacts to a team. Body: { contact_ids }.
// Idempotent — duplicate adds are absorbed by the composite PK.
// ============================================================
router.post('/:id/members', async (req, res) => {
  try {
    const { contact_ids } = req.body;
    if (!Array.isArray(contact_ids) || !contact_ids.length) {
      return res.status(422).json({ error: 'contact_ids must be a non-empty array' });
    }
    // Verify the team belongs to this user before mutating.
    const team = await queryOne(
      `SELECT id FROM teams WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!team) return res.status(404).json({ error: 'Team not found' });

    await addMembers(team.id, req.user.id, contact_ids);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/teams/:id/members/bulk
//
// Bulk paste-a-roster flow. Body: { members: [{ name, phone, email }] }
// Creates one contact per member and adds them all to the team in
// a single transaction so a partial failure rolls back cleanly. No
// dedup against existing contacts in v1 — duplicates are rare in
// practice for a fresh team setup, and the parent can clean them
// up from Ride contacts later.
// ============================================================
router.post('/:id/members/bulk', async (req, res) => {
  try {
    const { members } = req.body;
    if (!Array.isArray(members) || !members.length) {
      return res.status(422).json({ error: 'members must be a non-empty array' });
    }
    if (members.length > 100) {
      return res.status(422).json({ error: 'Up to 100 members per upload' });
    }

    const team = await queryOne(
      `SELECT id FROM teams WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!team) return res.status(404).json({ error: 'Team not found' });

    // Normalize phones to E.164 server-side so the inbound webhook
    // lookup matches what Twilio sends (matches POST /api/contacts
    // behavior). Filter out rows with no name — required field.
    const cleaned = members
      .map(m => ({
        name:  String(m.name || '').trim(),
        phone: m.phone ? (toE164(m.phone) || String(m.phone).trim()) : null,
        email: m.email ? String(m.email).trim().toLowerCase() : null,
      }))
      .filter(m => m.name);

    if (!cleaned.length) {
      return res.status(422).json({ error: 'No rows had a name' });
    }

    const result = await withTransaction(async (client) => {
      const contactIds = [];
      for (const m of cleaned) {
        const { rows: [contact] } = await client.query(
          `INSERT INTO contacts (user_id, name, email, phone)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [req.user.id, m.name, m.email, m.phone]
        );
        contactIds.push(contact.id);
      }
      // Single multi-row INSERT for team_members. ON CONFLICT eats
      // dupes (shouldn't happen since these are fresh contacts, but
      // belt-and-suspenders).
      const placeholders = contactIds.map((_, i) => `($1, $${i + 2})`).join(', ');
      await client.query(
        `INSERT INTO team_members (team_id, contact_id) VALUES ${placeholders}
         ON CONFLICT (team_id, contact_id) DO NOTHING`,
        [team.id, ...contactIds]
      );
      return contactIds;
    });

    res.status(201).json({ added: result.length });
  } catch (err) {
    console.error('[teams] bulk error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DELETE /api/teams/:id/members/:contact_id
// ============================================================
router.delete('/:id/members/:contact_id', async (req, res) => {
  try {
    // Authorization happens via the team's user_id check inside
    // the DELETE — no member row gets touched if the team isn't
    // ours.
    await query(
      `DELETE FROM team_members tm
        USING teams t
        WHERE tm.team_id = t.id
          AND t.id = $1
          AND tm.contact_id = $2
          AND t.user_id = $3`,
      [req.params.id, req.params.contact_id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: insert team_members rows after filtering contact_ids
// to ones that actually belong to this user. Prevents a parent
// from adding someone else's contact to their own team via a
// crafted POST body.
async function addMembers(teamId, userId, contactIds) {
  if (!contactIds.length) return;
  const owned = await query(
    `SELECT id FROM contacts WHERE user_id = $1 AND id = ANY($2::uuid[])`,
    [userId, contactIds]
  );
  if (!owned.length) return;
  // Build one INSERT with a VALUES list. ON CONFLICT eats
  // duplicates from the composite PK silently.
  const placeholders = owned.map((_, i) => `($1, $${i + 2})`).join(', ');
  await query(
    `INSERT INTO team_members (team_id, contact_id) VALUES ${placeholders}
     ON CONFLICT (team_id, contact_id) DO NOTHING`,
    [teamId, ...owned.map(c => c.id)]
  );
}

export default router;
