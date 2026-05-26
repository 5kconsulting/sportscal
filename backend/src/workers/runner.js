import icalWorker   from './icalWorker.js';
import scrapeWorker from './scrapeWorker.js';
import emailWorker  from './emailWorker.js';
import pdfWorker    from './pdfWorker.js';
import { startScheduler } from './scheduler.js';

startScheduler();

console.log('[runner] all workers started');

process.on('unhandledRejection', (err) => {
  console.error('[runner] unhandled rejection:', err);
});

// Exposed so server.js can drain them on SIGTERM. Without this, a
// Railway deploy would SIGKILL the workers mid-job — jobs in "active"
// status get stuck until BullMQ's stalled-job reclaim fires (default
// ~30s later), and the dashboard reports the old container as
// crashed because Node exited without cleaning up.
export const workers = [icalWorker, scrapeWorker, emailWorker, pdfWorker];
