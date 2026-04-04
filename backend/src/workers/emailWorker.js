import { Worker } from 'bullmq';
import { Resend } from 'resend';
import { getUserById, getUpcomingEvents, getKidsByUser } from '../db/index.js';
import { connection, JobType } from './queue.js';

const resend = new Resend(process.env.RESEND_API_KEY);

const worker = new Worker('email-send', async (job) => {
  if (job.name === JobType.SEND_DIGEST) {
    const { userId } = job.data;
    const user   = await getUserById(userId);
    if (!user || !user.digest_enabled) return { skipped: true };
    const events = await getUpcomingEvents(userId, { days: 7 });
    if (events.length === 0) return { skipped: true, reason: 'no events' };
    const result = await resend.emails.send({
      from:    `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM}>`,
      to:      user.email,
      subject: `Your week in sports`,
      text:    events.map(e => `${new Date(e.starts_at).toLocaleString()} — ${e.display_title}`).join('\n'),
    });
    return { emailId: result.id, eventCount: events.length };
  }

  if (job.name === JobType.SEND_REMINDER) {
    const { userId, eventId } = job.data;
    const user   = await getUserById(userId);
    if (!user) return { skipped: true };
    const events = await getUpcomingEvents(userId);
    const event  = events.find(e => e.id === eventId);
    if (!event) return { skipped: true };
    const hoursUntil = Math.round((new Date(event.starts_at) - Date.now()) / 3600000);
    await resend.emails.send({
      from:    `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM}>`,
      to:      user.email,
      subject: `Reminder: ${event.display_title} in ~${hoursUntil}h`,
      text:    `${event.display_title}\nWhen: ${new Date(event.starts_at).toLocaleString()}${event.location ? `\nWhere: ${event.location}` : ''}`,
    });
    return { skipped: false };
  }
}, { connection, concurrency: 5 });

worker.on('completed', (job, result) => console.log(`[email-worker] job ${job.id} completed`, result));
worker.on('failed',    (job, err)    => console.error(`[email-worker] job ${job.id} failed:`, err.message));

console.log('[email-worker] ready');
export default worker;
