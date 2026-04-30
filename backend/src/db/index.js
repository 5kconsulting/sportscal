import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// Connection pool
// Reads DATABASE_URL from environment.
// ============================================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max: 20,                  // max connections in pool
  idleTimeoutMillis: 30000, // close idle connections after 30s
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[db] unexpected pool error', err);
});

// ============================================================
// Core query helper
// Returns rows array. Throws on error.
// ============================================================
export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.LOG_QUERIES === 'true') {
      console.log('[db]', { text, duration, rows: result.rowCount });
    }
    return result.rows;
  } catch (err) {
    console.error('[db] query error', { text, params, err: err.message });
    throw err;
  }
}

// Returns a single row or null
export async function queryOne(text, params) {
  const rows = await query(text, params);
  return rows[0] ?? null;
}

// ============================================================
// Transaction helper
// Usage:
//   await withTransaction(async (tx) => {
//     await tx.query('INSERT ...', [...]);
//     await tx.query('UPDATE ...', [...]);
//   });
// ============================================================
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn({
      query: (text, params) => client.query(text, params),
    });
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================
// Schema migration runner
// Applies schema.sql on startup. The schema file is written to
// be IDEMPOTENT — every statement uses IF NOT EXISTS / OR REPLACE
// / DROP + CREATE — so re-running it on an existing DB is safe
// and silent.
//
// For production schema changes beyond what IF NOT EXISTS can
// handle (column renames, data backfills, etc.), use a proper
// migration tool like node-pg-migrate.
// ============================================================
export async function runMigrations() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  // Wrap the whole schema in a transaction so it's all-or-nothing.
  // With idempotent SQL, a failure here is a REAL error — log and throw.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('[db] schema applied');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[db] migration failed', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================
// Health check
// ============================================================
export async function healthCheck() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// Typed query helpers — prevent SQL injection via parameterized
// queries, and keep business logic readable.
// ============================================================

// --- Users ---

export async function getUserById(id) {
  return queryOne(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );
}

export async function getUserByEmail(email) {
  return queryOne(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );
}

export async function getUserByFeedToken(token) {
  return queryOne(
    'SELECT * FROM users WHERE feed_token = $1',
    [token]
  );
}

// Inbound-email addressing: each user gets `add+<inbound_token>@<domain>` so
// the webhook can resolve mail to a user with one indexed lookup.
export async function getUserByInboundToken(token) {
  if (!token) return null;
  return queryOne(
    'SELECT * FROM users WHERE inbound_token = $1',
    [token],
  );
}

// Lazy-create on first request to /api/auth/inbound-address. 8 hex chars
// (4 bytes) -> 4.3B values, ample for our scale and short enough to look
// reasonable in an address.
export async function ensureInboundToken(userId) {
  const updated = await queryOne(
    `UPDATE users
        SET inbound_token = encode(gen_random_bytes(4), 'hex')
      WHERE id = $1 AND inbound_token IS NULL
      RETURNING inbound_token`,
    [userId],
  );
  if (updated?.inbound_token) return updated.inbound_token;
  const existing = await queryOne(
    'SELECT inbound_token FROM users WHERE id = $1',
    [userId],
  );
  return existing?.inbound_token || null;
}

// Per-kid feed lookup. Returns the kid plus the parent's name so the
// iCal feed can label itself "Caleb's SportsCal" without a second query.
export async function getKidByFeedToken(token) {
  return queryOne(
    `SELECT k.*, u.name AS parent_name, u.timezone AS parent_timezone
       FROM kids k
       JOIN users u ON u.id = k.user_id
      WHERE k.feed_token = $1`,
    [token]
  );
}

export async function createUser({
  email, passwordHash, name,
  referralSource = null,
  smsConsentAt = null, smsConsentIp = null,
}) {
  return queryOne(
    `INSERT INTO users (
       email, password_hash, name,
       referral_source, sms_consent_at, sms_consent_ip
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [email, passwordHash, name, referralSource, smsConsentAt, smsConsentIp]
  );
}

export async function updateUser(id, fields) {
  const allowed = [
    'name', 'plan', 'stripe_customer_id', 'stripe_subscription_id',
    'plan_expires_at', 'digest_enabled', 'digest_day', 'digest_hour',
    'reminder_hours_before', 'timezone',
  ];
  const updates = [];
  const values = [];
  let i = 1;

  for (const [key, val] of Object.entries(fields)) {
    if (!allowed.includes(key)) continue;
    updates.push(`${key} = $${i++}`);
    values.push(val);
  }

  if (updates.length === 0) return getUserById(id);

  values.push(id);
  return queryOne(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
}

export async function rotateFeedToken(userId) {
  return queryOne(
    `UPDATE users
     SET feed_token = encode(gen_random_bytes(24), 'hex')
     WHERE id = $1
     RETURNING feed_token`,
    [userId]
  );
}

// --- Kids ---

export async function getKidsByUser(userId) {
  return query(
    'SELECT * FROM kids WHERE user_id = $1 ORDER BY sort_order, name',
    [userId]
  );
}

export async function getKidById(id, userId) {
  return queryOne(
    'SELECT * FROM kids WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
}

export async function createKid({ userId, name, color, sortOrder = 0 }) {
  return queryOne(
    `INSERT INTO kids (user_id, name, color, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, name, color, sortOrder]
  );
}

export async function updateKid(id, userId, fields) {
  const allowed = ['name', 'color', 'sort_order'];
  const updates = [];
  const values = [];
  let i = 1;

  for (const [key, val] of Object.entries(fields)) {
    if (!allowed.includes(key)) continue;
    updates.push(`${key} = $${i++}`);
    values.push(val);
  }

  if (updates.length === 0) return getKidById(id, userId);

  values.push(id, userId);
  return queryOne(
    `UPDATE kids SET ${updates.join(', ')}
     WHERE id = $${i} AND user_id = $${i + 1}
     RETURNING *`,
    values
  );
}

export async function deleteKid(id, userId) {
  return queryOne(
    'DELETE FROM kids WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId]
  );
}

// --- Sources ---

export async function getSourcesByUser(userId) {
  return query(
    `SELECT s.*,
       json_agg(json_build_object('id', k.id, 'name', k.name, 'color', k.color))
         FILTER (WHERE k.id IS NOT NULL) AS kids
     FROM sources s
     LEFT JOIN kid_sources ks ON ks.source_id = s.id
     LEFT JOIN kids k ON k.id = ks.kid_id
     WHERE s.user_id = $1
     GROUP BY s.id
     ORDER BY s.created_at`,
    [userId]
  );
}

export async function getSourceById(id, userId) {
  return queryOne(
    `SELECT s.*,
       json_agg(json_build_object('id', k.id, 'name', k.name, 'color', k.color))
         FILTER (WHERE k.id IS NOT NULL) AS kids
     FROM sources s
     LEFT JOIN kid_sources ks ON ks.source_id = s.id
     LEFT JOIN kids k ON k.id = ks.kid_id
     WHERE s.id = $1 AND s.user_id = $2
     GROUP BY s.id`,
    [id, userId]
  );
}

export async function createSource({
  userId, name, app, fetchType, icalUrl,
  scrapeUrl, scrapeConfig, refreshIntervalMinutes = 120,
}) {
  return queryOne(
    `INSERT INTO sources
       (user_id, name, app, fetch_type, ical_url, scrape_url, scrape_config, refresh_interval_minutes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [userId, name, app, fetchType, icalUrl, scrapeUrl,
     scrapeConfig ? JSON.stringify(scrapeConfig) : null,
     refreshIntervalMinutes]
  );
}

export async function updateSource(id, userId, fields) {
  const allowed = [
    'name', 'app', 'fetch_type', 'ical_url', 'scrape_url', 'scrape_config',
    'refresh_interval_minutes', 'enabled',
  ];
  const updates = [];
  const values = [];
  let i = 1;

  for (const [key, val] of Object.entries(fields)) {
    if (!allowed.includes(key)) continue;
    updates.push(`${key} = $${i++}`);
    values.push(key === 'scrape_config' ? JSON.stringify(val) : val);
  }

  if (updates.length === 0) return getSourceById(id, userId);

  values.push(id, userId);
  return queryOne(
    `UPDATE sources SET ${updates.join(', ')}
     WHERE id = $${i} AND user_id = $${i + 1}
     RETURNING *`,
    values
  );
}

export async function deleteSource(id, userId) {
  return queryOne(
    'DELETE FROM sources WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId]
  );
}

export async function markSourceFetched(id, { status, error = null, eventCount = null }) {
  return queryOne(
    `UPDATE sources
     SET last_fetched_at = NOW(),
         last_fetch_status = $2,
         last_fetch_error = $3,
         last_event_count = COALESCE($4, last_event_count)
     WHERE id = $1
     RETURNING *`,
    [id, status, error, eventCount]
  );
}

// Sources due for a refresh (used by scheduler)
export async function getSourcesDueForRefresh() {
  return query(
    `SELECT s.*, u.feed_token, u.timezone
     FROM sources s
     JOIN users u ON u.id = s.user_id
     WHERE s.enabled = true
       AND (
         s.last_fetched_at IS NULL
         OR s.last_fetched_at < NOW() - (s.refresh_interval_minutes || ' minutes')::INTERVAL
       )
     ORDER BY s.last_fetched_at ASC NULLS FIRST`,
    []
  );
}

// --- Kid ↔ Source assignments ---

export async function setKidSources(sourceId, kidIds) {
  return withTransaction(async (tx) => {
    await tx.query('DELETE FROM kid_sources WHERE source_id = $1', [sourceId]);
    if (kidIds.length > 0) {
      const values = kidIds.map((_, i) => `($1, $${i + 2})`).join(', ');
      await tx.query(
        `INSERT INTO kid_sources (source_id, kid_id) VALUES ${values}`,
        [sourceId, ...kidIds]
      );
    }
  });
}

export async function getKidsForSource(sourceId) {
  return query(
    `SELECT k.* FROM kids k
     JOIN kid_sources ks ON ks.kid_id = k.id
     WHERE ks.source_id = $1
     ORDER BY k.sort_order, k.name`,
    [sourceId]
  );
}

// --- Events ---

// "Currently visible" events: those that haven't ended yet and start within
// the window. An event's effective end is:
//   - ends_at if set,
//   - midnight+24h for all-day events,
//   - starts_at + 2 hours otherwise.
// This keeps long events (track meets, tournaments) visible during the event,
// not just before it starts.
export async function getUpcomingEvents(userId, { days = 30, kidId } = {}) {
  const params = [userId, days];
  const kidFilter = kidId
    ? `AND e.id IN (
         SELECT DISTINCT e2.id FROM events e2
         JOIN kid_sources ks ON ks.source_id = e2.source_id
         WHERE ks.kid_id = $3
       )`
    : '';
  if (kidId) params.push(kidId);

  return query(
    `SELECT e.*, s.name AS source_name, s.app
     FROM events e
     JOIN sources s ON s.id = e.source_id
     WHERE e.user_id = $1
       AND CASE
             WHEN e.ends_at IS NOT NULL THEN e.ends_at
             WHEN e.all_day            THEN e.starts_at + INTERVAL '1 day'
             ELSE                            e.starts_at + INTERVAL '2 hours'
           END >= NOW()
       AND e.starts_at <= NOW() + ($2 || ' days')::INTERVAL
       ${kidFilter}
     ORDER BY e.starts_at`,
    params
  );
}

// Upsert a single normalized event — called by workers
export async function upsertEvent({
  userId, sourceId, sourceUid, rawTitle, displayTitle,
  location, description, startsAt, endsAt, allDay,
  recurrenceRule, contentHash,
}) {
  return queryOne(
    `INSERT INTO events
       (user_id, source_id, source_uid, raw_title, display_title,
        location, description, starts_at, ends_at, all_day,
        recurrence_rule, content_hash, last_seen_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
     ON CONFLICT (source_id, source_uid) DO UPDATE SET
       raw_title       = EXCLUDED.raw_title,
       display_title   = EXCLUDED.display_title,
       location        = EXCLUDED.location,
       description     = EXCLUDED.description,
       starts_at       = EXCLUDED.starts_at,
       ends_at         = EXCLUDED.ends_at,
       all_day         = EXCLUDED.all_day,
       recurrence_rule = EXCLUDED.recurrence_rule,
       content_hash    = EXCLUDED.content_hash,
       last_seen_at    = NOW()
     RETURNING *, (xmax = 0) AS inserted`,
    [userId, sourceId, sourceUid, rawTitle, displayTitle,
     location, description, startsAt, endsAt, allDay,
     recurrenceRule, contentHash]
  );
}

// Remove events from a source that weren't seen in the latest fetch
// (i.e., they were deleted from the source app)
export async function removeStaleEvents(sourceId, fetchStartedAt) {
  return query(
    `DELETE FROM events
     WHERE source_id = $1 AND last_seen_at < $2
     RETURNING id`,
    [sourceId, fetchStartedAt]
  );
}

// Rebuild display_title for all events in a source
// Called when kid assignments change
export async function rebuildDisplayTitles(sourceId, displayTitleFn) {
  const events = await query(
    'SELECT id, raw_title, location FROM events WHERE source_id = $1',
    [sourceId]
  );
  const kids = await getKidsForSource(sourceId);

  for (const event of events) {
    const displayTitle = displayTitleFn(event.raw_title, event.location, kids);
    await query(
      'UPDATE events SET display_title = $1 WHERE id = $2',
      [displayTitle, event.id]
    );
  }
}

// --- Feed cache ---

export async function getFeedCache(userId) {
  return queryOne(
    'SELECT * FROM feed_cache WHERE user_id = $1',
    [userId]
  );
}

export async function setFeedCache(userId, icalContent, eventCount) {
  return queryOne(
    `INSERT INTO feed_cache (user_id, ical_content, event_count, built_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       ical_content = EXCLUDED.ical_content,
       event_count  = EXCLUDED.event_count,
       built_at     = NOW()
     RETURNING *`,
    [userId, icalContent, eventCount]
  );
}

export async function invalidateFeedCache(userId) {
  return query(
    'DELETE FROM feed_cache WHERE user_id = $1',
    [userId]
  );
}

// --- Refresh jobs (audit log) ---

export async function createRefreshJob(sourceId, userId) {
  return queryOne(
    `INSERT INTO refresh_jobs (source_id, user_id, status)
     VALUES ($1, $2, 'running')
     RETURNING *`,
    [sourceId, userId]
  );
}

export async function finishRefreshJob(jobId, { status, added, updated, removed, error }) {
  return queryOne(
    `UPDATE refresh_jobs SET
       finished_at    = NOW(),
       status         = $2,
       events_added   = $3,
       events_updated = $4,
       events_removed = $5,
       error_message  = $6
     WHERE id = $1
     RETURNING *`,
    [jobId, status, added, updated, removed, error]
  );
}

// --- Plan enforcement ---

export async function getUserPlanLimits(userId) {
  return queryOne(
    `SELECT u.plan, pl.max_kids, pl.max_sources, pl.email_digest
     FROM users u
     JOIN plan_limits pl ON pl.plan = u.plan
     WHERE u.id = $1`,
    [userId]
  );
}

export async function countUserKids(userId) {
  const row = await queryOne(
    'SELECT COUNT(*) AS count FROM kids WHERE user_id = $1',
    [userId]
  );
  return parseInt(row.count, 10);
}

export async function countUserSources(userId) {
  const row = await queryOne(
    'SELECT COUNT(*) AS count FROM sources WHERE user_id = $1',
    [userId]
  );
  return parseInt(row.count, 10);
}

export default pool;
