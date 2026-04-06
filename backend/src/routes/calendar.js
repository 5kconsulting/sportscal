import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getUserByFeedToken,
  getUpcomingEvents,
  getFeedCache,
  setFeedCache,
} from '../db/index.js';

const router = Router();

// Rate limit the feed endpoint — calendar apps poll frequently
const feedLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 30,             // 30 requests/min per IP — enough for any calendar app
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================
// GET /feed/:token.ics
//
// The public calendar feed URL. Token is the user's feed_token
// (not their user ID — can be rotated without changing account).
//
// Calendar apps (Apple, Google, Outlook) subscribe to this URL
// and poll it every few hours. We serve from cache when fresh,
// rebuild when stale.
//
// Cache strategy: rebuild whenever events change (we call
// invalidateFeedCache after every successful worker run),
// and also if cache is older than 2 hours as a safety net.
// ============================================================
router.get('/:token.ics', feedLimiter, async (req, res) => {
  const { token } = req.params;

  // Look up user by feed token
  const user = await getUserByFeedToken(token);
  if (!user) {
    // Return empty valid .ics rather than 404 — prevents calendar apps
    // from showing an error to the user
    return res.status(200)
      .set('Content-Type', 'text/calendar; charset=utf-8')
      .send(emptyCalendar());
  }

  // Check cache freshness (2 hour max age)
  const cache = await getFeedCache(user.id);
  const cacheAge = cache ? (Date.now() - new Date(cache.built_at).getTime()) : Infinity;
  const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

  if (cache && cacheAge < CACHE_TTL_MS) {
    return res
      .set('Content-Type', 'text/calendar; charset=utf-8')
      .set('Content-Disposition', 'attachment; filename="sportscal.ics"')
      .set('Cache-Control', 'no-cache') // tell calendar apps to always revalidate
      .send(cache.ical_content);
  }

  // Build fresh .ics
  const events = await getUpcomingEvents(user.id, { days: 90 });
  const icalContent = buildIcal(user, events);

  // Store in cache
  await setFeedCache(user.id, icalContent, events.length);

  res
    .set('Content-Type', 'text/calendar; charset=utf-8')
    .set('Content-Disposition', 'attachment; filename="sportscal.ics"')
    .set('Cache-Control', 'no-cache')
    .send(icalContent);
});

// ============================================================
// iCal builder
// ============================================================
function buildIcal(user, events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//SportsCal//Family Schedule//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:SportsCal`,
    `X-WR-CALDESC:${user.name}'s family sports schedule`,
    'X-PUBLISHED-TTL:PT2H',
  ];

  for (const event of events) {
    const startsAt = new Date(event.starts_at);
    const endsAt   = event.ends_at ? new Date(event.ends_at) : addHour(startsAt);
    const now      = new Date();

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.id}`);
    lines.push(`SEQUENCE:0`);
    lines.push(`DTSTAMP:${toICalDate(now)}Z`);

    if (event.all_day) {
      lines.push(`DTSTART;VALUE=DATE:${toICalDateOnly(startsAt)}`);
      lines.push(`DTEND;VALUE=DATE:${toICalDateOnly(endsAt)}`);
    } else {
      lines.push(`DTSTART:${toICalDate(startsAt)}Z`);
      lines.push(`DTEND:${toICalDate(endsAt)}Z`);
    }

    lines.push(`SUMMARY:${escapeIcal(event.display_title)}`);

    if (event.location) {
      lines.push(`LOCATION:${escapeIcal(event.location)}`);
    }
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeIcal(event.description)}`);
    }
    if (event.kids?.[0]?.color) {
      lines.push(`X-APPLE-CALENDAR-COLOR:${event.kids[0].color.toUpperCase()}`);
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// Format Date to iCal UTC string: 20260407T010000
function toICalDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '');
}

// Format Date to iCal date-only string: 20260407
function toICalDateOnly(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

// Escape special iCal characters
function escapeIcal(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function addHour(date) {
  return new Date(date.getTime() + 60 * 60 * 1000);
}

function emptyCalendar() {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SportsCal//Empty//EN',
    'X-WR-CALNAME:SportsCal',
    'END:VCALENDAR',
  ].join('\r\n');
}

export default router;
