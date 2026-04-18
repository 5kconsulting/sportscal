-- ============================================================
-- SportsCal SaaS Schema
-- Multi-tenant: every table scoped to user_id
--
-- IDEMPOTENT: every statement is safe to re-run on boot.
--   TABLE      -> CREATE TABLE IF NOT EXISTS
--   INDEX      -> CREATE INDEX IF NOT EXISTS
--   VIEW       -> CREATE OR REPLACE VIEW
--   TRIGGER    -> DROP TRIGGER IF EXISTS + CREATE TRIGGER
--   COLUMN     -> ALTER TABLE ... ADD COLUMN IF NOT EXISTS
--   CHECK      -> ALTER TABLE ... DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT
--                 (drop-and-recreate keeps CHECKs in sync with schema.sql,
--                  so editing an allowed-values list is a one-line change)
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,

  -- Feed access: rotating token keeps .ics URL secret
  -- User can regenerate without changing their account
  feed_token    TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),

  -- Billing
  plan          TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id   TEXT,
  stripe_subscription_id TEXT,
  plan_expires_at      TIMESTAMPTZ,

  -- Email preferences
  digest_enabled     BOOLEAN NOT NULL DEFAULT true,
  digest_day         SMALLINT NOT NULL DEFAULT 0,   -- 0=Sun,1=Mon,...,6=Sat
  digest_hour        SMALLINT NOT NULL DEFAULT 18,  -- local hour (0-23)
  reminder_hours_before SMALLINT NOT NULL DEFAULT 12, -- hours before event

  -- Timezone for email rendering
  timezone      TEXT NOT NULL DEFAULT 'America/Los_Angeles',

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Columns added after initial deploy
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin           BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_source    TEXT;

-- CHECK constraints (drop-and-recreate so edits are declarative)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;
ALTER TABLE users ADD  CONSTRAINT users_plan_check
  CHECK (plan IN ('free', 'premium'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_digest_day_check;
ALTER TABLE users ADD  CONSTRAINT users_digest_day_check
  CHECK (digest_day BETWEEN 0 AND 6);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_digest_hour_check;
ALTER TABLE users ADD  CONSTRAINT users_digest_hour_check
  CHECK (digest_hour BETWEEN 0 AND 23);

-- ============================================================
-- KIDS
-- Each kid belongs to one user (parent account)
-- ============================================================
CREATE TABLE IF NOT EXISTS kids (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#6366f1', -- hex, used in UI
  sort_order SMALLINT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kids_user_id_idx ON kids(user_id);

-- ============================================================
-- CONTACTS
-- Named people (parents, coaches, grandparents) who can be
-- assigned to event logistics (pickup/dropoff).
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT,
  phone      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SOURCES
-- A calendar source: iCal URL, scrape target, or both
-- ============================================================
CREATE TABLE IF NOT EXISTS sources (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Display
  name        TEXT NOT NULL,           -- e.g. "Emma - Soccer (TeamSnap)"
  app         TEXT NOT NULL,           -- see CHECK constraint below
  fetch_type  TEXT NOT NULL DEFAULT 'ical',

  -- iCal
  ical_url    TEXT,

  -- Scrape
  scrape_url  TEXT,
  -- JSON blob of CSS selectors / config for the specific scraper
  scrape_config JSONB,

  -- Schedule
  refresh_interval_minutes INTEGER NOT NULL DEFAULT 120,
  last_fetched_at          TIMESTAMPTZ,
  last_fetch_status        TEXT,
  last_fetch_error         TEXT,
  last_event_count         INTEGER,

  -- Soft disable without deleting
  enabled     BOOLEAN NOT NULL DEFAULT true,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Columns added after initial deploy
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_error_alert_at TIMESTAMPTZ;

-- CHECK constraints — drop and recreate so edits are declarative.
-- To add a new source app: just add it to the IN list below and deploy.
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_app_check;
ALTER TABLE sources ADD  CONSTRAINT sources_app_check
  CHECK (app IN (
    'teamsnap', 'teamsnapone', 'gamechanger', 'playmetrics',
    'teamsideline', 'byga', 'sportsengine', 'teamreach',
    'leagueapps', 'demosphere', '360player', 'sportsyou',
    'band', 'rankone', 'custom'
  ));

ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_fetch_type_check;
ALTER TABLE sources ADD  CONSTRAINT sources_fetch_type_check
  CHECK (fetch_type IN ('ical', 'scrape', 'ical_with_scrape_fallback'));

ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_last_fetch_status_check;
ALTER TABLE sources ADD  CONSTRAINT sources_last_fetch_status_check
  CHECK (last_fetch_status IN ('ok', 'error', 'pending'));

CREATE INDEX IF NOT EXISTS sources_user_id_idx ON sources(user_id);
CREATE INDEX IF NOT EXISTS sources_next_fetch_idx ON sources(last_fetched_at, refresh_interval_minutes)
  WHERE enabled = true;

-- ============================================================
-- KID_SOURCES  (many-to-many)
-- Which kids are assigned to which source.
-- Drives the "Bob - Soccer Practice" title prefix.
-- ============================================================
CREATE TABLE IF NOT EXISTS kid_sources (
  kid_id    UUID NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  PRIMARY KEY (kid_id, source_id)
);

CREATE INDEX IF NOT EXISTS kid_sources_source_id_idx ON kid_sources(source_id);

-- ============================================================
-- EVENTS
-- Normalized events pulled from all sources.
-- One row per unique event per source.
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_id       UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,

  -- Original identifier from source (UID from iCal, or scraped hash)
  source_uid      TEXT NOT NULL,

  -- Raw title from the source (before kid-name prefix)
  raw_title       TEXT NOT NULL,

  -- Computed at normalization: "Bob - Soccer Practice at Community Park"
  -- Rebuilt whenever kid assignments change
  display_title   TEXT NOT NULL,

  location        TEXT,
  description     TEXT,

  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ,
  all_day         BOOLEAN NOT NULL DEFAULT false,

  -- For recurring events from iCal
  recurrence_rule TEXT,

  -- Track changes so we can send update notifications
  content_hash    TEXT NOT NULL, -- hash of raw_title+location+starts_at+ends_at
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One event UID per source (dedup on upsert)
  UNIQUE (source_id, source_uid)
);

-- Columns added after initial deploy
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_id UUID;

CREATE INDEX IF NOT EXISTS events_user_id_idx ON events(user_id);
CREATE INDEX IF NOT EXISTS events_source_id_idx ON events(source_id);
CREATE INDEX IF NOT EXISTS events_starts_at_idx ON events(user_id, starts_at);
-- Feed generation: upcoming events for a user (no partial index — NOW() not allowed)
CREATE INDEX IF NOT EXISTS events_upcoming_idx ON events(user_id, starts_at);

-- ============================================================
-- EVENT_LOGISTICS
-- Pickup/dropoff assignments per event. Each (event, role) pair
-- is unique — there's one pickup and one dropoff per event.
-- ============================================================
CREATE TABLE IF NOT EXISTS event_logistics (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'assigned',
  token      TEXT UNIQUE,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, role)
);

ALTER TABLE event_logistics DROP CONSTRAINT IF EXISTS event_logistics_role_check;
ALTER TABLE event_logistics ADD  CONSTRAINT event_logistics_role_check
  CHECK (role IN ('dropoff', 'pickup'));

ALTER TABLE event_logistics DROP CONSTRAINT IF EXISTS event_logistics_status_check;
ALTER TABLE event_logistics ADD  CONSTRAINT event_logistics_status_check
  CHECK (status IN ('assigned', 'requested', 'confirmed', 'declined'));

-- ============================================================
-- EVENT_OVERRIDES
-- Per-kid attendance overrides for a given event.
-- Lets a parent mark "Emma isn't going to this practice" without
-- deleting the event from the source.
-- ============================================================
CREATE TABLE IF NOT EXISTS event_overrides (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kid_id     UUID NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  attending  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, kid_id)
);

CREATE INDEX IF NOT EXISTS event_overrides_event_idx ON event_overrides(event_id);
CREATE INDEX IF NOT EXISTS event_overrides_user_idx  ON event_overrides(user_id);

-- ============================================================
-- FEED_CACHE
-- Pre-built .ics content per user so the serve path is fast.
-- Invalidated whenever events change for that user.
-- ============================================================
CREATE TABLE IF NOT EXISTS feed_cache (
  user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ical_content TEXT NOT NULL,
  built_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_count  INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- REFRESH_JOBS
-- Audit log of every fetch attempt (debugging + monitoring)
-- ============================================================
CREATE TABLE IF NOT EXISTS refresh_jobs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id   UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status      TEXT,
  events_added    INTEGER DEFAULT 0,
  events_updated  INTEGER DEFAULT 0,
  events_removed  INTEGER DEFAULT 0,
  error_message   TEXT
);

ALTER TABLE refresh_jobs DROP CONSTRAINT IF EXISTS refresh_jobs_status_check;
ALTER TABLE refresh_jobs ADD  CONSTRAINT refresh_jobs_status_check
  CHECK (status IN ('running', 'ok', 'error'));

CREATE INDEX IF NOT EXISTS refresh_jobs_source_id_idx ON refresh_jobs(source_id);
CREATE INDEX IF NOT EXISTS refresh_jobs_started_at_idx ON refresh_jobs(started_at DESC);

-- ============================================================
-- AUTO-UPDATE updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Postgres has no "CREATE TRIGGER IF NOT EXISTS" before PG14, so drop-then-create
DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS kids_updated_at ON kids;
CREATE TRIGGER kids_updated_at
  BEFORE UPDATE ON kids
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS sources_updated_at ON sources;
CREATE TRIGGER sources_updated_at
  BEFORE UPDATE ON sources
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS events_updated_at ON events;
CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- PLAN LIMITS VIEW
-- Easy reference for enforcing free vs paid limits
-- ============================================================
CREATE OR REPLACE VIEW plan_limits AS
SELECT
  'free'    AS plan, 2 AS max_kids, 2  AS max_sources, false AS email_digest
UNION ALL SELECT
  'premium',         8,             24,                 true;

-- ============================================================
-- PASSWORD RESET TOKENS
-- ============================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prt_user_id_idx ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS prt_token_hash_idx ON password_reset_tokens(token_hash);
