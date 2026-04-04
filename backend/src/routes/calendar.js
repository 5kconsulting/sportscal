import { Router } from 'express';
import ical from 'ical-generator';
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
  const cal = ical({
    name:        'SportsCal',
    description: `${user.name}'s family sports schedule`,
    timezone:    user.timezone || 'America/Los_Angeles',
    prodId:      '//SportsCal//Family Schedule//EN',
    // Tells calendar apps to refresh every 2 hours
    refreshInterval: { hours: 2 },
  });

  for (const event of events) {
    const startsAt = new Date(event.starts_at);
    const endsAt   = event.ends_at
      ? new Date(event.ends_at)
      : addHour(startsAt); // default 1h duration if no end time

    const icalEvent = cal.createEvent({
      id:      event.id,               // stable UID — calendar apps use this for updates
      summary: event.display_title,    // "Bob - Soccer Practice at Community Park"
      start:   startsAt,
      end:     endsAt,
      allDay:  event.all_day,
    });

    if (event.location) {
      icalEvent.location(event.location);
    }

    if (event.description) {
      icalEvent.description(event.description);
    }

    // Color hint for supporting clients (Apple Calendar respects this)
    if (event.kids?.[0]?.color) {
      icalEvent.x([{
        key:   'X-APPLE-CALENDAR-COLOR',
        value: event.kids[0].color.toUpperCase(),
      }]);
    }
  }

  return cal.toString();
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
