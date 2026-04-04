// ============================================================
// BYGA Scraper
//
// BYGA (Beaverton Youth Gymnastics Association, or your local
// BYGA equivalent) doesn't provide an iCal feed, so we scrape
// the schedule page directly using Playwright.
//
// Returns an array of ScrapedEvent objects for the normalizer.
//
// MAINTENANCE NOTE:
// If BYGA changes their site layout, update the selectors below.
// The scrape_config JSON on the source record can override these
// defaults — useful for multi-site deployments without code changes.
// ============================================================

/**
 * Scrape schedule events from a BYGA schedule page.
 *
 * @param {import('playwright').Page} page      - Playwright page (already launched)
 * @param {string} url                           - Schedule page URL
 * @param {object} config                        - Optional selector overrides from scrape_config
 * @returns {Promise<ScrapedEvent[]>}
 */
export async function scrapeBYGA(page, url, config = {}) {
  const selectors = {
    // Container for each event row / card
    eventContainer: config.eventContainer || '.schedule-event, .event-item, tr.event-row',
    // Within each container:
    title:       config.title       || '.event-title, .event-name, td.title',
    date:        config.date        || '.event-date, td.date',
    time:        config.time        || '.event-time, td.time',
    location:    config.location    || '.event-location, .venue, td.location',
    description: config.description || '.event-description, .notes',
    eventId:     config.eventId     || '[data-event-id], [data-id]',
  };

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });

  // Wait for schedule content to load (JS-rendered pages)
  try {
    await page.waitForSelector(selectors.eventContainer, { timeout: 10_000 });
  } catch {
    // Page may be static HTML — continue anyway
  }

  const events = await page.evaluate((sel) => {
    const containers = document.querySelectorAll(sel.eventContainer);
    const results = [];

    for (const container of containers) {
      const title    = container.querySelector(sel.title)?.textContent?.trim();
      const dateText = container.querySelector(sel.date)?.textContent?.trim();
      const timeText = container.querySelector(sel.time)?.textContent?.trim();
      const location = container.querySelector(sel.location)?.textContent?.trim();
      const desc     = container.querySelector(sel.description)?.textContent?.trim();
      const idEl     = container.querySelector(sel.eventId);
      const rawId    = idEl?.dataset?.eventId || idEl?.dataset?.id || null;

      if (!title || !dateText) continue;

      results.push({ title, dateText, timeText, location, desc, rawId });
    }

    return results;
  }, selectors);

  // Parse dates outside evaluate() so we have full JS date handling
  const parsed = [];

  for (const raw of events) {
    try {
      const { startsAt, endsAt } = parseDateTimeRange(raw.dateText, raw.timeText);
      if (!startsAt) continue;

      // Build a stable UID from raw ID or title+date combo
      const uid = raw.rawId
        ? `byga:${raw.rawId}`
        : `byga:${slugify(raw.title)}:${startsAt.toISOString().slice(0, 10)}`;

      parsed.push({
        uid,
        title:    raw.title,
        startsAt,
        endsAt,
        location: raw.location || null,
        description: raw.desc || null,
        allDay:   !raw.timeText,
      });
    } catch {
      // Skip unparseable rows
    }
  }

  return parsed;
}

// ============================================================
// TeamSideline scraper (fallback when iCal fails)
// ============================================================

/**
 * @param {import('playwright').Page} page
 * @param {string} url
 * @param {object} config
 * @returns {Promise<ScrapedEvent[]>}
 */
export async function scrapeTeamSideline(page, url, config = {}) {
  const selectors = {
    eventContainer: config.eventContainer || '.game-item, .event-row, .schedule-row',
    title:       config.title       || '.game-title, .opponent, .event-title',
    date:        config.date        || '.game-date, .event-date',
    time:        config.time        || '.game-time, .event-time',
    location:    config.location    || '.game-location, .facility',
    eventId:     config.eventId     || '[data-game-id], [data-event-id]',
  };

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });

  try {
    await page.waitForSelector(selectors.eventContainer, { timeout: 10_000 });
  } catch { /* static page — continue */ }

  const events = await page.evaluate((sel) => {
    const containers = document.querySelectorAll(sel.eventContainer);
    const results = [];

    for (const container of containers) {
      const title    = container.querySelector(sel.title)?.textContent?.trim();
      const dateText = container.querySelector(sel.date)?.textContent?.trim();
      const timeText = container.querySelector(sel.time)?.textContent?.trim();
      const location = container.querySelector(sel.location)?.textContent?.trim();
      const idEl     = container.querySelector(sel.eventId);
      const rawId    = idEl?.dataset?.gameId || idEl?.dataset?.eventId || null;

      if (!title || !dateText) continue;
      results.push({ title, dateText, timeText, location, rawId });
    }

    return results;
  }, selectors);

  const parsed = [];

  for (const raw of events) {
    try {
      const { startsAt, endsAt } = parseDateTimeRange(raw.dateText, raw.timeText);
      if (!startsAt) continue;

      const uid = raw.rawId
        ? `teamsideline:${raw.rawId}`
        : `teamsideline:${slugify(raw.title)}:${startsAt.toISOString().slice(0, 10)}`;

      parsed.push({
        uid,
        title:    raw.title,
        startsAt,
        endsAt,
        location: raw.location || null,
        description: null,
        allDay:   !raw.timeText,
      });
    } catch { /* skip */ }
  }

  return parsed;
}

// ============================================================
// Date parsing helpers
// ============================================================

/**
 * Parse a date string and optional time range string into Date objects.
 *
 * Handles common formats from sports sites:
 *   date:  "September 14, 2024", "9/14/2024", "Sat, Sep 14"
 *   time:  "10:00 AM", "10:00 AM - 11:30 AM", "10:00-11:30"
 */
function parseDateTimeRange(dateText, timeText) {
  const baseDate = parseDate(dateText);
  if (!baseDate) return { startsAt: null, endsAt: null };

  if (!timeText) {
    return { startsAt: baseDate, endsAt: null };
  }

  // Try to split time range: "10:00 AM - 11:30 AM"
  const rangeSep = /\s*[-–]\s*/;
  const parts = timeText.split(rangeSep).map(s => s.trim()).filter(Boolean);

  const startsAt = parseTime(baseDate, parts[0]);
  const endsAt   = parts[1] ? parseTime(baseDate, parts[1]) : null;

  return { startsAt, endsAt };
}

function parseDate(text) {
  if (!text) return null;

  // Try native Date parsing first (handles ISO and most en-US formats)
  const d = new Date(text);
  if (!isNaN(d.getTime())) return d;

  // "Sat, Sep 14" — add current year
  const shortMatch = text.match(/(?:\w+,\s*)?(\w+ \d{1,2})$/);
  if (shortMatch) {
    const withYear = `${shortMatch[1]}, ${new Date().getFullYear()}`;
    const d2 = new Date(withYear);
    if (!isNaN(d2.getTime())) return d2;
  }

  return null;
}

function parseTime(baseDate, timeText) {
  if (!timeText) return null;

  // Normalize: "10:00am" → "10:00 AM"
  const normalized = timeText
    .replace(/(\d)(am|pm)/i, '$1 $2')
    .toUpperCase();

  const match = normalized.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/);
  if (!match) return null;

  let hours   = parseInt(match[1], 10);
  const mins  = parseInt(match[2] || '0', 10);
  const ampm  = match[3];

  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;

  const result = new Date(baseDate);
  result.setHours(hours, mins, 0, 0);
  return result;
}

function slugify(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * @typedef {object} ScrapedEvent
 * @property {string} uid
 * @property {string} title
 * @property {Date} startsAt
 * @property {Date|null} endsAt
 * @property {string|null} location
 * @property {string|null} description
 * @property {boolean} allDay
 */
