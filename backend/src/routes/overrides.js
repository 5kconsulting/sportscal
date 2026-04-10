import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query, queryOne } from '../db/index.js';

const router = Router();
router.use(requireAuth);

// ============================================================
// GET /api/overrides/:eventId
// Get attendance overrides for an event
// ============================================================
router.get('/:eventId', async (req, res) => {
  try {
    const rows = await query(
      `SELECT eo.*, k.name AS kid_name, k.color AS kid_color
       FROM event_overrides eo
       JOIN kids k ON k.id = eo.kid_id
       WHERE eo.event_id = $1 AND eo.user_id = $2`,
      [req.params.eventId, req.user.id]
    );
    res.json({ overrides: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/overrides/:eventId
// Set attendance for a kid on an event
// Body: { kid_id, attending }
// ============================================================
router.post('/:eventId', async (req, res) => {
  try {
    const { kid_id, attending } = req.body;

    // Verify kid belongs to user
    const kid = await queryOne(
      `SELECT id, name FROM kids WHERE id = $1 AND user_id = $2`,
      [kid_id, req.user.id]
    );
    if (!kid) return res.status(404).json({ error: 'Kid not found' });

    // Verify event belongs to user
    const event = await queryOne(
      `SELECT id FROM events WHERE id = $1 AND user_id = $2`,
      [req.params.eventId, req.user.id]
    );
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const override = await queryOne(
      `INSERT INTO event_overrides (user_id, event_id, kid_id, attending)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (event_id, kid_id) DO UPDATE SET attending = EXCLUDED.attending
       RETURNING *`,
      [req.user.id, req.params.eventId, kid_id, attending]
    );

    // Invalidate feed cache so the iCal feed rebuilds
    await query(
      `DELETE FROM feed_cache WHERE user_id = $1`,
      [req.user.id]
    );

    res.json({ override });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DELETE /api/overrides/:eventId/:kidId
// Remove override (revert to default — kid attends)
// ============================================================
router.delete('/:eventId/:kidId', async (req, res) => {
  try {
    await query(
      `DELETE FROM event_overrides
       WHERE event_id = $1 AND kid_id = $2 AND user_id = $3`,
      [req.params.eventId, req.params.kidId, req.user.id]
    );

    await query(`DELETE FROM feed_cache WHERE user_id = $1`, [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
