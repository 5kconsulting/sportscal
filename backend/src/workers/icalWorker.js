import { Worker } from 'bullmq';
import ical from 'node-ical';
import {
  getSourceById, getKidsForSource, markSourceFetched,
  upsertEvent, removeStaleEvents, invalidateFeedCache,
  createRefreshJob, finishRefreshJob,
} from '../db/index.js';
import { normalizeIcalFeed } from '../normalizer.js';
import { connection, JobType, enqueueScrapeFetch } from './queue.js';

const worker = new Worker('ical-fetch', async (job) => {
  const { sourceId, userId } = job.data;
  const fetchStartedAt = new Date();
  const dbJob = await createRefreshJob(sourceId, userId);

  try {
    const source = await getSourceById(sourceId, userId);
    if (!source) throw new Error(`Source ${sourceId} not found`);
    if (!source.ical_url) throw new Error(`Source ${sourceId} has no iCal URL`);

    const kids = await getKidsForSource(sourceId);
    job.log(`Fetching: ${source.ical_url}`);

    const rawData = await fetchWithTimeout(source.ical_url, 30000);
    const events  = normalizeIcalFeed(rawData, sourceId, userId, kids);

    job.log(`Normalized ${events.length} events`);

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
    throw err;
  }
}, { connection, concurrency: 5 });

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
    return ical.sync.parseICS(text);
  } finally {
    clearTimeout(timer);
  }
}

worker.on('completed', (job, result) => console.log(`[ical-worker] job ${job.id} completed`, result));
worker.on('failed',    (job, err)    => console.error(`[ical-worker] job ${job.id} failed:`, err.message));

console.log('[ical-worker] ready');
export default worker;
