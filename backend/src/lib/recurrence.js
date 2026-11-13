// ============================================================
// Repeating manual events — expands one "Add event" into its occurrences.
//
// All calendar math happens on the family's wall clock (an IANA timezone
// sent by the client, falling back to users.timezone), not the server's.
// Railway runs in UTC, and the original generator used Date#getDay /
// setHours in server time, which broke two ways for US families:
//
//   * Evening events cross midnight UTC, so "Tuesday 6pm Pacific" is a
//     Wednesday in UTC — weekly repeats landed on the wrong weekday.
//   * Copying the UTC hour forward drifts across DST: a 4pm practice set
//     up in August showed at 3pm after the November change.
//
// Here every occurrence is "same local time-of-day on the next matching
// local date", converted back to an instant with that date's own offset.
// ============================================================

const DAY_MS = 86_400_000;
export const MAX_INSTANCES = 365;

const dtfCache = new Map();
function dtf(tz) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try { dtf(tz); return true; } catch { return false; }
}

// Wall-clock fields of instant `ms` in `tz`. month is 0-based like Date.
export function wallParts(tz, ms) {
  const p = {};
  for (const { type, value } of dtf(tz).formatToParts(new Date(ms))) p[type] = value;
  return {
    y: +p.year, m: +p.month - 1, d: +p.day,
    h: +p.hour % 24, mi: +p.minute, s: +p.second,
  };
}

function offsetMs(tz, ms) {
  const w = wallParts(tz, ms);
  const whole = Math.floor(ms / 1000) * 1000;
  return Date.UTC(w.y, w.m, w.d, w.h, w.mi, w.s) - whole;
}

// Instant for a wall-clock time in `tz`. Two passes settle the offset on
// either side of a DST change; a time inside the spring-forward gap
// (2:30am that day doesn't exist) lands an hour later, like most calendars.
export function wallToInstant(tz, y, m, d, h, mi, s = 0) {
  const guess = Date.UTC(y, m, d, h, mi, s);
  const first = guess - offsetMs(tz, guess);
  const second = guess - offsetMs(tz, first);
  return new Date(second);
}

// Civil-day numbers: days since 1970-01-01, independent of any timezone.
const dayNum = (y, m, d) => Math.floor(Date.UTC(y, m, d) / DAY_MS);
const weekdayOf = (n) => ((n % 7) + 4 + 7) % 7;          // 1970-01-01 was a Thursday
function civil(n) {
  const x = new Date(n * DAY_MS);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate() };
}

// recurrence_until is a calendar date. Clients send "YYYY-MM-DD"; accept a
// full timestamp too (read as a date in the family's timezone).
function untilDayNum(tz, until) {
  if (until == null || until === '') return null;
  const m = typeof until === 'string' && until.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return dayNum(+m[1], +m[2] - 1, +m[3]);
  const t = new Date(until).getTime();
  if (Number.isNaN(t)) return null;
  const w = wallParts(tz, t);
  return dayNum(w.y, w.m, w.d);
}

/**
 * @param {object}  o
 * @param {Date}    o.startsAt     first occurrence (instant)
 * @param {number?} o.duration     ms; null for no end time
 * @param {string}  o.recurrence   'none' | 'weekly' | 'biweekly' | 'monthly'
 * @param {number[]} o.recurrenceDays  weekdays 0=Sun..6=Sat in the family's tz (weekly/biweekly)
 * @param {string?} o.recurrenceUntil  'YYYY-MM-DD', inclusive
 * @param {string}  o.timeZone     IANA zone the family lives in
 * @returns {{startsAt: Date, endsAt: Date|null}[]}
 */
export function generateOccurrences({ startsAt, duration, recurrence, recurrenceDays = [],
  recurrenceUntil, timeZone }) {
  const single = [{ startsAt, endsAt: duration != null ? new Date(startsAt.getTime() + duration) : null }];
  const tz = isValidTimeZone(timeZone) ? timeZone : 'America/Los_Angeles';
  const untilDay = untilDayNum(tz, recurrenceUntil);
  if (!recurrence || recurrence === 'none' || untilDay == null) return single;

  const w = wallParts(tz, startsAt.getTime());
  const startDay = dayNum(w.y, w.m, w.d);
  const out = [];
  const push = (n) => {
    const c = civil(n);
    const at = wallToInstant(tz, c.y, c.m, c.d, w.h, w.mi, w.s);
    out.push({ startsAt: at, endsAt: duration != null ? new Date(at.getTime() + duration) : null });
  };

  if (recurrence === 'weekly' || recurrence === 'biweekly') {
    const step = recurrence === 'biweekly' ? 14 : 7;
    const picked = [...new Set((recurrenceDays || []).map(Number))]
      .filter(d => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort((a, b) => a - b);
    const days = picked.length ? picked : [weekdayOf(startDay)];
    // Weeks run Sunday–Saturday, anchored on the week of the start date,
    // so "every 2 weeks" alternates from the week you picked.
    for (let week = startDay - weekdayOf(startDay); week <= untilDay; week += step) {
      for (const d of days) {
        const n = week + d;
        if (n < startDay) continue;
        if (n > untilDay || out.length >= MAX_INSTANCES) break;
        push(n);
      }
      if (out.length >= MAX_INSTANCES) break;
    }
  } else if (recurrence === 'monthly') {
    // Same date each month. A start on the 29th–31st skips months that
    // don't have that date (Google/Apple behave the same) instead of
    // rolling into the next month.
    for (let k = 0; out.length < MAX_INSTANCES; k++) {
      const y = w.y + Math.floor((w.m + k) / 12);
      const m = (w.m + k) % 12;
      const n = dayNum(y, m, w.d);
      if (n > untilDay) break;
      if (civil(n).m !== m) continue;   // e.g. Feb 31 → skip
      push(n);
    }
  }

  return out.length ? out : single;
}
