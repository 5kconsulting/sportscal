import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getUserByFeedToken,
  getKidByFeedToken,
  getUpcomingEvents,
  getFeedCache,
  setFeedCache,
  getKidsForEvents,
  query,
} from '../db/index.js';
import { applyAttendance } from '../normalizer.js';

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

  // Build fresh .ics — apply attendance overrides. excludePrivate=true
  // keeps user-marked private events out of the family-shared feed.
  const events = await getUpcomingEvents(user.id, { days: 90, excludePrivate: true });

  // getUpcomingEvents returns bare event rows, so resolve each event's
  // kids separately — the override logic below needs them, and so does
  // the per-event X-APPLE-CALENDAR-COLOR in buildIcal.
  const kidsByEvent = await getKidsForEvents(events.map(e => e.id));

  // "Not going" overrides, grouped by event. Override writes are
  // owner-only (routes/overrides.js), so the feed owner's rows are the
  // complete set for their events.
  const overrides = await query(
    `SELECT event_id, kid_id
       FROM event_overrides
      WHERE user_id = $1 AND attending = false`,
    [user.id]
  );
  const notGoingByEvent = new Map();
  for (const o of overrides) {
    if (!notGoingByEvent.has(o.event_id)) notGoingByEvent.set(o.event_id, new Set());
    notGoingByEvent.get(o.event_id).add(o.kid_id);
  }

  // Drop kids marked not going (and their name from the title); drop the
  // event entirely when nobody on it is going.
  const processedEvents = events
    .map(event => applyAttendance(
      event,
      kidsByEvent.get(event.id) || [],
      notGoingByEvent.get(event.id),
    ))
    .filter(Boolean);

  const icalContent = buildIcal(user, processedEvents);

  // Store in cache
  await setFeedCache(user.id, icalContent, processedEvents.length);

  res
    .set('Content-Type', 'text/calendar; charset=utf-8')
    .set('Content-Disposition', 'attachment; filename="sportscal.ics"')
    .set('Cache-Control', 'no-cache')
    .send(icalContent);
});

// ============================================================
// GET /feed/kid/:token.ics
//
// Per-kid public feed. The kid's own device subscribes to this
// URL — Apple Calendar, Google Calendar, whatever — and sees
// only their events with logistics info ("Pickup: Linda")
// embedded in each event's description.
//
// No caching for v1 — each request rebuilds. SportsCal's
// per-kid event volume is small and most calendar apps poll on
// the order of every few hours, so the load is negligible vs
// the complexity of a separate kid-feed cache.
// ============================================================
router.get('/kid/:token.ics', feedLimiter, async (req, res) => {
  const { token } = req.params;

  const kid = await getKidByFeedToken(token);
  if (!kid) {
    return res.status(200)
      .set('Content-Type', 'text/calendar; charset=utf-8')
      .send(emptyCalendar());
  }

  // Filter events to just this kid via getUpcomingEvents' kidId
  // option (which joins through kid_sources). Per-kid feeds INCLUDE
  // private events: the whole point of marking an event "only show in
  // <kid>'s calendar" is that it stays out of the family-wide feed but
  // still reaches whoever subscribes to that kid's individual feed
  // (the kid's other parent, the kid's school, etc.).
  const events = await getUpcomingEvents(kid.user_id, { days: 90, kidId: kid.id });

  // Apply this-kid attendance overrides only — if the kid is
  // marked not-attending for an event, drop it entirely from
  // their personal feed.
  const overrides = await query(
    `SELECT event_id, attending
       FROM event_overrides
      WHERE user_id = $1 AND kid_id = $2`,
    [kid.user_id, kid.id]
  );
  const skipEventIds = new Set(
    overrides.filter(o => !o.attending).map(o => o.event_id)
  );

  // Logistics info per event. We embed it in the iCal description
  // so the kid sees "Pickup: Linda" right inside the calendar
  // event without needing the SportsCal app.
  const logistics = await query(
    `SELECT el.event_id, el.role, el.status, c.name AS contact_name
       FROM event_logistics el
       JOIN contacts c ON c.id = el.contact_id
      WHERE el.user_id = $1`,
    [kid.user_id]
  );
  const logByEvent = {};
  for (const l of logistics) {
    (logByEvent[l.event_id] = logByEvent[l.event_id] || []).push(l);
  }

  const finalEvents = events
    .filter(e => !skipEventIds.has(e.id))
    .map(e => ({
      ...e,
      // Stuff the logistics summary into the description so it
      // shows up natively in the kid's calendar app.
      description: appendLogisticsToDescription(e.description, logByEvent[e.id]),
    }));

  const icalContent = buildKidIcal(kid, finalEvents);

  res
    .set('Content-Type', 'text/calendar; charset=utf-8')
    .set('Content-Disposition', `attachment; filename="${kidSlug(kid.name)}.ics"`)
    .set('Cache-Control', 'no-cache')
    .send(icalContent);
});

function appendLogisticsToDescription(existing, log) {
  if (!log?.length) return existing || '';
  const statusLabel = (s) =>
    s === 'confirmed' ? 'confirmed'
    : s === 'declined' ? 'declined'
    : s === 'requested' ? 'awaiting reply'
    : 'assigned';
  const lines = log
    .sort((a, b) => a.role.localeCompare(b.role))
    .map(l => {
      const role = l.role === 'pickup' ? 'Pickup' : 'Dropoff';
      return `${role}: ${l.contact_name} (${statusLabel(l.status)})`;
    });
  return [existing || '', '', ...lines].filter(Boolean).join('\n').trim();
}

function buildKidIcal(kid, events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SportsCal//Kid Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${kid.name}'s SportsCal`,
    `X-WR-CALDESC:${kid.name}'s schedule`,
    'X-PUBLISHED-TTL:PT2H',
  ];
  for (const event of events) {
    const startsAt = new Date(event.starts_at);
    const endsAt   = event.ends_at ? new Date(event.ends_at) : addHour(startsAt);
    const now      = new Date();
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:kid-${kid.id}-${event.id}`);
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
    if (event.location)    lines.push(`LOCATION:${escapeIcal(event.location)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeIcal(event.description)}`);
    if (kid.color)         lines.push(`X-APPLE-CALENDAR-COLOR:${kid.color.toUpperCase()}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function kidSlug(name) {
  return (name || 'kid').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'kid';
}

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
