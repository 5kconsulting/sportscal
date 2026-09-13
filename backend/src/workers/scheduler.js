import cron from 'node-cron';
import { getSourcesDueForRefresh, query, getUsersDueForPushDigest } from '../db/index.js';
import { enqueueIcalFetch, enqueueScrapeFetch, enqueueDigest, enqueueReminder, enqueuePushDigest } from './queue.js';
import { checkSourceHealth } from './healthWorker.js';
import { refreshAllWeather } from '../lib/weather.js';

export function startScheduler() {
  // Source refresh every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const sources = await getSourcesDueForRefresh();
      if (sources.length === 0) return;
      console.log(`[scheduler] ${sources.length} source(s) due for refresh`);
      for (const source of sources) {
        if (source.fetch_type === 'scrape') {
          await enqueueScrapeFetch(source);
        } else {
          await enqueueIcalFetch(source);
        }
      }
    } catch (err) {
      console.error('[scheduler] refresh error:', err.message);
    }
  });

  // Weekly digest every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      const now = new Date();
      const users = await query(
        `SELECT id FROM users WHERE digest_enabled = true AND plan = 'premium'
         AND digest_day = $1 AND digest_hour = $2`,
        [now.getUTCDay(), now.getUTCHours()]
      );
      for (const user of users) await enqueueDigest(user.id);
    } catch (err) {
      console.error('[scheduler] digest error:', err.message);
    }
  });

  // Source health check — daily at 8am UTC
  cron.schedule('0 8 * * *', async () => {
    try {
      await checkSourceHealth();
    } catch (err) {
      console.error('[scheduler] health check error:', err.message);
    }
  });

  // Push night-digest — fires every hour on the hour. The query
  // returns users whose local time right now is 8pm (the digest hour)
  // and who have push_enabled + at least one registered token. The
  // jobId is deduped per-day-per-user in enqueuePushDigest, so even
  // if a clock blip caused two ticks in the matching hour we'd only
  // send once.
  cron.schedule('0 * * * *', async () => {
    try {
      const users = await getUsersDueForPushDigest(20);
      if (users.length === 0) return;
      console.log(`[scheduler] ${users.length} user(s) due for push digest`);
      for (const user of users) await enqueuePushDigest(user.id);
    } catch (err) {
      console.error('[scheduler] push digest error:', err.message);
    }
  });

  // Weather cache refresh every 3 hours. Cheap: only fetches
  // (venue, day) tuples not already in cache from earlier runs, and
  // only for venues on upcoming events. Free-tier OpenWeatherMap
  // allows 60 calls/min — well under any realistic user's footprint.
  cron.schedule('0 */3 * * *', async () => {
    try {
      const r = await refreshAllWeather();
      if (r.skipped) {
        console.log(`[scheduler] weather: skipped (${r.reason})`);
      } else if (r.locationsRefreshed > 0) {
        console.log(`[scheduler] weather: refreshed ${r.locationsRefreshed}/${r.totalLocations} locations, ${r.daysCached} day(s) cached`);
      }
    } catch (err) {
      console.error('[scheduler] weather error:', err.message);
    }
  });

  console.log('[scheduler] started — source refresh, digests, reminders, push, health checks, weather active');
}
