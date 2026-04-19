// ============================================================================
// scheduler additions — add this to your existing scheduler.js
//
// Runs daily at 3 AM UTC and unlinks PDF files older than 60 days.
// The DB row (and extracted_events) is preserved; only the file is removed.
// ============================================================================

import fs from 'node:fs/promises';
import { query } from '../db/index.js';

const RETENTION_DAYS = 60;

export async function runIngestionCleanup() {
  const stale = await query(
    `SELECT id, storage_path
       FROM ingestions
      WHERE storage_path IS NOT NULL
        AND created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`,
  );

  let deleted = 0;
  for (const row of stale) {
    try {
      await fs.unlink(row.storage_path);
      deleted++;
    } catch (err) {
      // File might already be gone — still clear the DB reference.
      if (err.code !== 'ENOENT') {
        console.error('[ingestionCleanup] could not unlink', row.storage_path, err.message);
      }
    }
    await query(
      `UPDATE ingestions
          SET storage_path = NULL,
              file_deleted_at = NOW()
        WHERE id = $1`,
      [row.id],
    );
  }

  if (deleted > 0) {
    console.log('[ingestionCleanup] removed ' + deleted + ' file(s) older than ' + RETENTION_DAYS + ' days');
  }
  return deleted;
}

// ---------------------------------------------------------------------------
// Register with your existing scheduler — example using BullMQ repeatable job.
// Adapt to however scheduler.js currently enqueues recurring tasks.
// ---------------------------------------------------------------------------
//
// Example:
//
// import { Queue } from 'bullmq';
// const maintenanceQueue = new Queue('maintenance', { connection });
//
// await maintenanceQueue.add(
//   'ingestion-cleanup',
//   {},
//   {
//     jobId: 'ingestion-cleanup-daily',
//     repeat: { pattern: '0 3 * * *' }, // 3 AM UTC daily
//     removeOnComplete: 10,
//     removeOnFail: 10,
//   },
// );
//
// And in your maintenance worker:
//
// new Worker('maintenance', async (job) => {
//   if (job.name === 'ingestion-cleanup') {
//     await runIngestionCleanup();
//   }
// }, { connection });
