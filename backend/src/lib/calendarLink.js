// ============================================================================
// calendarLink.js — what to do when a parent pastes a link.
//
// The setup helper used to hand every pasted link to the model, which asked
// for a name and a kid and a confirmation before adding anything — and
// people with a working link in hand left mid-interrogation. It also let
// non-calendar links through (a GameChanger team page and a PDF both got
// saved as "calendars" and then failed forever).
//
// Now a message that is just a link takes a fast path, no model involved:
//   1. Known wrong links (GameChanger's team-sharing link, a PDF) get a
//      specific answer that says what the link is and where the right one is.
//   2. Anything else is fetched once to see whether it really is a calendar.
//      If it is, the reply carries an add_source ACTION straight away; the
//      client asks "whose is this?" afterwards. If it isn't, we say so.
//
// checkCalendarLink is also used by POST /api/sources so a model-emitted or
// hand-typed add can't save a link that doesn't open a calendar.
// ============================================================================

import { normalizeIcalUrl, detectAppFromUrl, suggestSourceName } from './sourceIntake.js';
import { APP_INSTRUCTIONS } from './setupAgentPrompt.js';

const URL_RE = /(?:https?|webcal):\/\/[^\s<>"']+/gi;

// Words that can sit next to a link without telling us anything
// ("here it is", "ok try this one").
const FILLER = new Set(['here', 'heres', 'it', 'is', 'this', 'that', 'the', 'a', 'my', 'link', 'url',
  'calendar', 'one', 'ok', 'okay', 'try', 'now', 'and', 'got', 'found', 'i', 'copied', 'pasted',
  'paste', 'please', 'pls', 'thanks', 'how', 'about', 'again']);

// The link in a message that is essentially only a link ("here: <url>").
// Returns null when there's more than one link or real text alongside it —
// that text may say whose calendar it is, so the model should read it.
export function extractSoleUrl(text) {
  if (typeof text !== 'string') return null;
  const urls = text.match(URL_RE) || [];
  if (urls.length !== 1) return null;
  const words = text.replace(urls[0], ' ').toLowerCase().replace(/'/g, '').match(/[a-z0-9]+/g) || [];
  if (words.length > 6 || words.some(w => !FILLER.has(w))) return null;
  return urls[0].replace(/[),.;!?]+$/, '');
}

export function isGameChangerShareLink(url) {
  const normalized = normalizeIcalUrl(url);
  if (!normalized) return false;
  try {
    const u = new URL(normalized);
    return /^(web\.|www\.)?gc\.com$/i.test(u.hostname) && /^\/teams\//i.test(u.pathname);
  } catch { return false; }
}

export function classifyPastedLink(url) {
  const normalized = normalizeIcalUrl(url);
  if (!normalized) return 'invalid';
  if (isGameChangerShareLink(normalized)) return 'gamechanger_share';
  try {
    if (/\.pdf$/i.test(new URL(normalized).pathname)) return 'pdf';
  } catch { return 'invalid'; }
  return 'candidate';
}

// Never fetch private or loopback hosts on a user's say-so.
function isBlockedHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.internal') || h.endsWith('.local')) return true;
  if (h.includes(':')) return true;                          // IPv6 literal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;       // IPv4 literal
  return false;
}

const checkCache = new Map();                // normalized url -> { at, result }
const CACHE_MS = 3 * 60 * 1000;

/**
 * Fetch a link once and say whether it's a calendar.
 *   { ok: true,  eventCount, calendarName }        it is
 *   { ok: false, reason: 'web_page' | 'pdf' | 'not_calendar' | 'not_found' | 'invalid', status? }
 *   { ok: null,  reason: 'unverified' }             timeout / server error — can't tell
 */
export async function checkCalendarLink(rawUrl, { timeoutMs = 8000, fetchImpl = fetch } = {}) {
  const url = normalizeIcalUrl(rawUrl);
  if (!url) return { ok: false, reason: 'invalid' };
  let host;
  try { host = new URL(url).hostname; } catch { return { ok: false, reason: 'invalid' }; }
  if (isBlockedHost(host)) return { ok: false, reason: 'invalid' };

  const cached = checkCache.get(url);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.result;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let result;
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SportsCal/1.0 (calendar aggregator)',
        'Accept': 'text/calendar, application/ical, */*',
      },
    });
    if ([400, 401, 403, 404, 410].includes(response.status)) {
      result = { ok: false, reason: 'not_found', status: response.status };
    } else if (!response.ok) {
      result = { ok: null, reason: 'unverified' };
    } else {
      const text = await response.text();
      if (!text.includes('BEGIN:VCALENDAR')) {
        const head = text.slice(0, 200).trimStart().toLowerCase();
        const reason = head.startsWith('%pdf') ? 'pdf'
          : (head.startsWith('<') ? 'web_page' : 'not_calendar');
        result = { ok: false, reason };
      } else {
        const nameMatch = text.match(/^X-WR-CALNAME:(.+)$/m);
        const calendarName = nameMatch
          ? nameMatch[1].replace(/\\([,;\\])/g, '$1').replace(/[{}]/g, '').trim().slice(0, 80)
          : null;
        result = {
          ok: true,
          eventCount: (text.match(/BEGIN:VEVENT/g) || []).length,
          calendarName: calendarName || null,
        };
      }
    }
  } catch {
    result = { ok: null, reason: 'unverified' };
  } finally {
    clearTimeout(timer);
  }

  if (result.ok !== null) checkCache.set(url, { at: Date.now(), result });
  if (checkCache.size > 500) checkCache.clear();
  return result;
}

// Plain-language reason a link was refused, for API errors and chat replies.
export function describeBadLink(check) {
  if (check.reason === 'web_page') return 'That link opens a web page, not a calendar.';
  if (check.reason === 'pdf')      return 'That link is a PDF, not a calendar.';
  if (check.reason === 'not_found') return 'That link didn\'t work. It may have been cut off when it was copied.';
  if (check.reason === 'invalid')  return 'That doesn\'t look like a link we can open.';
  return 'That link doesn\'t open a calendar.';
}

function numbered(steps) {
  return steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
}

function appLabel(app) {
  return app && app !== 'custom' ? (APP_INSTRUCTIONS[app]?.label || null) : null;
}

function photoFallback(platform) {
  return platform === 'mobile'
    ? 'Can\'t find it? Take a screenshot of the schedule in your team app and tap the camera button below. I\'ll read it from the picture.'
    : 'Can\'t find it? Take a screenshot of the schedule, or save it as a PDF, and attach it with the paperclip below. I\'ll read it from that.';
}

/**
 * Reply for a message that is just a link, or null to let the model answer.
 * `priorUserTexts` are the user's earlier messages in this chat (oldest first).
 */
export async function linkFastPath({ text, priorUserTexts = [], kids = [], platform = 'web',
  inboundAddress = null, fetchImpl }) {
  const url = extractSoleUrl(text);
  // Braces would break the clients' ACTION:{...} parser; let the model handle those.
  if (!url || /[{}]/.test(url)) return null;
  const kind = classifyPastedLink(url);
  if (kind === 'invalid') return null;

  if (kind === 'gamechanger_share') {
    const triedBefore = priorUserTexts.some(t => {
      const prior = extractSoleUrl(t);
      return prior && isGameChangerShareLink(prior);
    });
    if (triedBefore) {
      return {
        kind: 'gamechanger_share_again',
        content: 'That\'s the team-sharing link again, so GameChanger isn\'t showing you the calendar option. '
          + 'Let\'s skip the link.\n\n'
          + (platform === 'mobile'
            ? 'Open your team\'s Schedule in GameChanger, take a screenshot, then tap the camera button below. I\'ll read the games from the picture.'
            : 'Open your team\'s schedule in GameChanger, take a screenshot, and attach it with the paperclip below. I\'ll read the games from the picture.'),
      };
    }
    return {
      kind: 'gamechanger_share',
      content: 'That\'s GameChanger\'s team-sharing link. It lets people follow the team, but the schedule doesn\'t come with it.\n\n'
        + 'The calendar link is in a different place:\n\n'
        + numbered(APP_INSTRUCTIONS.gamechanger.steps) + '\n\n'
        + photoFallback(platform),
    };
  }

  if (kind === 'pdf') {
    return {
      kind: 'pdf_link',
      content: platform === 'mobile'
        ? 'That link is a PDF, not a calendar link. I can still read it: '
          + (inboundAddress
            ? `email the PDF to ${inboundAddress}`
            : 'email the PDF to your SportsCal address (in Settings)')
          + ', or take a screenshot of it and tap the camera button below.'
        : 'That link is a PDF, not a calendar link. I can still read it: download the PDF and attach it with the paperclip below.',
    };
  }

  const app = detectAppFromUrl(url);
  const label = appLabel(app);
  const check = await checkCalendarLink(url, { fetchImpl });

  if (check.ok === false) {
    const steps = APP_INSTRUCTIONS[app]?.steps;
    return {
      kind: 'bad_link',
      content: describeBadLink(check) + ' I haven\'t added anything.\n\n'
        + (label && steps
          ? `Here's where ${label} keeps the calendar link:\n\n${numbered(steps)}\n\n`
          : 'Look for "Subscribe", "Sync calendar" or "Export calendar" in your team app, and copy the link it gives you.\n\n')
        + photoFallback(platform),
    };
  }

  // A working calendar (or one we couldn't check in time — add it and let
  // the first sync report back). No questions before adding.
  const onlyKid = kids.length === 1 ? kids[0].name : null;
  const name = (check.ok && check.calendarName) || suggestSourceName(url, app);
  const what = label ? `${label} calendar` : 'calendar';
  let line;
  if (check.ok && check.eventCount > 0) {
    line = `Got it. That's a working ${what} with ${check.eventCount} event${check.eventCount === 1 ? '' : 's'}. Adding it`;
  } else if (check.ok) {
    line = `Got it. That's a working ${what}. Nothing is posted on it yet, so it will look empty until the team adds events. Adding it`;
  } else {
    line = `Got it. Adding your ${what}`;
  }
  line += onlyKid ? ` for ${onlyKid} now.` : ' now.';
  if (!onlyKid) line += '\n\nWhose schedule is this?';

  const action = {
    action: 'add_source',
    name: String(name).replace(/[{}]/g, '').slice(0, 100),
    app,
    ical_url: url,
    kid_names: onlyKid ? [onlyKid] : [],
  };
  return { kind: 'added', content: `${line}\n\nACTION:${JSON.stringify(action)}` };
}
