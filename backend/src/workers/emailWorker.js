import { Worker } from 'bullmq';
import { Resend } from 'resend';
import { getUserById, getUpcomingEvents, getKidsByUser } from '../db/index.js';
import { connection, JobType } from './queue.js';
import { digestEmail, reminderEmail } from '../emails/templates.js';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = `${process.env.EMAIL_FROM_NAME || 'SportsCal'} <${process.env.EMAIL_FROM || 'noreply@mail.sportscalapp.com'}>`;

const worker = new Worker('email-send', async (job) => {
  if (job.name === JobType.SEND_DIGEST) {
    const { userId } = job.data;
    const user = await getUserById(userId);
    if (!user || !user.digest_enabled) return { skipped: true };

    const events = await getUpcomingEvents(userId, { days: 7 });
    if (events.length === 0) return { skipped: true, reason: 'no events' };

    const { subject, html, text } = digestEmail(user, events);
    const result = await resend.emails.send({ from: FROM, to: user.email, subject, html, text });

    console.log(`[email-worker] digest sent to ${user.email}`);
    return { emailId: result.id, eventCount: events.length };
  }

  if (job.name === JobType.SEND_REMINDER) {
    const { userId, eventId } = job.data;
    const user   = await getUserById(userId);
    if (!user) return { skipped: true };

    const events = await getUpcomingEvents(userId);
    const event  = events.find(e => e.id === eventId);
    if (!event) return { skipped: true };

    const { subject, html, text } = reminderEmail(user, event);
    const result = await resend.emails.send({ from: FROM, to: user.email, subject, html, text });

    console.log(`[email-worker] reminder sent to ${user.email}`);
    return { emailId: result.id };
  }
}, { connection, concurrency: 5 });

worker.on('completed', (job, result) => console.log(`[email-worker] job ${job.id} completed`, result));
worker.on('failed',    (job, err)    => console.error(`[email-worker] job ${job.id} failed:`, err.message));

console.log('[email-worker] ready');
export default worker;
