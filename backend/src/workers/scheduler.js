import cron from 'node-cron';
import {
  getSourcesDueForRefresh,
  getUserById,
  query,
} from '../db/index.js';
import {
  enqueueIcalFetch,
  enqueueScrapeFetch,
  enqueueDigest,
  enqueueReminder,
} from './queue.js';

// ============================================================
// Scheduler
//
// Three cron jobs:
//   1. Source refresh  — every 5 min, checks for sources due
//   2. Digest emails   — every 30 min, sends to users whose
//                        digest_day/hour matches now
//   3. Reminders       — every 15 min, sends for events starting
//                        in the user's reminder_hours_before window
// ============================================================

export function startScheduler() {

  // ----------------------------------------------------------
  // 1. Source refresh (every 5 minutes)
  // Checks all sources whose last_fetched_at is older than
  // their refresh_interval_minutes, and enqueues jobs.
  // Bull's jobId dedup prevents double-queueing.
  // ----------------------------------------------------------
  cron.schedule('*/5 * * * *', async () => {
    try {
      const sources = await getSourcesDueForRefresh();
      if (sources.length === 0) return;

      console.log(`[scheduler] ${sources.length} source(s) due for refresh`);

      for (const source of sources) {
        if (source.fetch_type === 'ical' || source.fetch_type === 'ical_with_scrape_fallback') {
          await enqueueIcalFetch(source);
        } else if (source.fetch_type === 'scrape') {
          await enqueueScrapeFetch(source);
        }
      }
    } catch (err) {
      console.error('[scheduler] refresh error:', err.message);
    }
  });

  // ----------------------------------------------------------
  // 2. Weekly digest emails (every 30 minutes)
  // Checks if any user's digest_day and digest_hour matches
  // the current time (within the 30-min window).
  // ----------------------------------------------------------
  cron.schedule('*/30 * * * *', async () => {
    try {
      const now   = new Date();
      const day   = now.getUTCDay();   // 0=Sun ... 6=Sat
      const hour  = now.getUTCHours();

      // Find users whose digest window is NOW
      // We match on UTC hour — users set their timezone preference
      // and the frontend converts. For V1 this is close enough.
      const users = await query(
        `SELECT id FROM users
         WHERE digest_enabled = true
           AND plan IN ('pro', 'family')
           AND digest_day  = $1
           AND digest_hour = $2`,
        [day, hour]
      );

      if (users.length > 0) {
        console.log(`[scheduler] sending digest to ${users.length} user(s)`);
        for (const user of users) {
          await enqueueDigest(user.id);
        }
      }
    } catch (err) {
      console.error('[scheduler] digest error:', err.message);
    }
  });

  // ----------------------------------------------------------
  // 3. Event reminders (every 15 minutes)
  // Finds upcoming events that fall inside a user's reminder
  // window and haven't been reminded yet.
  // ----------------------------------------------------------
  cron.schedule('*/15 * * * *', async () => {
    try {
      // Find events where:
      //   - starts_at is within (reminder_hours_before) hours from now
      //   - haven't already sent a reminder (we use a reminder_sent_at
      //     column we add inline here)
      const upcoming = await query(
        `SELECT e.id, e.user_id, e.display_title, e.starts_at,
                u.reminder_hours_before, u.plan
         FROM events e
         JOIN users u ON u.id = e.user_id
         WHERE u.plan IN ('pro', 'family')
           AND e.starts_at > NOW()
           AND e.starts_at <= NOW() + (u.reminder_hours_before || ' hours')::INTERVAL
           AND NOT EXISTS (
             SELECT 1 FROM refresh_jobs rj
             WHERE rj.user_id = e.user_id
               AND rj.error_message = 'reminder:' || e.id::text
           )`,
        []
      );

      for (const event of upcoming) {
        await enqueueReminder(event.user_id, event.id);

        // Mark as reminded by storing a sentinel in refresh_jobs
        // (avoids adding a separate reminders table for V1)
        await query(
          `INSERT INTO refresh_jobs (source_id, user_id, status, error_message, finished_at)
           SELECT s.id, $1, 'ok', $2, NOW()
           FROM sources s WHERE s.user_id = $1 LIMIT 1`,
          [event.user_id, `reminder:${event.id}`]
        );
      }

      if (upcoming.length > 0) {
        console.log(`[scheduler] queued ${upcoming.length} reminder(s)`);
      }
    } catch (err) {
      console.error('[scheduler] reminder error:', err.message);
    }
  });

  console.log('[scheduler] started — source refresh, digests, reminders active');
}
