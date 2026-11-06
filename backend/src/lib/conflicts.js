// ============================================================
// Conflict detection
//
// Two events "conflict" when a parent can't cover both: they overlap in
// time, involve different kid sets, and happen in different places —
// the classic "two kids, two places, same hour" problem.
//
// Not conflicts:
//   - Same kid set (a family event seen from two sources).
//   - Same place (two teams practicing at one field = one trip).
//   - All-day or 12h+ events (tournament weekends, "Placeholder Date"
//     playoff slots, picture day). They'd flag everything they span.
//
// Missing ends_at → 1h. An ends_at on or before starts_at (seen in
// SportsYou feeds, where DTEND lands on the previous day) is rolled
// forward a day at a time so the event keeps its real end time.
// ============================================================

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const LONG_EVENT = 12 * HOUR;

// Words that don't identify a place, plus placeholders that mean "unknown".
const PLACE_STOPWORDS = new Set(['the', 'at', 'and', 'of', 'a']);
const PLACEHOLDER_PLACES = new Set(['tbd', 'tba', 'home', 'away', 'n a', 'na', 'online', 'virtual']);

function eventBounds(e) {
  const start = new Date(e.starts_at).getTime();
  let end = e.ends_at ? new Date(e.ends_at).getTime() : start + HOUR;
  for (let i = 0; end <= start && i < 2; i++) end += DAY;
  if (end <= start) end = start + HOUR;
  return { start, end };
}

function placeTokens(location) {
  if (!location) return null;
  const norm = location.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!norm || PLACEHOLDER_PLACES.has(norm)) return null;
  const tokens = norm.split(' ').filter(w => !PLACE_STOPWORDS.has(w));
  return tokens.length ? new Set(tokens) : null;
}

// Same place when every word of the shorter name appears in the longer
// one ("Tigard HS Turf" ⊂ "Tigard HS Soccer Turf 11v11"). One-word names
// ("Gym", "Field") are too vague to call it the same place.
export function samePlace(locA, locB) {
  const a = placeTokens(locA);
  const b = placeTokens(locB);
  if (!a || !b) return false;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  if (small.size < 2) return false;
  for (const w of small) if (!big.has(w)) return false;
  return true;
}

function kidSetsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

export function annotateConflicts(events) {
  const info = events.map(e => {
    const { start, end } = eventBounds(e);
    return {
      start,
      end,
      kidIds: new Set((e.kids || []).map(k => k.id)),
      skip: e.all_day || end - start >= LONG_EVENT,
    };
  });

  return events.map((e, i) => {
    const conflicts = [];
    const a = info[i];
    if (!a.skip) {
      for (let j = 0; j < events.length; j++) {
        if (i === j) continue;
        const b = info[j];
        if (b.skip) continue;
        if (a.start >= b.end || b.start >= a.end) continue;        // no time overlap
        if (kidSetsEqual(a.kidIds, b.kidIds)) continue;            // same-family gathering
        const other = events[j];
        if (samePlace(e.location, other.location)) continue;       // one trip covers both
        conflicts.push({
          id: other.id,
          title: other.display_title || other.raw_title,
          starts_at: other.starts_at,
          location: other.location,
          kid_names: (other.kids || []).map(k => k.name),
        });
      }
    }
    return { ...e, conflicts };
  });
}
