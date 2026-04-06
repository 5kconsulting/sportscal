import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query, queryOne } from '../db/index.js';

const router = Router();

// ============================================================
// Admin middleware — must be authenticated AND is_admin = true
// ============================================================
async function requireAdmin(req, res, next) {
  try {
    const user = await queryOne(`SELECT is_admin FROM users WHERE id = $1`, [req.user.id]);
    if (!user?.is_admin) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

router.use(requireAuth);
router.use(requireAdmin);

// ============================================================
// GET /api/admin/stats
// High-level numbers
// ============================================================
router.get('/stats', async (_req, res) => {
  try {
    const [users, sources, premium, recentSignups] = await Promise.all([
      queryOne(`SELECT COUNT(*) AS total FROM users`),
      queryOne(`SELECT COUNT(*) AS total FROM sources WHERE enabled = true`),
      queryOne(`SELECT COUNT(*) AS total FROM users WHERE plan = 'premium'`),
      queryOne(`SELECT COUNT(*) AS total FROM users WHERE created_at > NOW() - INTERVAL '7 days'`),
    ]);

    res.json({
      total_users:    Number(users.total),
      premium_users:  Number(premium.total),
      free_users:     Number(users.total) - Number(premium.total),
      active_sources: Number(sources.total),
      new_last_7d:    Number(recentSignups.total),
      mrr:            Number(premium.total) * 5,
    });
  } catch (err) {
    console.error('[admin] stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/admin/users
// All users with source counts
// ============================================================
router.get('/users', async (req, res) => {
  try {
    const { search = '', plan = '' } = req.query;

    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      where += ` AND (u.email ILIKE $${params.length} OR u.name ILIKE $${params.length})`;
    }
    if (plan) {
      params.push(plan);
      where += ` AND u.plan = $${params.length}`;
    }

    const rows = await query(`
      SELECT
        u.id, u.name, u.email, u.plan, u.is_admin,
        u.created_at, u.stripe_customer_id,
        COUNT(DISTINCT s.id) AS source_count,
        COUNT(DISTINCT k.id) AS kid_count,
        MAX(s.last_fetched_at) AS last_sync
      FROM users u
      LEFT JOIN sources s ON s.user_id = u.id AND s.enabled = true
      LEFT JOIN kids k ON k.user_id = u.id
      ${where}
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT 200
    `, params);

    res.json({ users: rows });
  } catch (err) {
    console.error('[admin] users error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/admin/users/:id
// Single user detail with sources and recent events
// ============================================================
router.get('/users/:id', async (req, res) => {
  try {
    const user = await queryOne(`
      SELECT u.*, COUNT(DISTINCT s.id) AS source_count, COUNT(DISTINCT k.id) AS kid_count
      FROM users u
      LEFT JOIN sources s ON s.user_id = u.id
      LEFT JOIN kids k ON k.user_id = u.id
      WHERE u.id = $1
      GROUP BY u.id
    `, [req.params.id]);

    if (!user) return res.status(404).json({ error: 'User not found' });

    const sources = await query(`
      SELECT s.*, COUNT(e.id) AS event_count
      FROM sources s
      LEFT JOIN events e ON e.source_id = s.id
      WHERE s.user_id = $1
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `, [req.params.id]);

    const kids = await query(
      `SELECT * FROM kids WHERE user_id = $1 ORDER BY created_at`,
      [req.params.id]
    );

    res.json({ user, sources, kids });
  } catch (err) {
    console.error('[admin] user detail error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PATCH /api/admin/users/:id
// Update plan or is_admin
// ============================================================
router.patch('/users/:id', async (req, res) => {
  try {
    const { plan, is_admin } = req.body;
    const fields = [];
    const params = [];

    if (plan !== undefined) {
      params.push(plan);
      fields.push(`plan = $${params.length}`);
    }
    if (is_admin !== undefined) {
      params.push(is_admin);
      fields.push(`is_admin = $${params.length}`);
    }

    if (fields.length === 0) {
      return res.status(422).json({ error: 'Nothing to update' });
    }

    params.push(req.params.id);
    const user = await queryOne(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    res.json({ user });
  } catch (err) {
    console.error('[admin] update user error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/admin/sources
// All sources with error status
// ============================================================
router.get('/sources', async (_req, res) => {
  try {
    const rows = await query(`
      SELECT s.*, u.email AS user_email, u.name AS user_name,
             COUNT(e.id) AS event_count
      FROM sources s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN events e ON e.source_id = s.id
      WHERE s.last_fetch_status = 'error'
        AND s.name != '__manual__'
      GROUP BY s.id, u.email, u.name
      ORDER BY s.last_fetched_at DESC
      LIMIT 100
    `);

    res.json({ sources: rows });
  } catch (err) {
    console.error('[admin] sources error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;

// ============================================================
// GET /api/admin/reports
// Growth and revenue data over time
// ============================================================
router.get('/reports', async (_req, res) => {
  try {
    // Signups per day for last 30 days
    const signups = await query(`
      SELECT
        DATE_TRUNC('day', created_at) AS date,
        COUNT(*) AS count,
        COUNT(*) FILTER (WHERE plan = 'premium') AS premium_count
      FROM users
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1
    `);

    // Cumulative users over last 30 days
    const cumulative = await query(`
      SELECT
        DATE_TRUNC('day', created_at) AS date,
        COUNT(*) OVER (ORDER BY DATE_TRUNC('day', created_at)) AS total_users
      FROM users
      ORDER BY 1
    `);

    // Plan breakdown
    const plans = await query(`
      SELECT plan, COUNT(*) AS count
      FROM users
      GROUP BY plan
      ORDER BY count DESC
    `);

    // MRR over time (premium users per day)
    const mrr = await query(`
      SELECT
        DATE_TRUNC('day', created_at) AS date,
        COUNT(*) FILTER (WHERE plan = 'premium') * 5 AS mrr
      FROM users
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1
    `);

    // Source breakdown by app
    const sourceApps = await query(`
      SELECT app, COUNT(*) AS count
      FROM sources
      WHERE name != '__manual__'
      GROUP BY app
      ORDER BY count DESC
    `);

    res.json({ signups, cumulative, plans, mrr, sourceApps });
  } catch (err) {
    console.error('[admin] reports error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
