import './icalWorker.js';
import './scrapeWorker.js';
import './emailWorker.js';
import './pdfWorker.js';
import './pushWorker.js';
import { startScheduler } from './scheduler.js';
import { icalQueue, scrapeQueue } from './queue.js';

// One-time cleanup: legacy completed/failed jobs from before the switch to
// removeOnComplete/removeOnFail=true would otherwise sit forever blocking
// re-adds against their static jobId (`ical-<sourceId>` / `scrape-<sourceId>`).
// Safe to leave in — it's a fast no-op once the backlog is drained.
await Promise.all([
  icalQueue.clean(0, 5000, 'completed'),
  icalQueue.clean(0, 5000, 'failed'),
  scrapeQueue.clean(0, 5000, 'completed'),
  scrapeQueue.clean(0, 5000, 'failed'),
]).catch((err) => console.error('[runner] queue cleanup error:', err.message));

startScheduler();

console.log('[runner] all workers started');

process.on('unhandledRejection', (err) => {
  console.error('[runner] unhandled rejection:', err);
});
