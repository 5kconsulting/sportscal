import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query, queryOne } from '../db/index.js';
import { toE164 } from '../lib/phone.js';

const router = Router();
router.use(requireAuth);

// GET /api/contacts
// Household-scoped read: both parents see the same carpool drivers,
// coaches, and other named contacts. Writes still scope to req.user.id
// so each parent only edits contacts they themselves created (matches
// the current pattern for kids and sources — deferred harmonization).
router.get('/', async (req, res) => {
  try {
    const contacts = await query(
      `SELECT * FROM contacts WHERE user_id = ANY($1::uuid[]) ORDER BY name`,
      [req.user.householdMemberIds]
    );
    res.json({ contacts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contacts
router.post('/', async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    if (!name?.trim()) return res.status(422).json({ error: 'Name is required' });

    // Normalize phone before storing so lookups and sms: links are consistent.
    const normalizedPhone = phone?.trim() ? (toE164(phone) || phone.trim()) : null;

    const contact = await queryOne(
      `INSERT INTO contacts (user_id, name, email, phone)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, name.trim(), email?.trim() || null, normalizedPhone]
    );

    res.status(201).json({ contact });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/contacts/:id
router.patch('/:id', async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    const existing = await queryOne(
      `SELECT * FROM contacts WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const normalizedPhone = phone?.trim() ? (toE164(phone) || phone.trim()) : null;
    const contact = await queryOne(
      `UPDATE contacts SET name = $1, email = $2, phone = $3
        WHERE id = $4 AND user_id = $5 RETURNING *`,
      [name.trim(), email?.trim() || null, normalizedPhone, req.params.id, req.user.id]
    );

    res.json({ contact });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/contacts/:id
router.delete('/:id', async (req, res) => {
  try {
    await query(
      `DELETE FROM contacts WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
