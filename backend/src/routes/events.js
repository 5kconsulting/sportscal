import { Router } from 'express';
import { query as dbQuery, queryOne } from '../db/index.js';
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
    filters.push(`
      e.id IN (
        SELECT DISTINCT e2.id FROM events e2
        JOIN kid_sources ks ON ks.source_id = e2.source_id
        WHERE ks.kid_id = $${params.length + 1}
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
       json_agg(
         json_build_object('id', k.id, 'name', k.name, 'color', k.color)
       ) FILTER (WHERE k.id IS NOT NULL) AS kids
     FROM events e
     JOIN sources s ON s.id = e.source_id
     LEFT JOIN kid_sources ks ON ks.source_id = e.source_id
     LEFT JOIN kids k ON k.id = ks.kid_id
     WHERE e.user_id = $1
       AND e.starts_at BETWEEN NOW() AND NOW() + ($2 || ' days')::INTERVAL
       ${whereClause}
     GROUP BY e.id, s.name, s.app
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
       json_agg(
         json_build_object('id', k.id, 'name', k.name, 'color', k.color)
       ) FILTER (WHERE k.id IS NOT NULL) AS kids
     FROM events e
     JOIN sources s ON s.id = e.source_id
     LEFT JOIN kid_sources ks ON ks.source_id = e.source_id
     LEFT JOIN kids k ON k.id = ks.kid_id
     WHERE e.user_id = $1
       AND e.starts_at::date = NOW()::date
     GROUP BY e.id, s.name, s.app
     ORDER BY e.starts_at`,
    [req.user.id]
  );

  res.json({ events, count: events.length });
});

// ============================================================
// GET /api/events/:id
// ============================================================
router.get('/:id', async (req, res) => {
  const event = await queryOne(
    `SELECT e.*, s.name AS source_name, s.app AS source_app,
       json_agg(
         json_build_object('id', k.id, 'name', k.name, 'color', k.color)
       ) FILTER (WHERE k.id IS NOT NULL) AS kids
     FROM events e
     JOIN sources s ON s.id = e.source_id
     LEFT JOIN kid_sources ks ON ks.source_id = e.source_id
     LEFT JOIN kids k ON k.id = ks.kid_id
     WHERE e.id = $1 AND e.user_id = $2
     GROUP BY e.id, s.name, s.app`,
    [req.params.id, req.user.id]
  );

  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json({ event });
});

export default router;
