import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { query, queryOne, invalidateFeedCache, getKidsByUser } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { buildDisplayTitle } from '../normalizer.js';
import crypto from 'crypto';

const router = Router();
router.use(requireAuth);

// ============================================================
// Manual events — user-created events that go into the feed
// Stored in the events table with a special "manual" source
// per user, created on first use.
// ============================================================

async function getOrCreateManualSource(userId) {
  // Look for existing manual source for this user
  let source = await queryOne(
    `SELECT * FROM sources WHERE user_id = $1 AND app = 'custom' AND name = '__manual__'`,
    [userId]
  );

  if (!source) {
    source = await queryOne(
      `INSERT INTO sources (user_id, name, app, fetch_type, refresh_interval_minutes)
       VALUES ($1, '__manual__', 'custom', 'ical', 99999)
       RETURNING *`,
      [userId]
    );
  }

  return source;
}

// ============================================================
// GET /api/manual
// ============================================================
router.get('/', async (req, res) => {
  const events = await query(
    `SELECT e.* FROM events e
     JOIN sources s ON s.id = e.source_id
     WHERE e.user_id = $1 AND s.name = '__manual__'
     ORDER BY e.starts_at`,
    [req.user.id]
  );
  res.json({ events });
});

// ============================================================
// POST /api/manual
// ============================================================
router.post('/',
  [
    body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }),
    body('starts_at').isISO8601().withMessage('Valid start date required'),
    body('ends_at').optional({ nullable: true }).isISO8601(),
    body('location').optional({ nullable: true }).trim().isLength({ max: 300 }),
    body('description').optional({ nullable: true }).trim().isLength({ max: 2000 }),
    body('all_day').optional().isBoolean(),
    body('kid_ids').optional().isArray(),
    body('kid_ids.*').optional().isUUID(),
    body('recurrence').optional({ nullable: true }).isIn(['none', 'weekly', 'biweekly', 'monthly']),
    body('recurrence_days').optional().isArray(),
    body('recurrence_until').optional({ nullable: true }).isISO8601(),
    body('is_private').optional().isBoolean(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const source = await getOrCreateManualSource(req.user.id);

    let kids = [];
    if (req.body.kid_ids?.length) {
      const allKids = await getKidsByUser(req.user.id);
      kids = allKids.filter(k => req.body.kid_ids.includes(k.id));
    }

    const rawTitle    = req.body.title;
    const location    = req.body.location || null;
    const displayTitle = buildDisplayTitle(rawTitle, location, kids);
    const startsAt    = new Date(req.body.starts_at);
    const endsAt      = req.body.ends_at ? new Date(req.body.ends_at) : null;
    const duration    = endsAt ? endsAt.getTime() - startsAt.getTime() : null;
    const recurrence  = req.body.recurrence || 'none';
    const recurrenceDays = req.body.recurrence_days || [];
    const recurrenceUntil = req.body.recurrence_until ? new Date(req.body.recurrence_until) : null;

    // Generate all event instances
    const instances = generateInstances({
      rawTitle, location, displayTitle,
      startsAt, endsAt, duration,
      allDay: req.body.all_day || false,
      description: req.body.description || null,
      recurrence, recurrenceDays, recurrenceUntil,
    });

    const recurrenceId = instances.length > 1 ? crypto.randomUUID() : null;
    const createdEvents = [];

    for (const instance of instances) {
      const sourceUid = `manual-${crypto.randomUUID()}`;
      const contentHash = crypto.createHash('sha256')
        .update(`${instance.rawTitle}|${instance.location}|${instance.startsAt.toISOString()}`)
        .digest('hex').slice(0, 16);

      // assigned_kid_ids is the per-event explicit kid list. The single
      // shared __manual__ source backs every manual event, so the older
      // kid_sources-per-source mapping made every manual event show every
      // kid that had ever appeared on any manual event. assigned_kid_ids
      // is read in preference by every events query (see the COALESCE
      // pattern in routes/events.js and db/index.js#getUpcomingEvents).
      const assignedKidIds = req.body.kid_ids?.length ? req.body.kid_ids : null;

      const event = await queryOne(
        `INSERT INTO events
           (user_id, source_id, source_uid, raw_title, display_title,
            location, description, starts_at, ends_at, all_day, content_hash, last_seen_at, recurrence_id, is_private, assigned_kid_ids)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12,$13,$14)
         RETURNING *`,
        [req.user.id, source.id, sourceUid, instance.rawTitle, instance.displayTitle,
         instance.location, instance.description,
         instance.startsAt, instance.endsAt, instance.allDay, contentHash, recurrenceId,
         req.body.is_private === true, assignedKidIds]
      );
      createdEvents.push(event);
    }

    // No longer touch kid_sources for the manual source. The per-event
    // assigned_kid_ids set above is the authoritative mapping for new
    // events; legacy events (pre-column) still fall back to the existing
    // kid_sources rows already in the table.

    await invalidateFeedCache(req.user.id);

    // Re-fetch the newly created events with source + kids aggregated
    // through the same COALESCE pattern GET /events uses. Without this
    // the dashboard's EventCard renders with no avatars and no
    // manual-event controls until the user reloads.
    const eventIds = createdEvents.map(e => e.id);
    const enriched = await query(
      `SELECT e.*, s.name AS source_name, s.app AS source_app,
              COALESCE(
                (SELECT json_agg(json_build_object('id', k.id, 'name', k.name, 'color', k.color))
                   FROM unnest(e.assigned_kid_ids) AS akid_id
                   JOIN kids k ON k.id = akid_id),
                (SELECT json_agg(json_build_object('id', k.id, 'name', k.name, 'color', k.color))
                   FROM kid_sources ks
                   JOIN kids k ON k.id = ks.kid_id
                  WHERE ks.source_id = e.source_id
                    AND (ks.title_contains IS NULL OR e.raw_title ILIKE '%' || ks.title_contains || '%')),
                (SELECT json_agg(json_build_object('id', k.id, 'name', k.name, 'color', k.color))
                   FROM kid_sources ks
                   JOIN kids k ON k.id = ks.kid_id
                  WHERE ks.source_id = e.source_id)
              ) AS kids
         FROM events e
         JOIN sources s ON s.id = e.source_id
        WHERE e.id = ANY($1::uuid[])
        ORDER BY e.starts_at`,
      [eventIds]
    );

    res.status(201).json({ event: enriched[0], count: enriched.length });
  }
);

// ============================================================
// DELETE /api/manual/:id
// Optionally delete all events in the same recurrence series
// ============================================================
router.delete('/:id',
  [param('id').isUUID()],
  async (req, res) => {
    const existing = await queryOne(
      `SELECT e.recurrence_id FROM events e
       WHERE e.id = $1 AND e.user_id = $2
         AND e.source_id IN (SELECT id FROM sources WHERE name = '__manual__' AND user_id = $2)`,
      [req.params.id, req.user.id]
    );

    if (!existing) return res.status(404).json({ error: 'Event not found' });

    const deleteAll = req.query.series === 'true' && existing.recurrence_id;

    if (deleteAll) {
      await query(
        `DELETE FROM events WHERE recurrence_id = $1 AND user_id = $2`,
        [existing.recurrence_id, req.user.id]
      );
    } else {
      await query(
        `DELETE FROM events WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.user.id]
      );
    }

    await invalidateFeedCache(req.user.id);
    res.json({ ok: true, deletedSeries: !!deleteAll });
  }
);

// ============================================================
// Instance generator
// ============================================================
function generateInstances({ rawTitle, location, displayTitle, startsAt, endsAt, duration,
  allDay, description, recurrence, recurrenceDays, recurrenceUntil }) {

  if (recurrence === 'none' || !recurrenceUntil) {
    return [{ rawTitle, location, displayTitle, startsAt, endsAt, allDay, description }];
  }

  const instances = [];
  const until = new Date(recurrenceUntil);
  until.setHours(23, 59, 59, 999);

  // Max 365 instances as a safety cap
  const MAX = 365;

  if (recurrence === 'weekly' || recurrence === 'biweekly') {
    const intervalDays = recurrence === 'biweekly' ? 14 : 7;
    const days = recurrenceDays.length > 0 ? recurrenceDays.map(Number) : [startsAt.getDay()];

    let current = new Date(startsAt);
    current.setHours(0, 0, 0, 0);

    // Start from the beginning of the week containing startsAt
    const startDay = startsAt.getDay();

    // Generate weekly occurrences
    let weekStart = new Date(current);
    weekStart.setDate(weekStart.getDate() - startDay); // go to Sunday of this week

    while (instances.length < MAX) {
      for (const day of days.sort((a, b) => a - b)) {
        const occDate = new Date(weekStart);
        occDate.setDate(occDate.getDate() + day);

        // Must be >= original start date and <= until
        if (occDate < startsAt) continue;
        if (occDate > until) break;

        const occStart = new Date(occDate);
        occStart.setHours(startsAt.getHours(), startsAt.getMinutes(), startsAt.getSeconds());
        const occEnd = duration ? new Date(occStart.getTime() + duration) : null;

        instances.push({ rawTitle, location, displayTitle, startsAt: occStart, endsAt: occEnd, allDay, description });
        if (instances.length >= MAX) break;
      }

      weekStart.setDate(weekStart.getDate() + intervalDays);
      if (weekStart > until) break;
    }

  } else if (recurrence === 'monthly') {
    let current = new Date(startsAt);
    while (current <= until && instances.length < MAX) {
      const occEnd = duration ? new Date(current.getTime() + duration) : null;
      instances.push({ rawTitle, location, displayTitle, startsAt: new Date(current), endsAt: occEnd, allDay, description });
      current.setMonth(current.getMonth() + 1);
    }
  }

  return instances.length > 0 ? instances : [{ rawTitle, location, displayTitle, startsAt, endsAt, allDay, description }];
}
router.patch('/:id',
  [
    param('id').isUUID(),
    body('title').optional().trim().notEmpty().isLength({ max: 200 }),
    body('starts_at').optional().isISO8601(),
    body('ends_at').optional({ nullable: true }).isISO8601(),
    body('location').optional({ nullable: true }).trim().isLength({ max: 300 }),
    body('description').optional({ nullable: true }).trim().isLength({ max: 2000 }),
    body('all_day').optional().isBoolean(),
    body('kid_ids').optional().isArray(),
    body('kid_ids.*').optional().isUUID(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    // Verify event belongs to user and is manual
    const existing = await queryOne(
      `SELECT e.* FROM events e
       JOIN sources s ON s.id = e.source_id
       WHERE e.id = $1 AND e.user_id = $2 AND s.name = '__manual__'`,
      [req.params.id, req.user.id]
    );

    if (!existing) return res.status(404).json({ error: 'Event not found' });

    const rawTitle = req.body.title || existing.raw_title;
    const location = req.body.location !== undefined ? req.body.location : existing.location;
    const startsAt = req.body.starts_at ? new Date(req.body.starts_at) : existing.starts_at;
    const endsAt   = req.body.ends_at !== undefined
      ? (req.body.ends_at ? new Date(req.body.ends_at) : null)
      : existing.ends_at;

    let kids = [];
    if (req.body.kid_ids?.length) {
      const allKids = await getKidsByUser(req.user.id);
      kids = allKids.filter(k => req.body.kid_ids.includes(k.id));
    }

    const displayTitle = buildDisplayTitle(rawTitle, location, kids);
    const contentHash  = crypto.createHash('sha256')
      .update(`${rawTitle}|${location}|${new Date(startsAt).toISOString()}`)
      .digest('hex').slice(0, 16);

    // Update assigned_kid_ids when kid_ids is explicitly included in the
    // request (even as an empty array, which would clear the assignment
    // back to the source-level fallback). Omitting kid_ids leaves the
    // existing assignment intact.
    const assignedKidIds = req.body.kid_ids !== undefined
      ? (req.body.kid_ids.length ? req.body.kid_ids : null)
      : existing.assigned_kid_ids;

    await queryOne(
      `UPDATE events SET
         raw_title        = $2,
         display_title    = $3,
         location         = $4,
         description      = $5,
         starts_at        = $6,
         ends_at          = $7,
         all_day          = $8,
         content_hash     = $9,
         assigned_kid_ids = $10
       WHERE id = $1
       RETURNING *`,
      [req.params.id, rawTitle, displayTitle, location,
       req.body.description !== undefined ? req.body.description : existing.description,
       startsAt, endsAt,
       req.body.all_day !== undefined ? req.body.all_day : existing.all_day,
       contentHash, assignedKidIds]
    );

    await invalidateFeedCache(req.user.id);

    // Return enriched shape (matches GET /events) so the dashboard's
    // optimistic update has source_app, source_name, and the kids array.
    const event = await queryOne(
      `SELECT e.*, s.name AS source_name, s.app AS source_app,
              COALESCE(
                (SELECT json_agg(json_build_object('id', k.id, 'name', k.name, 'color', k.color))
                   FROM unnest(e.assigned_kid_ids) AS akid_id
                   JOIN kids k ON k.id = akid_id),
                (SELECT json_agg(json_build_object('id', k.id, 'name', k.name, 'color', k.color))
                   FROM kid_sources ks
                   JOIN kids k ON k.id = ks.kid_id
                  WHERE ks.source_id = e.source_id
                    AND (ks.title_contains IS NULL OR e.raw_title ILIKE '%' || ks.title_contains || '%')),
                (SELECT json_agg(json_build_object('id', k.id, 'name', k.name, 'color', k.color))
                   FROM kid_sources ks
                   JOIN kids k ON k.id = ks.kid_id
                  WHERE ks.source_id = e.source_id)
              ) AS kids
         FROM events e
         JOIN sources s ON s.id = e.source_id
        WHERE e.id = $1`,
      [req.params.id]
    );

    res.json({ event });
  }
);

export default router;

