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
-- 'month' or 'year' — set by the Stripe webhook when a subscription activates.
-- NULL for free users and legacy users who haven't re-subscribed since we
-- started tracking this. Nullable because it's derived data from Stripe.
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_interval   TEXT;

-- A2P 10DLC requires direct, recorded SMS consent from the account holder.
-- Captured at signup via a public consent checkbox. NULL for accounts
-- created before this column existed; we'll backfill via a one-time
-- consent prompt on next login if SMS use is needed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_consent_at      TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_consent_ip      TEXT;

-- Per-user opaque token used to address inbound mail at
-- add+<token>@INBOUND_DOMAIN. Lazily generated on first call to
-- /api/auth/inbound-address; nullable for everyone else. Indexed
-- (UNIQUE) so the inbound webhook's hot-path lookup is O(1).
ALTER TABLE users ADD COLUMN IF NOT EXISTS inbound_token        TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS users_inbound_token_idx ON users(inbound_token) WHERE inbound_token IS NOT NULL;

-- CHECK constraints (drop-and-recreate so edits are declarative)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;
ALTER TABLE users ADD  CONSTRAINT users_plan_check
  CHECK (plan IN ('free', 'premium'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_billing_interval_check;
ALTER TABLE users ADD  CONSTRAINT users_billing_interval_check
  CHECK (billing_interval IS NULL OR billing_interval IN ('month', 'year'));

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

-- SMS consent (A2P 10DLC double opt-in).
-- Status moves pending -> confirmed (reply YES) or pending -> declined
-- (reply STOP, or admin/parent removes consent). We never SMS a contact
-- whose status is not 'confirmed'.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sms_consent_status  TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sms_consent_at      TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sms_consent_method  TEXT;          -- 'reply_yes' | 'reply_stop' | etc
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sms_consent_phone   TEXT;          -- which SportsCal Twilio number captured the consent
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS opt_in_token        TEXT;          -- short opaque token for webhook correlation if ever needed
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS opt_in_sent_at      TIMESTAMPTZ;   -- last time we sent the opt-in confirmation SMS

ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_sms_consent_status_check;
ALTER TABLE contacts ADD  CONSTRAINT contacts_sms_consent_status_check
  CHECK (sms_consent_status IN ('pending', 'confirmed', 'declined'));

-- Webhook lookup is by phone number — index for fast E.164 lookups.
CREATE INDEX IF NOT EXISTS contacts_phone_idx ON contacts(phone) WHERE phone IS NOT NULL;

-- One-time backfill: normalize legacy phones to E.164 so the
-- inbound webhook (which receives From in E.164) can match. Only
-- touches rows that aren't already E.164. Safe to re-run.
UPDATE contacts
   SET phone = CASE
     WHEN length(regexp_replace(phone, '\D', '', 'g')) = 10
       THEN '+1' || regexp_replace(phone, '\D', '', 'g')
     WHEN length(regexp_replace(phone, '\D', '', 'g')) = 11
      AND substring(regexp_replace(phone, '\D', '', 'g') FROM 1 FOR 1) = '1'
       THEN '+'  || regexp_replace(phone, '\D', '', 'g')
     ELSE phone
   END
 WHERE phone IS NOT NULL
   AND phone !~ '^\+';

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
-- 'pdf_upload' and 'email_forward' are for AI-ingested sources that don't poll.
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_app_check;
ALTER TABLE sources ADD  CONSTRAINT sources_app_check
  CHECK (app IN (
    'teamsnap', 'teamsnapone', 'gamechanger', 'playmetrics',
    'teamsideline', 'byga', 'sportsengine', 'teamreach',
    'leagueapps', 'demosphere', '360player', 'sportsyou',
    'band', 'rankone', 'custom',
    'google_classroom',
    'pdf_upload', 'email_forward'
  ));

-- 'manual' fetch_type is for AI-ingested sources whose events are frozen
-- at the moment of approval (no recurring fetch).
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_fetch_type_check;
ALTER TABLE sources ADD  CONSTRAINT sources_fetch_type_check
  CHECK (fetch_type IN ('ical', 'scrape', 'ical_with_scrape_fallback', 'manual'));

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
-- INGESTIONS
-- One row per uploaded blob (PDF today, email/photo later).
-- Tracks the extraction lifecycle and the LLM's output until
-- the user approves/rejects and real events are written.
-- The raw file is deleted after 60 days by the cleanup cron;
-- the row itself and extracted_events stay for audit.
-- ============================================================
CREATE TABLE IF NOT EXISTS ingestions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kid_id            UUID NOT NULL REFERENCES kids(id) ON DELETE CASCADE,

  -- Set once the user approves and we create a real source.
  -- ON DELETE SET NULL so deleting the source doesn't wipe the audit trail.
  source_id         UUID REFERENCES sources(id) ON DELETE SET NULL,

  kind              TEXT NOT NULL,
  original_filename TEXT,
  original_mime     TEXT,
  original_size     INTEGER,

  -- Filesystem path; nulled out by the 60-day cleanup cron.
  storage_path      TEXT,

  status            TEXT NOT NULL DEFAULT 'pending',
  status_detail     TEXT,

  -- The array of events the LLM extracted (pre-approval).
  extracted_events  JSONB,
  event_count       INTEGER,
  approved_count    INTEGER,

  extraction_error  TEXT,

  -- Cost tracking (from Anthropic API usage block).
  input_tokens      INTEGER,
  output_tokens     INTEGER,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at       TIMESTAMPTZ,
  file_deleted_at   TIMESTAMPTZ
);

-- CHECK constraints — drop-and-recreate so edits are declarative.
ALTER TABLE ingestions DROP CONSTRAINT IF EXISTS ingestions_kind_check;
ALTER TABLE ingestions ADD  CONSTRAINT ingestions_kind_check
  CHECK (kind IN ('pdf', 'image', 'email', 'photo'));
-- 'image' is the canonical value for camera/screenshot uploads (matches the
-- 'image/*' mime family); 'photo' is kept for back-compat with any legacy
-- rows. New rows should use 'image'.

-- Inbound-mail PDF flow needs an ingestion to exist BEFORE the kid is known
-- (we ask the user "which kid is this for?" via the magic-link chat after
-- the email arrives). pending_kid is the holding state until they pick.
ALTER TABLE ingestions DROP CONSTRAINT IF EXISTS ingestions_status_check;
ALTER TABLE ingestions ADD  CONSTRAINT ingestions_status_check
  CHECK (status IN (
    'pending_kid',
    'pending',
    'uploading',
    'reading',
    'parsing',
    'ready_for_review',
    'approving',
    'approved',
    'rejected',
    'failed'
  ));

-- Allow kid_id NULL for ingestions that arrive via inbound mail without a
-- pre-selected kid. The application layer enforces "must be set before
-- transitioning out of pending_kid" (see routes/ingestions.js).
ALTER TABLE ingestions ALTER COLUMN kid_id DROP NOT NULL;

-- One-time(ish) opaque token that grants public read access to a single
-- ingestion via /setup?ingestion=<token>. Used by the inbound-mail PDF
-- flow so a forwarded PDF can become events without the user having to
-- log in. Cleared on approve/reject so the link stops working after use.
ALTER TABLE ingestions ADD COLUMN IF NOT EXISTS magic_link_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ingestions_magic_link_token_idx
  ON ingestions(magic_link_token)
  WHERE magic_link_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS ingestions_user_status_idx
  ON ingestions(user_id, status);
CREATE INDEX IF NOT EXISTS ingestions_kid_idx
  ON ingestions(kid_id);
-- Partial index: the 60-day cleanup cron only scans rows with files still on disk
CREATE INDEX IF NOT EXISTS ingestions_file_cleanup_idx
  ON ingestions(created_at)
  WHERE storage_path IS NOT NULL;

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

DROP TRIGGER IF EXISTS ingestions_updated_at ON ingestions;
CREATE TRIGGER ingestions_updated_at
  BEFORE UPDATE ON ingestions
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

-- ============================================================
-- TEAMS
-- A named group of ride contacts (typically other parents on
-- the same youth sports team). Used to send group ride
-- requests via iMessage where any one parent can claim the
-- offer (see event_logistics_offers below).
-- ============================================================
CREATE TABLE IF NOT EXISTS teams (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS teams_user_id_idx ON teams(user_id);

-- M:N teams <-> contacts. Composite primary key prevents the
-- same contact from being added to a team twice.
CREATE TABLE IF NOT EXISTS team_members (
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, contact_id)
);
CREATE INDEX IF NOT EXISTS team_members_contact_idx ON team_members(contact_id);

-- ============================================================
-- EVENT LOGISTICS OFFERS
-- One row per parent who's been offered a ride request via a
-- team group text. The first parent to tap their unique link
-- and confirm wins; sibling rows for the same (event_id, role)
-- auto-flip to 'superseded' in the same DB transaction so two
-- near-simultaneous taps can't both succeed.
--
-- For single-contact requests this table is not used — the
-- existing event_logistics row + token mechanism handles it.
-- Offers are only created when the parent picks "Request from
-- team" on an event.
-- ============================================================
CREATE TABLE IF NOT EXISTS event_logistics_offers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  team_id      UUID REFERENCES teams(id) ON DELETE SET NULL,
  contact_id   UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,
  token        TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ
);

ALTER TABLE event_logistics_offers DROP CONSTRAINT IF EXISTS event_logistics_offers_role_check;
ALTER TABLE event_logistics_offers ADD CONSTRAINT event_logistics_offers_role_check
  CHECK (role IN ('pickup', 'dropoff'));

ALTER TABLE event_logistics_offers DROP CONSTRAINT IF EXISTS event_logistics_offers_status_check;
ALTER TABLE event_logistics_offers ADD CONSTRAINT event_logistics_offers_status_check
  CHECK (status IN ('pending', 'confirmed', 'declined', 'superseded'));

CREATE INDEX IF NOT EXISTS event_logistics_offers_event_role_pending_idx
  ON event_logistics_offers(event_id, role)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS event_logistics_offers_user_idx
  ON event_logistics_offers(user_id);

-- ============================================================
-- TEAM INVITES
-- One row per invite link generated by a team owner. Anyone with
-- the token can self-add to that team via /join/<token> — they
-- enter their own name/phone/email and the row gets inserted as
-- a contact in the team owner's account + added to team_members.
--
-- expires_at and revoked_at are nullable; null means "never".
-- For v1 invites are evergreen (no expiry, no revocation UI);
-- the columns are here so we don't need a schema migration when
-- we add expiry / revoke later.
-- ============================================================
CREATE TABLE IF NOT EXISTS team_invites (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS team_invites_token_idx ON team_invites(token);
CREATE INDEX IF NOT EXISTS team_invites_team_idx  ON team_invites(team_id);

-- ============================================================
-- KIDS — per-kid calendar feed token
-- Each kid gets a unique token so they can subscribe to JUST
-- their own events via /feed/kid/<token>.ics on their own
-- device — Apple Calendar, Google Calendar, etc. — without
-- seeing siblings' or the parent's full family feed.
-- ============================================================
ALTER TABLE kids ADD COLUMN IF NOT EXISTS feed_token TEXT;

-- Backfill: existing kids predate this column. Generate a
-- random per-kid token for any NULL rows. Idempotent: re-runs
-- only touch rows that are still NULL, so already-tokened kids
-- keep their existing token across deploys.
UPDATE kids
   SET feed_token = encode(gen_random_bytes(24), 'hex')
 WHERE feed_token IS NULL;

-- Now NOT NULL is safe (every existing row has a value), and
-- new INSERTs get a random token automatically via the default.
ALTER TABLE kids ALTER COLUMN feed_token SET DEFAULT encode(gen_random_bytes(24), 'hex');
ALTER TABLE kids ALTER COLUMN feed_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS kids_feed_token_unique_idx ON kids(feed_token);

-- ============================================================
-- SETUP_AGENT_MESSAGES — persisted chat history for the
-- AI-powered onboarding helper. Originally we logged only
-- token counts to stdout; debugging a real user video on
-- 2026-04-30 made it clear we need the actual transcripts.
--
-- Wins beyond debugging:
--   * Training data for prompt iteration
--   * Inspection lever when a user pings support
--   * Foundation for "resume your last conversation"
--
-- One row per turn (user OR assistant). Grouped by user_id +
-- created_at; we'll add an explicit session_id later if needed.
-- ============================================================
CREATE TABLE IF NOT EXISTS setup_agent_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  platform    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE setup_agent_messages DROP CONSTRAINT IF EXISTS setup_agent_messages_role_check;
ALTER TABLE setup_agent_messages ADD  CONSTRAINT setup_agent_messages_role_check
  CHECK (role IN ('user', 'assistant'));

CREATE INDEX IF NOT EXISTS setup_agent_messages_user_idx
  ON setup_agent_messages(user_id, created_at DESC);
