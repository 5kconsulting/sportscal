import { Worker } from 'bullmq';
import { Resend } from 'resend';
import {
  getUserById,
  getUpcomingEvents,
  getKidsByUser,
  getHouseholdInviteByToken,
  getWelcomeSeriesContext,
  claimWelcomeSeriesStep,
  releaseWelcomeSeriesStep,
  ensureInboundToken,
} from '../db/index.js';
import { connection, JobType } from './queue.js';
import {
  digestEmail,
  householdInviteEmail,
} from '../emails/templates.js';
import { pickWelcomeStep, renderWelcomeEmail, WELCOME_FROM_NAME } from '../emails/welcomeSeries.js';
import { tipsUnsubscribeUrl } from '../lib/unsubscribe.js';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = `${process.env.EMAIL_FROM_NAME || 'SportsCal'} <${process.env.EMAIL_FROM || 'noreply@mail.sportscalapp.com'}>`;
// FROM is a no-reply sending domain; the series invites replies, so they
// go to the support alias instead.
const REPLY_TO = process.env.EMAIL_REPLY_TO || 'hello@sportscalapp.com';

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

  if (job.name === JobType.SEND_HOUSEHOLD_INVITE) {
    const { inviteToken, invitedEmail } = job.data;
    // Re-fetch the invite so a race between enqueue and send (e.g.
    // the invite got revoked in the meantime) doesn't email a
    // stale/cancelled link.
    const invite = await getHouseholdInviteByToken(inviteToken);
    if (!invite)               return { skipped: true, reason: 'invite not found' };
    if (invite.redeemed_at)    return { skipped: true, reason: 'already redeemed' };

    const to = invitedEmail || invite.invited_email;
    if (!to) return { skipped: true, reason: 'no recipient' };

    const { subject, html, text } = householdInviteEmail({
      inviterName:   invite.invited_by_name,
      householdName: invite.household_name,
      token:         invite.token,
      expiresAt:     invite.expires_at,
    });
    const result = await resend.emails.send({ from: FROM, to, subject, html, text });

    console.log(`[email-worker] household invite sent to ${to}`);
    return { emailId: result.id };
  }

  if (job.name === JobType.SEND_WELCOME_STEP) {
    const { userId } = job.data;
    const user = await getUserById(userId);
    if (!user || !Array.isArray(user.welcome_series) || user.tips_opted_out) return { skipped: true };

    const ctx = await getWelcomeSeriesContext(userId);
    const { key, skipped } = pickWelcomeStep(user, ctx);
    const keys = key ? [...skipped, key] : skipped;
    if (keys.length === 0) return { skipped: true, reason: 'series finished' };

    // Render before claiming so a template error leaves the series untouched.
    let email = null;
    if (key) {
      const token = await ensureInboundToken(userId);
      const inboundAddress = `add+${token}@${process.env.INBOUND_DOMAIN || 'inbox.sportscalapp.com'}`;
      const unsubscribeUrl = tipsUnsubscribeUrl(userId);
      email = { ...renderWelcomeEmail(key, { user, ctx, inboundAddress, unsubscribeUrl }), unsubscribeUrl };
    }

    const prevSeries = user.welcome_series;
    const prevSentAt = user.welcome_series_sent_at;
    if (!(await claimWelcomeSeriesStep(userId, keys, prevSeries))) {
      return { skipped: true, reason: 'already claimed' };
    }
    if (!email) return { skipped: true, reason: 'nothing left applies', keys };

    try {
      const result = await resend.emails.send({
        from: `${WELCOME_FROM_NAME} <${process.env.EMAIL_FROM || 'noreply@mail.sportscalapp.com'}>`,
        to: user.email,
        reply_to: REPLY_TO,
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: {
          'List-Unsubscribe': `<${email.unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      if (result?.error) throw new Error(result.error.message || 'Resend error');
      console.log(`[email-worker] welcome "${key}" sent to user ${userId}` + (skipped.length ? ` (skipped ${skipped.join(', ')})` : ''));
      return { emailId: result?.data?.id, step: key, skipped };
    } catch (err) {
      await releaseWelcomeSeriesStep(userId, prevSeries, prevSentAt);
      throw err;
    }
  }
}, {
  connection,
  concurrency: 5,
  // Resend allows 10 API calls a second. A 9 AM welcome-series batch can
  // queue a couple hundred sends at once, so stay well under that.
  limiter: { max: 5, duration: 1000 },
});

worker.on('completed', (job, result) => console.log(`[email-worker] job ${job.id} completed`, result));
worker.on('failed',    (job, err)    => console.error(`[email-worker] job ${job.id} failed:`, err.message));

console.log('[email-worker] ready');
export default worker;
