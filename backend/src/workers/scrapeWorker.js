import { Worker } from 'bullmq';
import { chromium } from 'playwright';
import {
  getSourceById, getKidsForSource, markSourceFetched,
  upsertEvent, removeStaleEvents, invalidateFeedCache,
  createRefreshJob, finishRefreshJob,
} from '../db/index.js';
import { normalizeScrapedFeed } from '../normalizer.js';
import { connection, JobType } from './queue.js';
import { scrapeBYGA, scrapeTeamSideline } from '../scrapers/index.js';

const SCRAPERS = { byga: scrapeBYGA, teamsideline: scrapeTeamSideline };
let browser = null;

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  browser = await chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  browser.on('disconnected', () => { browser = null; });
  return browser;
}

const worker = new Worker('scrape-fetch', async (job) => {
  const { sourceId, userId } = job.data;
  const fetchStartedAt = new Date();
  const dbJob = await createRefreshJob(sourceId, userId);
  let page = null;

  try {
    const source = await getSourceById(sourceId, userId);
    if (!source) throw new Error(`Source ${sourceId} not found`);
    if (!source.scrape_url) throw new Error(`Source ${sourceId} has no scrape URL`);

    const scraperFn = SCRAPERS[source.app];
    if (!scraperFn) throw new Error(`No scraper for app: ${source.app}`);

    const kids = await getKidsForSource(sourceId);
    const br  = await getBrowser();
    const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } });
    page = await ctx.newPage();
    await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf}', r => r.abort());

    const scrapedEvents = await scraperFn(page, source.scrape_url, source.scrape_config || {});
    await page.context().close();
    page = null;

    const events = normalizeScrapedFeed(scrapedEvents, sourceId, userId, kids);
    let added = 0, updated = 0;
    for (const event of events) {
      const result = await upsertEvent(event);
      if (result.inserted) added++; else updated++;
    }

    const removed = await removeStaleEvents(sourceId, fetchStartedAt);
    await markSourceFetched(sourceId, { status: 'ok', eventCount: events.length });
    await invalidateFeedCache(userId);
    await finishRefreshJob(dbJob.id, { status: 'ok', added, updated, removed: removed.length, error: null });

    console.log(`[scrape-worker] done: +${added} added, ~${updated} updated`);
    return { added, updated, removed: removed.length };

  } catch (err) {
    console.error(`[scrape-worker] source ${sourceId} failed:`, err.message);
    if (page) { try { await page.context().close(); } catch { } }
    await markSourceFetched(sourceId, { status: 'error', error: err.message });
    await finishRefreshJob(dbJob.id, { status: 'error', added: 0, updated: 0, removed: 0, error: err.message });
    throw err;
  }
}, { connection, concurrency: 2 });

worker.on('completed', (job, result) => console.log(`[scrape-worker] job ${job.id} completed`, result));
worker.on('failed',    (job, err)    => console.error(`[scrape-worker] job ${job.id} failed:`, err.message));

console.log('[scrape-worker] ready');
export default worker;
