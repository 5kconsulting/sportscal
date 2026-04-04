import './icalWorker.js';
import './scrapeWorker.js';
import './emailWorker.js';
import { startScheduler } from './scheduler.js';

startScheduler();

console.log('[runner] all workers started');

process.on('unhandledRejection', (err) => {
  console.error('[runner] unhandled rejection:', err);
});
