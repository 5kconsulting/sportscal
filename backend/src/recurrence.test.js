// ============================================================
// recurrence.test.js — run with: node src/recurrence.test.js
// Run under TZ=UTC as well (npm test does) — that's what Railway uses.
// ============================================================

import assert from 'assert';
import { generateOccurrences, wallToInstant, isValidTimeZone, MAX_INSTANCES } from './lib/recurrence.js';

let passed = 0;
let failed = 0;
function test(label, fn) {
  try { fn(); console.log(`  ✓ ${label}`); passed++; }
  catch (err) { console.error(`  ✗ ${label}`); console.error(`    ${err.message}`); failed++; }
}

const LA = 'America/Los_Angeles';
const local = (d, tz = LA) => d.toLocaleString('en-US', {
  timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});
const MIN = 60_000;

console.log('\nWeekly');

test('Tuesday 6pm Pacific stays on Tuesdays at 6pm (evening crosses UTC midnight)', () => {
  const startsAt = wallToInstant(LA, 2026, 10, 17, 18, 0);     // Tue Nov 17 2026
  const out = generateOccurrences({ startsAt, duration: 90 * MIN, recurrence: 'weekly',
    recurrenceDays: [2], recurrenceUntil: '2026-12-08', timeZone: LA });
  assert.deepStrictEqual(out.map(o => local(o.startsAt)), [
    'Tue, Nov 17, 6:00 PM', 'Tue, Nov 24, 6:00 PM', 'Tue, Dec 1, 6:00 PM', 'Tue, Dec 8, 6:00 PM',
  ]);
  assert.strictEqual(out[0].endsAt - out[0].startsAt, 90 * MIN);
});

test('keeps 4pm local across the November DST change', () => {
  const startsAt = wallToInstant(LA, 2026, 9, 20, 16, 0);      // Tue Oct 20 2026, PDT
  const out = generateOccurrences({ startsAt, duration: 60 * MIN, recurrence: 'weekly',
    recurrenceDays: [2], recurrenceUntil: '2026-11-10', timeZone: LA });
  assert.deepStrictEqual(out.map(o => local(o.startsAt)), [
    'Tue, Oct 20, 4:00 PM', 'Tue, Oct 27, 4:00 PM', 'Tue, Nov 3, 4:00 PM', 'Tue, Nov 10, 4:00 PM',
  ]);
});

test('keeps 7pm local across the March DST change', () => {
  const startsAt = wallToInstant(LA, 2027, 2, 9, 19, 0);       // Tue Mar 9 2027, PST
  const out = generateOccurrences({ startsAt, duration: null, recurrence: 'weekly',
    recurrenceDays: [2], recurrenceUntil: '2027-03-16', timeZone: LA });
  assert.deepStrictEqual(out.map(o => local(o.startsAt)), ['Tue, Mar 9, 7:00 PM', 'Tue, Mar 16, 7:00 PM']);
  assert.strictEqual(out[0].endsAt, null);
});

test('multiple weekdays, starting mid-week, until date inclusive', () => {
  const startsAt = wallToInstant(LA, 2026, 10, 18, 17, 30);    // Wed Nov 18
  const out = generateOccurrences({ startsAt, duration: 60 * MIN, recurrence: 'weekly',
    recurrenceDays: [4, 1], recurrenceUntil: '2026-11-30', timeZone: LA });
  assert.deepStrictEqual(out.map(o => local(o.startsAt)), [
    'Thu, Nov 19, 5:30 PM', 'Mon, Nov 23, 5:30 PM', 'Thu, Nov 26, 5:30 PM', 'Mon, Nov 30, 5:30 PM',
  ]);
});

test('no days picked → the start date\'s weekday', () => {
  const startsAt = wallToInstant(LA, 2026, 10, 21, 9, 0);      // Sat Nov 21
  const out = generateOccurrences({ startsAt, duration: null, recurrence: 'weekly',
    recurrenceDays: [], recurrenceUntil: '2026-12-05', timeZone: LA });
  assert.deepStrictEqual(out.map(o => local(o.startsAt)), [
    'Sat, Nov 21, 9:00 AM', 'Sat, Nov 28, 9:00 AM', 'Sat, Dec 5, 9:00 AM',
  ]);
});

test('every 2 weeks alternates from the start week', () => {
  const startsAt = wallToInstant(LA, 2026, 10, 17, 18, 0);     // Tue Nov 17
  const out = generateOccurrences({ startsAt, duration: null, recurrence: 'biweekly',
    recurrenceDays: [2, 4], recurrenceUntil: '2026-12-17', timeZone: LA });
  assert.deepStrictEqual(out.map(o => local(o.startsAt)), [
    'Tue, Nov 17, 6:00 PM', 'Thu, Nov 19, 6:00 PM', 'Tue, Dec 1, 6:00 PM', 'Thu, Dec 3, 6:00 PM',
    'Tue, Dec 15, 6:00 PM', 'Thu, Dec 17, 6:00 PM',
  ]);
});

test('uses the family\'s timezone, not Pacific', () => {
  const NY = 'America/New_York';
  const startsAt = wallToInstant(NY, 2026, 10, 17, 20, 0);     // Tue 8pm Eastern
  const out = generateOccurrences({ startsAt, duration: null, recurrence: 'weekly',
    recurrenceDays: [2], recurrenceUntil: '2026-11-24', timeZone: NY });
  assert.deepStrictEqual(out.map(o => local(o.startsAt, NY)), ['Tue, Nov 17, 8:00 PM', 'Tue, Nov 24, 8:00 PM']);
});

test('all-day (local midnight) stays at local midnight', () => {
  const startsAt = wallToInstant(LA, 2026, 10, 1, 0, 0);       // Sun Nov 1 (DST ends that night)
  const out = generateOccurrences({ startsAt, duration: null, recurrence: 'weekly',
    recurrenceDays: [0], recurrenceUntil: '2026-11-08', timeZone: LA });
  assert.deepStrictEqual(out.map(o => local(o.startsAt)), ['Sun, Nov 1, 12:00 AM', 'Sun, Nov 8, 12:00 AM']);
});

test(`caps at ${MAX_INSTANCES}`, () => {
  const startsAt = wallToInstant(LA, 2026, 10, 16, 7, 0);
  const out = generateOccurrences({ startsAt, duration: null, recurrence: 'weekly',
    recurrenceDays: [0, 1, 2, 3, 4, 5, 6], recurrenceUntil: '2028-12-31', timeZone: LA });
  assert.strictEqual(out.length, MAX_INSTANCES);
});

console.log('\nMonthly');

test('same date each month, same local time across DST', () => {
  const startsAt = wallToInstant(LA, 2026, 9, 15, 18, 0);      // Oct 15 PDT
  const out = generateOccurrences({ startsAt, duration: null, recurrence: 'monthly',
    recurrenceUntil: '2027-01-15', timeZone: LA });
  assert.deepStrictEqual(out.map(o => local(o.startsAt)), [
    'Thu, Oct 15, 6:00 PM', 'Sun, Nov 15, 6:00 PM', 'Tue, Dec 15, 6:00 PM', 'Fri, Jan 15, 6:00 PM',
  ]);
});

test('the 31st skips short months instead of rolling over', () => {
  const startsAt = wallToInstant(LA, 2027, 0, 31, 10, 0);      // Jan 31
  const out = generateOccurrences({ startsAt, duration: null, recurrence: 'monthly',
    recurrenceUntil: '2027-05-31', timeZone: LA });
  assert.deepStrictEqual(out.map(o => local(o.startsAt)), [
    'Sun, Jan 31, 10:00 AM', 'Wed, Mar 31, 10:00 AM', 'Mon, May 31, 10:00 AM',
  ]);
});

console.log('\nEdges');

test('no repeat → just the one event, end time kept', () => {
  const startsAt = new Date('2026-11-18T02:00:00Z');
  const out = generateOccurrences({ startsAt, duration: 30 * MIN, recurrence: 'none', timeZone: LA });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].startsAt, startsAt);
  assert.strictEqual(out[0].endsAt.toISOString(), '2026-11-18T02:30:00.000Z');
});

test('repeat without an until date → just the one event', () => {
  const startsAt = new Date('2026-11-18T02:00:00Z');
  assert.strictEqual(generateOccurrences({ startsAt, duration: null, recurrence: 'weekly',
    recurrenceUntil: null, timeZone: LA }).length, 1);
});

test('until before start → just the one event', () => {
  const startsAt = wallToInstant(LA, 2026, 10, 17, 18, 0);
  assert.strictEqual(generateOccurrences({ startsAt, duration: null, recurrence: 'weekly',
    recurrenceDays: [2], recurrenceUntil: '2026-11-01', timeZone: LA }).length, 1);
});

test('bad or missing timezone falls back to Pacific', () => {
  assert.ok(!isValidTimeZone('Mars/Olympus'));
  assert.ok(!isValidTimeZone(undefined));
  assert.ok(isValidTimeZone('Europe/London'));
  const startsAt = wallToInstant(LA, 2026, 10, 17, 18, 0);
  const out = generateOccurrences({ startsAt, duration: null, recurrence: 'weekly',
    recurrenceDays: [2], recurrenceUntil: '2026-11-24', timeZone: 'Mars/Olympus' });
  assert.deepStrictEqual(out.map(o => local(o.startsAt)), ['Tue, Nov 17, 6:00 PM', 'Tue, Nov 24, 6:00 PM']);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
