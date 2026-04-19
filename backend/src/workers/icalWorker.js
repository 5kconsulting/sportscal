import { Worker } from 'bullmq';
import ical from 'node-ical';
import {
  getSourceById, getKidsForSource, markSourceFetched,
  upsertEvent, removeStaleEvents, invalidateFeedCache,
  createRefreshJob, finishRefreshJob,
} from '../db/index.js';
import { normalizeIcalFeed } from '../normalizer.js';
import { connection, JobType, enqueueScrapeFetch } from './queue.js';

// Guardrail: if the previous fetch had at least this many events and the
// current fetch returns zero, refuse to proceed. Prevents an upstream outage
// or bad-URL-returning-200 from silently wiping a user's entire schedule.
// See fix #6 in the audit.
const EMPTY_FEED_GUARD_THRESHOLD = 5;

const worker = new Worker('ical-fetch', async (job) => {
  const { sourceId, userId } = job.data;
  // Capture fetch start time BEFORE upserting. Events upserted during this
  // run get last_seen_at = NOW() (>= fetchStartedAt), so removeStaleEvents
  // correctly leaves them alone and only deletes rows from prior runs.
  const fetchStartedAt = new Date();
  const dbJob = await createRefreshJob(sourceId, userId);

  try {
    const source = await getSourceById(sourceId, userId);
    if (!source) throw new Error(`Source ${sourceId} not found`);

    // Sources that don't poll upstream (manual entry, PDF ingestion, email
    // ingestion) should never be processed by the iCal worker even if a
    // stray job ends up on the queue. Check fetch_type rather than the
    // legacy '__manual__' name so new non-polling source kinds are safe.
    if (source.fetch_type === 'manual' || source.name === '__manual__') {
      await finishRefreshJob(dbJob.id, { status: 'ok', added: 0, updated: 0, removed: 0, error: null });
      return;
    }
    if (!source.ical_url) throw new Error(`Source ${sourceId} has no iCal URL`);

    const kids = await getKidsForSource(sourceId);
    try { job.log(`Fetching: ${source.ical_url}`); } catch {}

    const rawData = await fetchWithTimeout(source.ical_url, 30000);
    const events  = normalizeIcalFeed(rawData, sourceId, userId, kids);

    try { job.log(`Normalized ${events.length} events`); } catch {}

    // Empty-feed guard: refuse to wipe a user's schedule if upstream
    // returned zero events but we had real data last time. This throws
    // and bubbles up to the catch block, which records the error and
    // keeps existing events intact for the next (hopefully healthy) fetch.
    if (events.length === 0 && (source.last_event_count ?? 0) >= EMPTY_FEED_GUARD_THRESHOLD) {
      throw new Error(
        `Feed returned 0 events but last fetch had ${source.last_event_count}. ` +
        `Refusing to wipe existing events. Upstream may be down or URL may be stale.`
      );
    }

    let added = 0, updated = 0;
    for (const event of events) {
      const result = await upsertEvent(event);
      if (result.inserted) added++; else updated++;
    }

    const removed = await removeStaleEvents(sourceId, fetchStartedAt);
    await markSourceFetched(sourceId, { status: 'ok', eventCount: events.length });
    await invalidateFeedCache(userId);
    await finishRefreshJob(dbJob.id, { status: 'ok', added, updated, removed: removed.length, error: null });

    console.log(`[ical-worker] done: +${added} added, ~${updated} updated, -${removed.length} removed`);
    return { added, updated, removed: removed.length, total: events.length };

  } catch (err) {
    console.error(`[ical-worker] source ${sourceId} failed:`, err.message);
    await markSourceFetched(sourceId, { status: 'error', error: err.message });
    await finishRefreshJob(dbJob.id, { status: 'error', added: 0, updated: 0, removed: 0, error: err.message });

    try {
      const source = await getSourceById(sourceId, userId);
      if (source?.fetch_type === 'ical_with_scrape_fallback' && source?.scrape_url) {
        await enqueueScrapeFetch(source, { priority: 1 });
      }
    } catch { /* ignore */ }

    throw err;
  }
}, {
  connection,
  concurrency: 5,
  // Transient failures (network blips, upstream 5xx) get retried with
  // exponential backoff instead of waiting for the next scheduler tick.
  // Permanent failures (bad URL, malformed feed) still bubble up after
  // retries are exhausted and are recorded in refresh_jobs.
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
  },
});

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const normalizedUrl = url.replace(/^webcal:\/\//i, 'https://');
    const response = await fetch(normalizedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SportsCal/1.0 (calendar aggregator)',
        'Accept': 'text/calendar, application/ical, */*',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    const text = await response.text();

    // Sanity check: some servers (SportsEngine, others) return a 200 OK with
    // an HTML error page when the URL is slightly wrong. Without this check,
    // parseICS would silently return {}, normalizeIcalFeed would return [],
    // and removeStaleEvents would wipe the user's real events. Refuse to
    // parse anything that doesn't at least contain the iCal header.
    if (!text.includes('BEGIN:VCALENDAR')) {
      const preview = text.slice(0, 120).replace(/\s+/g, ' ').trim();
      throw new Error(`Response is not an iCal feed (got: "${preview}...")`);
    }

    return ical.sync.parseICS(text);
  } finally {
    clearTimeout(timer);
  }
}

worker.on('completed', (job, result) => console.log(`[ical-worker] job ${job.id} completed`, result));
worker.on('failed',    (job, err)    => console.error(`[ical-worker] job ${job.id} failed:`, err.message));

console.log('[ical-worker] ready');
export default worker;
