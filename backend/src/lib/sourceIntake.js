// ============================================================================
// sourceIntake.js — universal "turn raw input into a source candidate" helper.
//
// All three Tier-A intake surfaces (iOS Share Extension, camera/screenshot,
// Resend Inbound email) feed into POST /api/sources/intake which delegates
// to this module. Keeping URL → app mapping + name suggestion in pure
// functions means the SetupAgent and the future share extension can reuse
// the same detection without duplicating regexes.
//
// Public exports
// --------------
//   normalizeIcalUrl(raw)      -> string | null   (webcal -> https, trim, validate)
//   detectAppFromUrl(url)      -> app slug | 'custom'
//   suggestSourceName(url, app)-> string          (best-effort label)
//   intakeFromUrl(rawUrl)      -> { kind: 'ical_source', candidate } | null
// ============================================================================

// Hostname patterns mapped to the app values declared in routes/sources.js
// (VALID_APPS). When adding a new app, also update VALID_APPS and the
// SetupAgent's APP_INSTRUCTIONS so the trio stays in sync.
const APP_HOST_PATTERNS = [
  // [regex, app slug] — tried in order, first match wins. Put MORE
  // SPECIFIC patterns first (e.g. go.teamsnap.com before teamsnap.com)
  // or they'll be shadowed by their parent domain.
  [/(^|\.)go\.teamsnap\.com$/i,     'teamsnapone'],
  [/(^|\.)teamsnap\.com$/i,         'teamsnap'],
  [/(^|\.)gc\.com$/i,               'gamechanger'],
  [/(^|\.)gamechanger\.io$/i,       'gamechanger'],
  [/(^|\.)playmetrics\.com$/i,      'playmetrics'],
  [/(^|\.)teamsideline\.com$/i,     'teamsideline'],
  [/(^|\.)byga\.net$/i,             'byga'],
  [/(^|\.)sportsengine\.com$/i,     'sportsengine'],
  [/(^|\.)ngin\.com$/i,             'sportsengine'], // SportsEngine legacy
  [/(^|\.)teamreach\.com$/i,        'teamreach'],
  [/(^|\.)leagueapps\.com$/i,       'leagueapps'],
  [/(^|\.)demosphere\.com$/i,       'demosphere'],
  [/(^|\.)360player\.com$/i,        '360player'],
  [/(^|\.)sportsyou\.com$/i,        'sportsyou'],
  [/(^|\.)band\.us$/i,              'band'],
  [/(^|\.)rankone\.com$/i,          'rankone'],
  [/(^|\.)google\.com$/i,           'google_classroom'], // calendar.google.com .ics secret addresses
  [/(^|\.)googleusercontent\.com$/i,'google_classroom'],
];

export function normalizeIcalUrl(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // webcal:// is just a scheme hint for OS-level subscribe handlers — the
  // actual transport is HTTPS. Convert before storing so the fetch worker
  // doesn't have to special-case it.
  const candidate = trimmed.replace(/^webcal:\/\//i, 'https://');
  try {
    const u = new URL(candidate);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function detectAppFromUrl(url) {
  const normalized = normalizeIcalUrl(url);
  if (!normalized) return 'custom';
  let host;
  try { host = new URL(normalized).hostname; } catch { return 'custom'; }
  for (const [re, slug] of APP_HOST_PATTERNS) {
    if (re.test(host)) return slug;
  }
  return 'custom';
}

// Best-effort label so we can prefill the "what should I call this?" field.
// We avoid showing the raw URL because TeamSnap-style URLs are 80+ chars
// of opaque token. The strategy is:
//   1. If the path contains a recognizable team-name-ish segment, use that
//   2. Otherwise fall back to "<App label> calendar"
//
// Users can always edit before saving — this is a hint, not the final name.
const APP_DISPLAY_LABELS = {
  teamsnap:        'TeamSnap',
  teamsnapone:     'TeamSnap ONE',
  gamechanger:     'GameChanger',
  playmetrics:     'PlayMetrics',
  teamsideline:    'TeamSideline',
  byga:            'BYGA',
  sportsengine:    'SportsEngine',
  teamreach:       'TeamReach',
  leagueapps:      'LeagueApps',
  demosphere:      'Demosphere',
  '360player':     '360Player',
  sportsyou:       'SportsYou',
  band:            'BAND',
  rankone:         'RankOne',
  google_classroom:'Google Classroom',
  custom:          'Custom',
};

// Generic last-path-segment words that mean nothing to the user. If the
// segment matches one of these (case-insensitive, after .ics stripping),
// we walk one segment up looking for a real team-name slug.
const GENERIC_PATH_WORDS = new Set([
  'calendar', 'schedule', 'feed', 'basic', 'ical', 'ics', 'events',
  'export', 'subscribe', 'public', 'main',
]);

function cleanSegment(seg) {
  return decodeURIComponent(seg || '')
    .replace(/\.ics$|\.ical$/i, '')
    .replace(/[-_+]/g, ' ')
    .trim();
}

function looksLikeTeamName(seg) {
  if (!seg || seg.length > 60) return false;
  if (!/^[a-zA-Z0-9 .'’&()]+$/.test(seg)) return false;
  if (/^[a-f0-9]{8,}$/i.test(seg)) return false; // hex token
  if (/^\d+$/.test(seg))             return false; // pure digits
  if (GENERIC_PATH_WORDS.has(seg.toLowerCase().replace(/\s+/g, ''))) return false;
  // At least one letter so we don't surface "12 34 56".
  if (!/[a-zA-Z]/.test(seg))         return false;
  // Bare alnum with digits and no spaces (e.g. "abc123") is almost always
  // a TeamSnap-style team token. Real team-name segments either have
  // spaces (after our dash-to-space conversion) or are all-letters.
  if (!/\s/.test(seg) && /\d/.test(seg)) return false;
  return true;
}

export function suggestSourceName(url, app) {
  const normalized = normalizeIcalUrl(url);
  const label = APP_DISPLAY_LABELS[app] || 'Calendar';
  if (!normalized) return `${label} calendar`;

  try {
    const u = new URL(normalized);
    // Walk path segments from the end looking for the first one that
    // looks like a real team name (skipping generic words like
    // "calendar" / "schedule" / "feed"). Stops after 3 segments —
    // anything deeper is almost certainly opaque routing structure.
    const segments = u.pathname.split('/').filter(Boolean).reverse();
    for (let i = 0; i < Math.min(3, segments.length); i++) {
      const cleaned = cleanSegment(segments[i]);
      if (looksLikeTeamName(cleaned)) return cleaned;
    }
  } catch { /* fall through */ }

  return `${label} calendar`;
}

// Top-level intake helper for the URL flow. Returns null if the input
// isn't a usable iCal URL (caller should surface a 422). The route layer
// handles auth, rate limiting, kid-suggestion, etc.
export function intakeFromUrl(rawUrl) {
  const ical_url = normalizeIcalUrl(rawUrl);
  if (!ical_url) return null;
  const app  = detectAppFromUrl(ical_url);
  const name = suggestSourceName(ical_url, app);
  return {
    kind: 'ical_source',
    candidate: {
      name,
      app,
      ical_url,
      fetch_type: 'ical',
    },
  };
}
