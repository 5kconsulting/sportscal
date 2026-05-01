// ============================================================================
// inboundParser.js — extract iCal URLs from a forwarded email body.
//
// Used by routes/inbound.js. The Cloudflare Email Worker upstream parses
// MIME with postal-mime and POSTs us text/html bodies; this module just
// walks them for calendar links.
//
// Returns an array of unique URLs (https or webcal scheme, .ics or
// .ical extension OR a known-calendar host pattern). Caller runs each
// URL through lib/sourceIntake.intakeFromUrl to detect the app + suggest
// a name + create the source.
// ============================================================================

import { detectAppFromUrl } from './sourceIntake.js';

// App slugs whose hostname alone is enough of a signal to treat a URL as
// a calendar feed even without a .ics / .ical / webcal:// hint. Sports-app
// hosts are calendar-specific by design (teamsnap.com, gc.com, etc.) so
// any URL there is almost certainly a feed.
//
// google_classroom is INTENTIONALLY excluded. Google Calendar invitation
// emails contain dozens of *.google.com URLs that aren't feeds — login,
// Meet, help articles, "respond to invitation" pages, Calendar UI deep
// links. Treating any of them as a feed creates ghost sources that
// 500 forever in the iCal worker. Real Google Classroom calendar URLs
// always end in .ics (the "secret address in iCal format" Google
// generates) and are caught by the extension check above.
const INBOUND_TRUSTED_APP_HOSTNAMES = new Set([
  'teamsnap', 'teamsnapone', 'gamechanger', 'playmetrics',
  'teamsideline', 'byga', 'sportsengine', 'teamreach',
  'leagueapps', 'demosphere', '360player', 'sportsyou',
  'band', 'rankone',
]);

// HTML entities to decode before regex matching. We don't pull in a full
// HTML parser — the email body comes pre-rendered HTML from MUAs that
// already escape literal &, <, >, etc. A small entity table covers
// 99%+ of cases.
const ENTITIES = {
  '&amp;':  '&',
  '&lt;':   '<',
  '&gt;':   '>',
  '&quot;': '"',
  '&#39;':  "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeHtmlEntities(s) {
  if (!s) return '';
  return s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] || m);
}

// Email HTML buries URLs inside href="..." attributes. A naive tag-strip
// would erase those tags whole and lose the URL with them. So:
//   1. drop style/script blocks (their src/url() values are never the
//      calendar URL the parent forwarded)
//   2. promote href + src values to bare text BEFORE stripping tags so
//      the URL_RE below can find them
//   3. strip remaining tags
function stripHtmlTags(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    // For tags carrying a URL we care about (href / src), replace the
    // ENTIRE tag with the URL value so it doesn't get eaten by the
    // generic tag-strip below. Promoting just the attribute leaves the
    // URL inside the surrounding `<a ... >` brackets, which the next
    // step would then swallow.
    .replace(/<[^>]*?\b(?:href|src)\s*=\s*["']([^"']+)["'][^>]*>/gi, ' $1 ')
    .replace(/<[^>]+>/g, ' ');
}

// Match scheme + host + path in a single capture, stopping at whitespace,
// quotes, or HTML angle brackets. Allow trailing punctuation that's almost
// never part of the URL (period, comma, paren) to be trimmed below.
const URL_RE = /\b(https?:\/\/[^\s<>"')]+|webcal:\/\/[^\s<>"')]+)/gi;

function trimTrailingPunctuation(url) {
  return url.replace(/[.,;:!?)]+$/, '');
}

export function extractIcalUrls({ text, html } = {}) {
  const haystack = [
    text || '',
    html ? decodeHtmlEntities(stripHtmlTags(html)) : '',
  ].join('\n');

  const found = new Set();
  let m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(haystack)) !== null) {
    const cleaned = trimTrailingPunctuation(m[1]);
    // Heuristic for "is this a calendar URL?":
    //   1. webcal://... — always calendar
    //   2. ends in .ics / .ical (with optional querystring) — calendar
    //   3. host matches a known sports-app pattern from sourceIntake —
    //      probably calendar (TeamSnap dashboard URLs sometimes pass)
    if (/^webcal:\/\//i.test(cleaned))                                         { found.add(cleaned); continue; }
    if (/\.(ics|ical)(\?|$)/i.test(cleaned))                                   { found.add(cleaned); continue; }
    if (INBOUND_TRUSTED_APP_HOSTNAMES.has(detectAppFromUrl(cleaned)))          { found.add(cleaned); continue; }
  }
  return Array.from(found);
}
