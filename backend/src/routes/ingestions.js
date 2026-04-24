// ============================================================================
// routes/ingestions.js
//
// Endpoints:
//   POST   /api/ingestions              — upload PDF, enqueue extraction
//                                         optional sourceId: replace existing
//   GET    /api/ingestions/:id          — poll status + extracted events
//                                         includes replacing_source info if linked
//   POST   /api/ingestions/:id/approve  — user confirms events, create source
//                                         OR replace events on an existing source
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
import { requireAuth } from '../middleware/auth.js';
import { connection } from '../workers/queue.js';

const router = express.Router();

const pdfQueue = new Queue('pdf-ingestion', { connection });

const STORAGE_ROOT = process.env.INGESTION_STORAGE_ROOT || '/data/ingestions';

async function ensureStorageDir() {
  await fs.mkdir(STORAGE_ROOT, { recursive: true });
}

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

function uploadMiddleware(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const msg =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'File is too large (max 10MB)'
          : err.message || 'Upload failed';
      return res.status(400).json({ error: msg });
    }
    next();
  });
}

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
// multipart/form-data: file (pdf), kidId (uuid), sourceId? (uuid, optional)
//
// If sourceId is provided, this upload is marked to REPLACE that source's
// events on approve rather than creating a new source. We set source_id on
// the ingestion row at upload time so the approve flow can branch on it.
// ----------------------------------------------------------------------------
router.post('/', requireAuth, uploadMiddleware, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { kidId, sourceId } = req.body;
    if (!kidId) {
      return res.status(400).json({ error: 'kidId is required' });
    }

    const kid = await queryOne(
      `SELECT id FROM kids WHERE id = $1 AND user_id = $2`,
      [kidId, req.user.id],
    );
    if (!kid) {
      return res.status(404).json({ error: 'Kid not found', kidId });
    }

    // If replacing, verify the source belongs to this user and is a
    // manual/PDF source. We refuse to "replace" iCal feeds — that's a
    // different operation with a different UX.
    let replacingSource = null;
    if (sourceId) {
      replacingSource = await queryOne(
        `SELECT id, name, fetch_type, app
           FROM sources
          WHERE id = $1 AND user_id = $2`,
        [sourceId, req.user.id],
      );
      if (!replacingSource) {
        return res.status(404).json({ error: 'Source not found', sourceId });
      }
      if (replacingSource.fetch_type !== 'manual') {
        return res.status(422).json({
          error: 'Only PDF-ingested sources can be replaced via this endpoint',
          sourceFetchType: replacingSource.fetch_type,
        });
      }
    }

    await ensureStorageDir();
    const ingestionId = crypto.randomUUID();
    const storagePath = path.join(STORAGE_ROOT, ingestionId + '.pdf');
    await fs.writeFile(storagePath, req.file.buffer);

    // Note: source_id is set now (at upload time) if this is a replace.
    // The original flow only sets source_id on approve; for replaces we
    // need it earlier so GET /:id can report "replacing X" to the UI.
    const ingestion = await queryOne(
      `INSERT INTO ingestions (
         id, user_id, kid_id, source_id, kind,
         original_filename, original_mime, original_size,
         storage_path, status, status_detail
       ) VALUES ($1, $2, $3, $4, 'pdf', $5, $6, $7, $8, 'pending', $9)
       RETURNING id, status, status_detail, source_id, created_at`,
      [
        ingestionId,
        req.user.id,
        kidId,
        sourceId || null,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        storagePath,
        replacingSource
          ? `Queued to replace "${replacingSource.name}"`
          : 'Queued for processing',
      ],
    );

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

    res.status(201).json({
      ...ingestion,
      replacing_source: replacingSource
        ? { id: replacingSource.id, name: replacingSource.name }
        : null,
    });
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
    `SELECT i.id, i.kid_id, i.source_id, i.kind, i.status, i.status_detail,
            i.extracted_events, i.event_count, i.approved_count,
            i.extraction_error, i.created_at, i.updated_at, i.reviewed_at,
            s.name AS replacing_source_name
       FROM ingestions i
       LEFT JOIN sources s ON s.id = i.source_id AND i.status IN ('pending','processing','ready_for_review','approving')
      WHERE i.id = $1 AND i.user_id = $2`,
    [req.params.id, req.user.id],
  );

  if (!ingestion) {
    return res.status(404).json({ error: 'Ingestion not found' });
  }

  // Shape replacing_source cleanly — non-null only when this ingestion is
  // pre-approval and linked to an existing source (i.e. a pending replace).
  const replacing_source = ingestion.replacing_source_name
    ? { id: ingestion.source_id, name: ingestion.replacing_source_name }
    : null;
  delete ingestion.replacing_source_name;

  res.json({ ...ingestion, replacing_source });
});

// ----------------------------------------------------------------------------
// GET /api/ingestions  — list recent ingestions for this user
// ----------------------------------------------------------------------------
router.get('/', requireAuth, async (req, res) => {
  const rows = await query(
    `SELECT id, kid_id, source_id, kind, status, status_detail, event_count,
            approved_count, created_at, reviewed_at
       FROM ingestions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [req.user.id],
  );
  res.json(rows);
});

// ----------------------------------------------------------------------------
// POST /api/ingestions/:id/approve
// Body: { events: [...], sourceName?: string }
//
// If the ingestion has a source_id set AND the linked source still exists,
// this is a SOFT REPLACE: we delete the source's existing events (the FK
// cascade removes associated event_logistics and event_overrides) and
// insert the new events against the same source_id. The source row itself
// is preserved so any external references remain stable.
//
// Otherwise the flow is unchanged: create a new source, link the kid,
// insert events.
// ----------------------------------------------------------------------------
router.post('/:id/approve', requireAuth, async (req, res) => {
  const { events, sourceName } = req.body;
  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: 'No events to approve' });
  }

  const ingestion = await queryOne(
    `SELECT * FROM ingestions WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user.id],
  );
  if (!ingestion) {
    return res.status(404).json({ error: 'Ingestion not found' });
  }
  if (ingestion.status !== 'ready_for_review') {
    return res.status(409).json({ error: 'Ingestion is not ready for review' });
  }

  // Decide branch: replace if we have a source_id AND the source still exists.
  // (If the user deleted the source between upload and approve, degrade to
  // "create new" rather than failing — better than the approve 500ing.)
  let replacingSource = null;
  if (ingestion.source_id) {
    replacingSource = await queryOne(
      `SELECT id, name FROM sources WHERE id = $1 AND user_id = $2`,
      [ingestion.source_id, req.user.id],
    );
  }

  try {
    await query('BEGIN');
    await query(
      `UPDATE ingestions SET status = 'approving', updated_at = NOW() WHERE id = $1`,
      [ingestion.id],
    );

    let source;
    let eventsReplaced = 0;

    if (replacingSource) {
      // --- REPLACE branch ------------------------------------------------
      // Count existing events before deletion (for the response + audit).
      const { count: priorCount } = await queryOne(
        `SELECT COUNT(*)::int AS count FROM events
          WHERE source_id = $1 AND user_id = $2`,
        [replacingSource.id, req.user.id],
      );
      eventsReplaced = priorCount;

      // Delete existing events. event_logistics and event_overrides have
      // ON DELETE CASCADE on event_id, so they're removed automatically.
      await query(
        `DELETE FROM events WHERE source_id = $1 AND user_id = $2`,
        [replacingSource.id, req.user.id],
      );

      // Optionally rename the source if the user provided a new name.
      if (sourceName && sourceName.trim() && sourceName.trim() !== replacingSource.name) {
        await query(
          `UPDATE sources SET name = $1 WHERE id = $2`,
          [sourceName.trim(), replacingSource.id],
        );
      }

      source = { id: replacingSource.id };
    } else {
      // --- CREATE branch (unchanged) -------------------------------------
      const derivedName =
        sourceName ||
        ingestion.original_filename?.replace(/\.pdf$/i, '') ||
        'Uploaded PDF schedule';

      source = await queryOne(
        `INSERT INTO sources (user_id, app, name, fetch_type, enabled)
         VALUES ($1, 'pdf_upload', $2, 'manual', true)
         RETURNING id`,
        [req.user.id, derivedName],
      );

      // Link the kid to this new source. For replaces we keep the existing
      // kid_sources mapping untouched — the user didn't signal a change of kid.
      await query(
        `INSERT INTO kid_sources (kid_id, source_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [ingestion.kid_id, source.id],
      );
    }

    // Insert events — identical for both branches.
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
          req.user.id,
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

    const detail = replacingSource
      ? `Replaced ${eventsReplaced} events with ${inserted}`
      : `Added ${inserted} events`;

    await query(
      `UPDATE ingestions
          SET status = 'approved',
              source_id = $1,
              approved_count = $2,
              reviewed_at = NOW(),
              status_detail = $3,
              updated_at = NOW()
        WHERE id = $4`,
      [source.id, inserted, detail, ingestion.id],
    );

    await query(`DELETE FROM feed_cache WHERE user_id = $1`, [req.user.id]);

    await query('COMMIT');

    res.json({
      ok: true,
      sourceId: source.id,
      eventsInserted: inserted,
      eventsReplaced, // 0 for the create branch, prior count for replace
      isReplace: !!replacingSource,
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
    [req.params.id, req.user.id],
  );
  if (!ingestion) return res.status(404).json({ error: 'Not found' });

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
