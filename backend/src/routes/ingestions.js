// ============================================================================
// routes/ingestions.js
//
// Endpoints:
//   POST   /api/ingestions              — upload PDF, enqueue extraction
//   GET    /api/ingestions/:id          — poll status + extracted events
//   POST   /api/ingestions/:id/approve  — user confirms events, create source
//   POST   /api/ingestions/:id/reject   — user discards
//   GET    /api/ingestions              — list user's recent ingestions
// ============================================================================

import express from 'express';
import multer from 'multer';
import { Queue } from 'bullmq';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { query, queryOne } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js'; // adjust if your repo path differs

const router = express.Router();

// --- BullMQ producer --------------------------------------------------------
const pdfQueue = new Queue('pdf-ingestion', {
  connection: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD,
  },
});

// --- storage config ---------------------------------------------------------
const STORAGE_ROOT = process.env.INGESTION_STORAGE_ROOT || '/data/ingestions';

async function ensureStorageDir() {
  await fs.mkdir(STORAGE_ROOT, { recursive: true });
}

// --- multer: memory storage so we can write with our own filename -----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are supported'));
    }
    cb(null, true);
  },
});

// Build events.content_hash the same way the iCal worker does.
// Matches the schema comment: hash(raw_title + location + starts_at + ends_at)
function computeContentHash(raw_title, location, starts_at, ends_at) {
  const h = crypto.createHash('sha256');
  h.update(String(raw_title || ''));
  h.update('|');
  h.update(String(location || ''));
  h.update('|');
  h.update(String(starts_at || ''));
  h.update('|');
  h.update(String(ends_at || ''));
  return h.digest('hex');
}

// ----------------------------------------------------------------------------
// POST /api/ingestions
// multipart/form-data: file (pdf), kidId (uuid)
// ----------------------------------------------------------------------------
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { kidId } = req.body;
    if (!kidId) {
      return res.status(400).json({ error: 'kidId is required' });
    }

    // Verify the kid belongs to this user
    const kid = await queryOne(
      `SELECT id FROM kids WHERE id = $1 AND user_id = $2`,
      [kidId, req.userId],
    );
    if (!kid) {
      return res.status(404).json({ error: 'Kid not found' });
    }

    // Write file to disk with a guaranteed-unique name
    await ensureStorageDir();
    const ingestionId = crypto.randomUUID();
    const storagePath = path.join(STORAGE_ROOT, ingestionId + '.pdf');
    await fs.writeFile(storagePath, req.file.buffer);

    // Create the ingestion row
    const ingestion = await queryOne(
      `INSERT INTO ingestions (
         id, user_id, kid_id, kind,
         original_filename, original_mime, original_size,
         storage_path, status, status_detail
       ) VALUES ($1, $2, $3, 'pdf', $4, $5, $6, $7, 'pending', 'Queued for processing')
       RETURNING id, status, status_detail, created_at`,
      [
        ingestionId,
        req.userId,
        kidId,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        storagePath,
      ],
    );

    // Enqueue — hyphen-id pattern per BullMQ v5 rule
    await pdfQueue.add(
      'extract',
      { ingestionId },
      {
        jobId: 'pdf-' + ingestionId,
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    res.status(201).json(ingestion);
  } catch (err) {
    console.error('[POST /api/ingestions] error', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/ingestions/:id  — poll this from the frontend for live status
// ----------------------------------------------------------------------------
router.get('/:id', requireAuth, async (req, res) => {
  const ingestion = await queryOne(
    `SELECT id, kid_id, kind, status, status_detail, extracted_events,
            event_count, approved_count, extraction_error,
            created_at, updated_at, reviewed_at
       FROM ingestions
      WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.userId],
  );

  if (!ingestion) {
    return res.status(404).json({ error: 'Ingestion not found' });
  }
  res.json(ingestion);
});

// ----------------------------------------------------------------------------
// GET /api/ingestions  — list recent ingestions for this user
// ----------------------------------------------------------------------------
router.get('/', requireAuth, async (req, res) => {
  const rows = await query(
    `SELECT id, kid_id, kind, status, status_detail, event_count,
            approved_count, created_at, reviewed_at
       FROM ingestions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [req.userId],
  );
  res.json(rows);
});

// ----------------------------------------------------------------------------
// POST /api/ingestions/:id/approve
// Body: { events: [...], sourceName?: string }
// Takes the user's edited events array and creates a real source + events.
// ----------------------------------------------------------------------------
router.post('/:id/approve', requireAuth, async (req, res) => {
  const { events, sourceName } = req.body;
  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: 'No events to approve' });
  }

  const ingestion = await queryOne(
    `SELECT * FROM ingestions WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.userId],
  );
  if (!ingestion) {
    return res.status(404).json({ error: 'Ingestion not found' });
  }
  if (ingestion.status !== 'ready_for_review') {
    return res.status(409).json({ error: 'Ingestion is not ready for review' });
  }

  try {
    await query('BEGIN');
    await query(
      `UPDATE ingestions SET status = 'approving', updated_at = NOW() WHERE id = $1`,
      [ingestion.id],
    );

    // 1) Create the source row.
    //    fetch_type='manual' — PDF sources don't get periodically refreshed.
    //    ical_url is intentionally NULL (no polling target).
    const derivedName =
      sourceName ||
      ingestion.original_filename?.replace(/\.pdf$/i, '') ||
      'Uploaded PDF schedule';

    const source = await queryOne(
      `INSERT INTO sources (user_id, app, name, fetch_type, enabled)
       VALUES ($1, 'pdf_upload', $2, 'manual', true)
       RETURNING id`,
      [req.userId, derivedName],
    );

    // 2) Link the kid to this source
    await query(
      `INSERT INTO kid_sources (kid_id, source_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [ingestion.kid_id, source.id],
    );

    // 3) Insert events — must provide content_hash (NOT NULL) and display_title
    let inserted = 0;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (!ev.starts_at) continue;

      const sourceUid = 'pdf-' + ingestion.id + '-' + i;
      const rawTitle = ev.raw_title || ev.display_title || 'Event';
      const displayTitle = ev.display_title || ev.raw_title || 'Event';
      const contentHash = computeContentHash(
        rawTitle,
        ev.location || null,
        ev.starts_at,
        ev.ends_at || null,
      );

      await query(
        `INSERT INTO events (
           user_id, source_id, source_uid,
           raw_title, display_title,
           starts_at, ends_at, all_day,
           location, description,
           content_hash, last_seen_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         ON CONFLICT (source_id, source_uid) DO NOTHING`,
        [
          req.userId,
          source.id,
          sourceUid,
          rawTitle,
          displayTitle,
          ev.starts_at,
          ev.ends_at || null,
          !!ev.all_day,
          ev.location || null,
          ev.notes || null,
          contentHash,
        ],
      );
      inserted++;
    }

    // 4) Mark ingestion approved
    await query(
      `UPDATE ingestions
          SET status = 'approved',
              source_id = $1,
              approved_count = $2,
              reviewed_at = NOW(),
              status_detail = 'Added ' || $2 || ' events',
              updated_at = NOW()
        WHERE id = $3`,
      [source.id, inserted, ingestion.id],
    );

    // 5) Invalidate feed_cache so the next .ics fetch rebuilds with new events
    await query(`DELETE FROM feed_cache WHERE user_id = $1`, [req.userId]);

    await query('COMMIT');

    res.json({
      ok: true,
      sourceId: source.id,
      eventsInserted: inserted,
    });
  } catch (err) {
    await query('ROLLBACK').catch(() => {});
    console.error('[approve ingestion] error', err);
    res.status(500).json({ error: err.message || 'Approve failed' });
  }
});

// ----------------------------------------------------------------------------
// POST /api/ingestions/:id/reject  — user throws it away
// ----------------------------------------------------------------------------
router.post('/:id/reject', requireAuth, async (req, res) => {
  const ingestion = await queryOne(
    `SELECT id, storage_path FROM ingestions WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.userId],
  );
  if (!ingestion) return res.status(404).json({ error: 'Not found' });

  // Best-effort file delete; DB row stays for the audit trail
  if (ingestion.storage_path) {
    await fs.unlink(ingestion.storage_path).catch(() => {});
  }

  await query(
    `UPDATE ingestions
        SET status = 'rejected',
            storage_path = NULL,
            file_deleted_at = NOW(),
            reviewed_at = NOW(),
            updated_at = NOW(),
            status_detail = 'Discarded'
      WHERE id = $1`,
    [ingestion.id],
  );

  res.json({ ok: true });
});

export default router;
