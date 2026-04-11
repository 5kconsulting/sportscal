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

      const event = await queryOne(
        `INSERT INTO events
           (user_id, source_id, source_uid, raw_title, display_title,
            location, description, starts_at, ends_at, all_day, content_hash, last_seen_at, recurrence_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12)
         RETURNING *`,
        [req.user.id, source.id, sourceUid, instance.rawTitle, instance.displayTitle,
         instance.location, instance.description,
         instance.startsAt, instance.endsAt, instance.allDay, contentHash, recurrenceId]
      );
      createdEvents.push(event);
    }

    if (req.body.kid_ids?.length) {
      for (const kidId of req.body.kid_ids) {
        await query(
          `INSERT INTO kid_sources (source_id, kid_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [source.id, kidId]
        );
      }
    }

    await invalidateFeedCache(req.user.id);
    res.status(201).json({ event: createdEvents[0], count: createdEvents.length });
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

    const event = await queryOne(
      `UPDATE events SET
         raw_title     = $2,
         display_title = $3,
         location      = $4,
         description   = $5,
         starts_at     = $6,
         ends_at       = $7,
         all_day       = $8,
         content_hash  = $9
       WHERE id = $1
       RETURNING *`,
      [req.params.id, rawTitle, displayTitle, location,
       req.body.description !== undefined ? req.body.description : existing.description,
       startsAt, endsAt,
       req.body.all_day !== undefined ? req.body.all_day : existing.all_day,
       contentHash]
    );

    await invalidateFeedCache(req.user.id);
    res.json({ event });
  }
);

export default router;

