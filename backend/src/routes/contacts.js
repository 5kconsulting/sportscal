import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query, queryOne } from '../db/index.js';

const router = Router();
router.use(requireAuth);

// GET /api/contacts
router.get('/', async (req, res) => {
  try {
    const contacts = await query(
      `SELECT * FROM contacts WHERE user_id = $1 ORDER BY name`,
      [req.user.id]
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

    const contact = await queryOne(
      `INSERT INTO contacts (user_id, name, email, phone)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, name.trim(), email?.trim() || null, phone?.trim() || null]
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
    const contact = await queryOne(
      `UPDATE contacts SET name=$1, email=$2, phone=$3
       WHERE id=$4 AND user_id=$5 RETURNING *`,
      [name.trim(), email?.trim() || null, phone?.trim() || null, req.params.id, req.user.id]
    );
    if (!contact) return res.status(404).json({ error: 'Not found' });
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
