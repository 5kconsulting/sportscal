import { Queue } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

connection.on('error',   (err) => console.error('[redis] error', err.message));
connection.on('connect', ()    => console.log('[redis] connected'));

export { connection };

export const icalQueue = new Queue('ical-fetch', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 3,
    backoff: { type: 'exponential', delay: 30000 },
  },
});

export const scrapeQueue = new Queue('scrape-fetch', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 2,
    backoff: { type: 'fixed', delay: 60000 },
  },
});

export const emailQueue = new Queue('email-send', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
  },
});

export const JobType = {
  FETCH_ICAL:    'fetch-ical',
  FETCH_SCRAPE:  'fetch-scrape',
  SEND_DIGEST:   'send-digest',
  SEND_REMINDER: 'send-reminder',
};

export async function enqueueIcalFetch(source, opts = {}) {
  const jobId = opts.force
    ? `ical-${source.id}-${Date.now()}`
    : `ical:${source.id}`;
  return icalQueue.add(
    JobType.FETCH_ICAL,
    { sourceId: source.id, userId: source.user_id },
    { jobId, priority: opts.priority || 10 }
  );
}

export async function enqueueScrapeFetch(source, opts = {}) {
  const jobId = opts.force
    ? `scrape-${source.id}-${Date.now()}`
    : `scrape:${source.id}`;
  return scrapeQueue.add(
    JobType.FETCH_SCRAPE,
    { sourceId: source.id, userId: source.user_id },
    { jobId, priority: opts.priority || 10 }
  );
}

export async function enqueueDigest(userId, opts = {}) {
  return emailQueue.add(
    JobType.SEND_DIGEST,
    { userId },
    { jobId: `digest-${userId}-${new Date().toDateString()}`, ...opts }
  );
}

export async function enqueueReminder(userId, eventId, opts = {}) {
  return emailQueue.add(JobType.SEND_REMINDER, { userId, eventId }, opts);
}

export async function getQueueStats() {
  const [ical, scrape, email] = await Promise.all([
    icalQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
    scrapeQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
    emailQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
  ]);
  return { ical, scrape, email };
}
