import { Worker } from 'bullmq';
import { Expo } from 'expo-server-sdk';
import {
  getUserById, getUpcomingEvents, getPushTokensForUser, deletePushToken,
} from '../db/index.js';
import { connection, JobType } from './queue.js';

// One client per process; the SDK handles batching + retries internally.
// We don't need an FCM/APNs access token because Expo Push uses the
// EAS project's credentials (configured via `eas credentials` and stored
// on the EAS dashboard, not in our backend).
const expo = new Expo();

const worker = new Worker('push-send', async (job) => {
  if (job.name !== JobType.PUSH_DIGEST) return;

  const { userId } = job.data;
  const user = await getUserById(userId);
  if (!user || !user.push_enabled) return { skipped: true, reason: 'push disabled' };

  const tokens = await getPushTokensForUser(userId);
  if (tokens.length === 0) return { skipped: true, reason: 'no tokens' };

  // Find events that fall on the user's local "tomorrow." We pull a 2-day
  // window because getUpcomingEvents returns events ordered by start_at
  // in UTC; we then filter by the user's-tz date to avoid edge cases
  // where a 11pm-local game on Saturday looks like a Sunday event in UTC.
  const tomorrowLocal = tomorrowDateInTz(user.timezone);
  const events = (await getUpcomingEvents(userId, { days: 2 })).filter((e) => {
    const localDate = dateInTz(new Date(e.starts_at), user.timezone);
    return localDate === tomorrowLocal;
  });

  if (events.length === 0) return { skipped: true, reason: 'no events tomorrow' };

  const { title, body } = renderDigest(events, user.timezone);

  // Build one push message per token. Expo's batching means we still
  // get a single API call per chunk of ~100, so duplicating the body
  // across multiple devices for the same user is cheap.
  const messages = tokens
    .filter((t) => Expo.isExpoPushToken(t.token))
    .map((t) => ({
      to:    t.token,
      sound: 'default',
      title,
      body,
      // data is delivered with the push so the mobile tap-handler can
      // deep-link to the right screen. We send the date string so the
      // calendar tab can jump to tomorrow without a round-trip.
      data:  { type: 'night_digest', date: tomorrowLocal },
    }));

  if (messages.length === 0) return { skipped: true, reason: 'no valid expo tokens' };

  const chunks = expo.chunkPushNotifications(messages);
  let sent = 0;
  let dead = 0;

  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      // Tickets are 1:1 with the chunk; failures here are usually
      // DeviceNotRegistered (uninstalled / permission revoked) — purge
      // those tokens immediately so the next digest doesn't waste an
      // API call on them.
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        if (ticket.status === 'ok') {
          sent++;
        } else if (ticket.details?.error === 'DeviceNotRegistered') {
          await deletePushToken(chunk[i].to);
          dead++;
        } else {
          console.warn(`[push-worker] ticket error for ${chunk[i].to}:`, ticket.message);
        }
      }
    } catch (err) {
      console.error('[push-worker] chunk send failed:', err.message);
      throw err;
    }
  }

  console.log(`[push-worker] user=${userId} sent=${sent} dead=${dead} events=${events.length}`);
  return { sent, dead, events: events.length };
}, { connection, concurrency: 5 });

// ============================================================
// Helpers
// ============================================================

// Returns 'YYYY-MM-DD' for the user's local date "tomorrow." Built
// from Intl rather than date-fns-tz to avoid pulling in another dep.
function tomorrowDateInTz(tz) {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + 1);
  // Push it forward 24h then format in tz — sufficient because we only
  // fire this job once a day at 8pm local, so DST edges don't apply.
  return dateInTz(now, tz);
}

function dateInTz(date, tz) {
  // en-CA gives YYYY-MM-DD which sorts and compares cleanly as a string.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function renderDigest(events, tz) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: '2-digit',
  });
  const count = events.length;
  const title = count === 1 ? 'Tomorrow on SportsCal' : `Tomorrow: ${count} events`;

  // Mobile push body is small (~178 chars before truncation on iOS).
  // Show up to 3 events, then "+N more" if it overflows.
  const lines = events.slice(0, 3).map((e) => {
    const time = e.all_day ? 'All day' : fmt.format(new Date(e.starts_at));
    const who  = e.display_title || e.title || 'Event';
    return `${time} · ${who}`;
  });
  if (events.length > 3) lines.push(`+${events.length - 3} more`);

  return { title, body: lines.join('\n') };
}

worker.on('completed', (job, result) => console.log(`[push-worker] job ${job.id} completed`, result));
worker.on('failed',    (job, err)    => console.error(`[push-worker] job ${job.id} failed:`, err.message));

console.log('[push-worker] ready');
export default worker;
