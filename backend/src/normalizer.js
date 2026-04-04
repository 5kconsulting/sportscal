import crypto from 'crypto';

// ============================================================
// SportsCal Event Normalizer
//
// Responsibilities:
//   1. Build "Bob - Soccer Practice at Community Park" titles
//   2. Convert raw iCal / scraped data into a unified schema
//   3. Hash event content for change detection
//   4. Deduplicate events within a fetch batch
// ============================================================


// ------------------------------------------------------------
// TITLE BUILDER
//
// Rules:
//   - No kids assigned       → raw title as-is
//   - One kid                → "Bob - Soccer Practice"
//   - Two kids               → "Bob & Emma - Soccer Practice"
//   - Three+ kids            → "Bob, Emma & Jake - Soccer Practice"
//   - Location present       → append "at <location>"
//   - Kids sorted by sort_order, then alphabetically (consistent ordering)
// ------------------------------------------------------------

/**
 * Build the display title for an event.
 *
 * @param {string} rawTitle    - Original title from iCal or scraper
 * @param {string|null} location - Event location, if any
 * @param {Array<{name: string, sort_order: number}>} kids - Kids assigned to this source
 * @returns {string}
 */
export function buildDisplayTitle(rawTitle, location, kids = []) {
  const title = cleanTitle(rawTitle);
  const prefix = buildKidPrefix(kids);
  const locationSuffix = buildLocationSuffix(location);

  if (prefix) {
    return `${prefix} - ${title}${locationSuffix}`;
  }
  return `${title}${locationSuffix}`;
}

/**
 * Build the kid name prefix: "Bob", "Bob & Emma", "Bob, Emma & Jake"
 */
function buildKidPrefix(kids) {
  if (!kids || kids.length === 0) return '';

  // Sort by sort_order first, then alphabetically
  const sorted = [...kids].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name);
  });

  const names = sorted.map(k => k.name.trim());

  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;

  // 3+: "Bob, Emma & Jake"
  const allButLast = names.slice(0, -1).join(', ');
  return `${allButLast} & ${names[names.length - 1]}`;
}

/**
 * Build location suffix: " at Community Park" or ""
 */
function buildLocationSuffix(location) {
  if (!location) return '';
  const cleaned = cleanLocation(location);
  if (!cleaned) return '';
  return ` at ${cleaned}`;
}

/**
 * Clean a raw event title from iCal/scraper noise.
 * Removes common prefixes/suffixes added by sports apps.
 */
function cleanTitle(raw) {
  if (!raw) return 'Untitled Event';

  return raw
    .trim()
    // TeamSnap sometimes prepends team name in brackets
    .replace(/^\[.*?\]\s*/, '')
    // GameChanger sometimes appends " - GameChanger"
    .replace(/\s*-\s*GameChanger\s*$/i, '')
    // PlayMetrics sometimes appends " (PlayMetrics)"
    .replace(/\s*\(PlayMetrics\)\s*$/i, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim() || 'Untitled Event';
}

/**
 * Clean a location string.
 * Removes GPS coordinates, excessively long addresses, etc.
 */
function cleanLocation(raw) {
  if (!raw) return '';

  // Skip if it looks like pure GPS coordinates
  if (/^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(raw.trim())) return '';

  // If it's a full address, use just the venue name (before first comma)
  // e.g. "Community Park, 1234 Main St, Portland, OR 97201" → "Community Park"
  const parts = raw.split(',');
  if (parts.length >= 3) {
    // Looks like a full address — use venue name only
    return parts[0].trim();
  }

  return raw.trim();
}


// ------------------------------------------------------------
// ICAL NORMALIZER
//
// Converts a raw node-ical event object into our unified schema.
// ------------------------------------------------------------

/**
 * Normalize a single iCal event.
 *
 * @param {object} rawEvent   - Raw event from node-ical
 * @param {string} sourceId   - Our source record ID
 * @param {string} userId     - Owner user ID
 * @param {Array}  kids       - Kids assigned to this source
 * @returns {NormalizedEvent|null}
 */
export function normalizeIcalEvent(rawEvent, sourceId, userId, kids = []) {
  // Skip non-VEVENT entries (VTIMEZONE etc.)
  if (rawEvent.type !== 'VEVENT') return null;

  // Skip events without a start time
  if (!rawEvent.start) return null;

  const rawTitle = rawEvent.summary || 'Untitled Event';
  const location = rawEvent.location || null;
  const description = rawEvent.description || null;

  const startsAt = toUTCDate(rawEvent.start);
  const endsAt = rawEvent.end ? toUTCDate(rawEvent.end) : null;
  const allDay = isAllDayEvent(rawEvent);

  // Use the iCal UID as our source_uid for stable dedup
  const sourceUid = rawEvent.uid || generateSourceUid(rawTitle, startsAt);

  const contentHash = hashEventContent(rawTitle, location, startsAt, endsAt);
  const displayTitle = buildDisplayTitle(rawTitle, location, kids);

  return {
    userId,
    sourceId,
    sourceUid,
    rawTitle,
    displayTitle,
    location,
    description: truncate(description, 2000),
    startsAt,
    endsAt,
    allDay,
    recurrenceRule: rawEvent.rrule?.toString() || null,
    contentHash,
  };
}

/**
 * Normalize a batch of iCal events, filtering out past events
 * older than 30 days and deduplicating by sourceUid.
 *
 * @param {object} icalData  - Parsed output from node-ical
 * @param {string} sourceId
 * @param {string} userId
 * @param {Array}  kids
 * @returns {NormalizedEvent[]}
 */
export function normalizeIcalFeed(icalData, sourceId, userId, kids = []) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30); // include events up to 30 days past

  const seen = new Set();
  const events = [];

  for (const raw of Object.values(icalData)) {
    const event = normalizeIcalEvent(raw, sourceId, userId, kids);
    if (!event) continue;

    // Drop very old events
    if (event.startsAt < cutoff) continue;

    // Dedup within this batch
    if (seen.has(event.sourceUid)) continue;
    seen.add(event.sourceUid);

    events.push(event);
  }

  // Sort ascending by start time
  events.sort((a, b) => a.startsAt - b.startsAt);
  return events;
}


// ------------------------------------------------------------
// SCRAPE NORMALIZER
//
// Converts raw scraped event data (from our Playwright scrapers)
// into the same unified schema.
// ------------------------------------------------------------

/**
 * Normalize a single scraped event.
 *
 * @param {ScrapedEvent} scraped  - Raw data from scraper
 * @param {string} sourceId
 * @param {string} userId
 * @param {Array}  kids
 * @returns {NormalizedEvent|null}
 */
export function normalizeScrapedEvent(scraped, sourceId, userId, kids = []) {
  if (!scraped.title || !scraped.startsAt) return null;

  const rawTitle = scraped.title.trim();
  const location = scraped.location || null;
  const description = scraped.description || null;

  const startsAt = scraped.startsAt instanceof Date
    ? scraped.startsAt
    : new Date(scraped.startsAt);

  if (isNaN(startsAt.getTime())) return null;

  const endsAt = scraped.endsAt
    ? (scraped.endsAt instanceof Date ? scraped.endsAt : new Date(scraped.endsAt))
    : null;

  // Scrapers must provide a stable uid (e.g. hash of URL+date, or a data-id attribute)
  const sourceUid = scraped.uid || generateSourceUid(rawTitle, startsAt);
  const contentHash = hashEventContent(rawTitle, location, startsAt, endsAt);
  const displayTitle = buildDisplayTitle(rawTitle, location, kids);

  return {
    userId,
    sourceId,
    sourceUid,
    rawTitle,
    displayTitle,
    location,
    description: truncate(description, 2000),
    startsAt,
    endsAt,
    allDay: scraped.allDay || false,
    recurrenceRule: null,
    contentHash,
  };
}

/**
 * Normalize a batch of scraped events with dedup and cutoff.
 */
export function normalizeScrapedFeed(scrapedEvents, sourceId, userId, kids = []) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const seen = new Set();
  const events = [];

  for (const raw of scrapedEvents) {
    const event = normalizeScrapedEvent(raw, sourceId, userId, kids);
    if (!event) continue;
    if (event.startsAt < cutoff) continue;
    if (seen.has(event.sourceUid)) continue;
    seen.add(event.sourceUid);
    events.push(event);
  }

  events.sort((a, b) => a.startsAt - b.startsAt);
  return events;
}


// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

/**
 * Hash event content for change detection.
 * If this hash changes between fetches, the event was modified
 * (time moved, location changed, etc.) and we can notify the user.
 */
export function hashEventContent(title, location, startsAt, endsAt) {
  const content = [
    (title || '').toLowerCase().trim(),
    (location || '').toLowerCase().trim(),
    startsAt ? startsAt.toISOString() : '',
    endsAt ? endsAt.toISOString() : '',
  ].join('|');

  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Generate a stable sourceUid when the source doesn't provide one.
 * Based on title + start time — not guaranteed unique for recurring
 * events with the same title, but good enough as a fallback.
 */
function generateSourceUid(title, startsAt) {
  const content = `${(title || '').trim()}|${startsAt?.toISOString() || ''}`;
  return 'generated:' + crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}

/**
 * Convert an iCal date (which may be a Date, or a date-only string)
 * to a proper UTC Date object.
 */
function toUTCDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  return new Date(val);
}

/**
 * Detect all-day events from iCal data.
 * node-ical marks them with datetype === 'date' (no time component).
 */
function isAllDayEvent(rawEvent) {
  return rawEvent.datetype === 'date' || rawEvent.start?.dateOnly === true;
}

/**
 * Truncate a string to a max length, adding ellipsis if needed.
 */
function truncate(str, maxLen) {
  if (!str) return null;
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}


// ------------------------------------------------------------
// TYPE DEFINITIONS (JSDoc — no TypeScript needed)
// ------------------------------------------------------------

/**
 * @typedef {object} NormalizedEvent
 * @property {string} userId
 * @property {string} sourceId
 * @property {string} sourceUid        - Stable ID from source for dedup
 * @property {string} rawTitle         - Original title, unchanged
 * @property {string} displayTitle     - "Bob - Soccer Practice at Community Park"
 * @property {string|null} location
 * @property {string|null} description
 * @property {Date}   startsAt
 * @property {Date|null} endsAt
 * @property {boolean} allDay
 * @property {string|null} recurrenceRule
 * @property {string} contentHash      - sha256 of key fields for change detection
 */

/**
 * @typedef {object} ScrapedEvent
 * @property {string} title
 * @property {Date|string} startsAt
 * @property {Date|string|null} [endsAt]
 * @property {string|null} [location]
 * @property {string|null} [description]
 * @property {string|null} [uid]         - Stable ID if scraper can find one
 * @property {boolean} [allDay]
 */
