import { Router } from 'express';
import { query as dbQuery, queryOne, hideEvent, unhideEvent, getHiddenEvents } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// ============================================================
// GET /api/events
// Query params:
//   days    — how many days ahead (default 30, max 365)
//   kid_id  — filter to one kid
//   source_id — filter to one source
// ============================================================
router.get('/', async (req, res) => {
  const days     = Math.min(parseInt(req.query.days || '30', 10), 365);
  const kidId    = req.query.kid_id    || null;
  const sourceId = req.query.source_id || null;

  const params  = [req.user.id, days];
  const filters = [];

  if (kidId) {
    // Match the same per-event vs source-level precedence the kids
    // aggregation uses below: assigned_kid_ids wins for manual events,
    // kid_sources is the fallback for ingested feeds + legacy rows.
    const n = params.length + 1;
    filters.push(`
      (
        (e.assigned_kid_ids IS NOT NULL AND $${n} = ANY(e.assigned_kid_ids))
        OR (e.assigned_kid_ids IS NULL AND e.id IN (
          SELECT DISTINCT e2.id FROM events e2
          JOIN kid_sources ks ON ks.source_id = e2.source_id
          WHERE ks.kid_id = $${n}
        ))
      )`);
    params.push(kidId);
  }

  if (sourceId) {
    filters.push(`e.source_id = $${params.length + 1}`);
    params.push(sourceId);
  }

  const whereClause = filters.length
    ? 'AND ' + filters.join(' AND ')
    : '';

  const events = await dbQuery(
    `SELECT
       e.*,
       s.name  AS source_name,
       s.app   AS source_app,
       -- Per-event kid assignment takes precedence over the source-level
       -- mapping. Manual events set assigned_kid_ids explicitly so they
       -- only show the kids the user picked at create time; everything
       -- else (TeamSnap, GameChanger, etc.) leaves it NULL and inherits
       -- the kid_sources mapping like before.
       COALESCE(
         (SELECT json_agg(json_build_object('id', k.id, 'name', k.name, 'color', k.color))
            FROM unnest(e.assigned_kid_ids) AS akid_id
            JOIN kids k ON k.id = akid_id),
         (SELECT json_agg(json_build_object('id', k.id, 'name', k.name, 'color', k.color))
            FROM kid_sources ks
            JOIN kids k ON k.id = ks.kid_id
           WHERE ks.source_id = e.source_id)
       ) AS kids
     FROM events e
     JOIN sources s ON s.id = e.source_id
     LEFT JOIN hidden_events he
       ON he.user_id    = e.user_id
      AND he.source_id  = e.source_id
      AND he.source_uid = e.source_uid
     WHERE e.user_id = $1
       AND he.id IS NULL
       -- Keep events visible through their effective end. ends_at if set,
       -- or starts_at+24h for all-day, or starts_at+2h for untimed events.
       AND CASE
             WHEN e.ends_at IS NOT NULL THEN e.ends_at
             WHEN e.all_day            THEN e.starts_at + INTERVAL '1 day'
             ELSE                            e.starts_at + INTERVAL '2 hours'
           END >= NOW()
       AND e.starts_at <= NOW() + ($2 || ' days')::INTERVAL
       ${whereClause}
     ORDER BY e.starts_at`,
    params
  );

  res.json({ events, count: events.length });
});

// ============================================================
// GET /api/events/today
// Convenience endpoint for the dashboard "today" view
// ============================================================
router.get('/today', async (req, res) => {
  const events = await dbQuery(
    `SELECT e.*, s.name AS source_name, s.app AS source_app,
       COALESCE(
         (SELECT json_agg(json_build_object('id', k.id, 'name', k.name, 'color', k.color))
            FROM unnest(e.assigned_kid_ids) AS akid_id
            JOIN kids k ON k.id = akid_id),
         (SELECT json_agg(json_build_object('id', k.id, 'name', k.name, 'color', k.color))
            FROM kid_sources ks
            JOIN kids k ON k.id = ks.kid_id
           WHERE ks.source_id = e.source_id)
       ) AS kids
     FROM events e
     JOIN sources s ON s.id = e.source_id
     LEFT JOIN hidden_events he
       ON he.user_id    = e.user_id
      AND he.source_id  = e.source_id
      AND he.source_uid = e.source_uid
     WHERE e.user_id = $1
       AND he.id IS NULL
       AND e.starts_at::date = NOW()::date
     ORDER BY e.starts_at`,
    [req.user.id]
  );

  res.json({ events, count: events.length });
});

// ============================================================
// GET /api/events/hidden
// List events the user has hidden via "Remove from SportsCal".
// Used by the Settings → Hidden events management screen.
// MUST be declared BEFORE GET /:id or Express will route /hidden
// into the parameterized handler.
// ============================================================
router.get('/hidden', async (req, res) => {
  const hidden = await getHiddenEvents(req.user.id);
  res.json({ hidden, count: hidden.length });
});

// ============================================================
// DELETE /api/events/hidden/:id
// Un-hide. Restores the event to the user's calendar on next render.
// Returns 204 even if the hidden row doesn't exist — DELETE is idempotent.
// ============================================================
router.delete('/hidden/:id', async (req, res) => {
  await unhideEvent(req.params.id, req.user.id);
  res.status(204).end();
});

// ============================================================
// DELETE /api/events/:id
// "Remove from SportsCal." Soft-hides the event by inserting into
// hidden_events keyed on source_uid — so the hide survives the next
// iCal feed refresh, which would otherwise drop+re-insert the row.
// Returns 404 if the event doesn't exist (or belongs to another user).
// ============================================================
router.delete('/:id', async (req, res) => {
  const hidden = await hideEvent(req.params.id, req.user.id);
  if (!hidden) return res.status(404).json({ error: 'Event not found' });
  res.json({ hidden });
});

// ============================================================
// GET /api/events/:id
// ============================================================
router.get('/:id', async (req, res) => {
  const event = await queryOne(
    `SELECT e.*, s.name AS source_name, s.app AS source_app,
       COALESCE(
         (SELECT json_agg(json_build_object('id', k.id, 'name', k.name, 'color', k.color))
            FROM unnest(e.assigned_kid_ids) AS akid_id
            JOIN kids k ON k.id = akid_id),
         (SELECT json_agg(json_build_object('id', k.id, 'name', k.name, 'color', k.color))
            FROM kid_sources ks
            JOIN kids k ON k.id = ks.kid_id
           WHERE ks.source_id = e.source_id)
       ) AS kids
     FROM events e
     JOIN sources s ON s.id = e.source_id
     WHERE e.id = $1 AND e.user_id = $2`,
    [req.params.id, req.user.id]
  );

  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json({ event });
});

export default router;
