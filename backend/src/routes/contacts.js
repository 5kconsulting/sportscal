import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query, queryOne } from '../db/index.js';
import { sendOptInSms, toE164 } from '../lib/sms.js';

const router = Router();
router.use(requireAuth);

// Wait at least this long between opt-in resends to a single contact,
// to avoid spamming someone who hasn't replied YES yet.
const OPT_IN_RESEND_COOLDOWN_MS = 60 * 1000;

// Fire-and-forget opt-in send. Errors are logged but never block the
// HTTP response — the parent already has the contact in their list,
// they can resend manually if delivery fails.
async function fireOptIn(contact, parentName) {
  try {
    const result = await sendOptInSms({ contact, parentName });
    if (!result.sent) {
      console.log(`[contacts] opt-in skipped for ${contact.id}:`, result.reason);
      return;
    }
    await query(
      `UPDATE contacts
         SET opt_in_sent_at = NOW(),
             sms_consent_phone = $1
       WHERE id = $2`,
      [result.from, contact.id]
    );
    console.log(`[contacts] opt-in SMS sent to ${contact.phone} (sid=${result.sid})`);
  } catch (err) {
    console.error('[contacts] opt-in error:', err.message);
  }
}

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
//
// When a phone is supplied, we send the opt-in confirmation SMS
// immediately. The contact is created with sms_consent_status='pending'
// (the schema default) and stays there until they reply YES via the
// /api/twilio/inbound webhook.
router.post('/', async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    if (!name?.trim()) return res.status(422).json({ error: 'Name is required' });

    // Normalize phone before storing so the inbound-webhook lookup
    // matches what Twilio sends in `From`.
    const normalizedPhone = phone?.trim() ? (toE164(phone) || phone.trim()) : null;

    const contact = await queryOne(
      `INSERT INTO contacts (user_id, name, email, phone)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, name.trim(), email?.trim() || null, normalizedPhone]
    );

    if (normalizedPhone) {
      const parent = await queryOne(`SELECT name FROM users WHERE id = $1`, [req.user.id]);
      fireOptIn(contact, parent?.name);
    }

    res.status(201).json({ contact });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/contacts/:id
//
// If the phone changed, reset SMS consent — the previous YES was tied
// to the old number, not this new one. Then re-fire the opt-in.
router.patch('/:id', async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    const existing = await queryOne(
      `SELECT * FROM contacts WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const normalizedPhone = phone?.trim() ? (toE164(phone) || phone.trim()) : null;
    const phoneChanged = normalizedPhone !== existing.phone;

    let contact;
    if (phoneChanged) {
      contact = await queryOne(
        `UPDATE contacts
            SET name = $1, email = $2, phone = $3,
                sms_consent_status = 'pending',
                sms_consent_at = NULL,
                sms_consent_method = NULL,
                opt_in_sent_at = NULL
          WHERE id = $4 AND user_id = $5
          RETURNING *`,
        [name.trim(), email?.trim() || null, normalizedPhone, req.params.id, req.user.id]
      );
    } else {
      contact = await queryOne(
        `UPDATE contacts SET name = $1, email = $2, phone = $3
          WHERE id = $4 AND user_id = $5 RETURNING *`,
        [name.trim(), email?.trim() || null, normalizedPhone, req.params.id, req.user.id]
      );
    }

    if (phoneChanged && normalizedPhone) {
      const parent = await queryOne(`SELECT name FROM users WHERE id = $1`, [req.user.id]);
      fireOptIn(contact, parent?.name);
    }

    res.json({ contact });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contacts/:id/send-opt-in
//
// Manual resend, used by the "Resend opt-in" button in the contacts UI
// when a contact's status is still pending. Rate-limited per-contact so
// a parent jamming the button can't spam someone.
router.post('/:id/send-opt-in', async (req, res) => {
  try {
    const contact = await queryOne(
      `SELECT * FROM contacts WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!contact) return res.status(404).json({ error: 'Not found' });
    if (!contact.phone) return res.status(422).json({ error: 'Contact has no phone number' });
    if (contact.sms_consent_status === 'confirmed') {
      return res.status(409).json({ error: 'Contact has already opted in' });
    }
    if (contact.sms_consent_status === 'declined') {
      return res.status(409).json({ error: 'Contact has opted out and cannot be re-prompted from the app' });
    }

    if (contact.opt_in_sent_at) {
      const ageMs = Date.now() - new Date(contact.opt_in_sent_at).getTime();
      if (ageMs < OPT_IN_RESEND_COOLDOWN_MS) {
        const waitSec = Math.ceil((OPT_IN_RESEND_COOLDOWN_MS - ageMs) / 1000);
        return res.status(429).json({ error: `Please wait ${waitSec}s before resending.` });
      }
    }

    const parent = await queryOne(`SELECT name FROM users WHERE id = $1`, [req.user.id]);
    fireOptIn(contact, parent?.name);
    res.json({ ok: true });
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
