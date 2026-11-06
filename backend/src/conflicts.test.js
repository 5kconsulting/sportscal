// ============================================================
// conflicts.test.js — run with: node src/conflicts.test.js
// Plain Node assertions, same style as normalizer.test.js.
// ============================================================

import assert from 'assert';
import { annotateConflicts, samePlace } from './lib/conflicts.js';

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

const BOYS = [{ id: 'levi', name: 'Levi' }, { id: 'james', name: 'James' }, { id: 'caleb', name: 'Caleb' }];
const EVIE = [{ id: 'evie', name: 'Evie' }];

let n = 0;
function ev(kids, starts_at, ends_at, location = null, extra = {}) {
  return { id: `e${++n}`, raw_title: `Event ${n}`, kids, starts_at, ends_at, location, all_day: false, ...extra };
}
const counts = (events) => annotateConflicts(events).map(e => e.conflicts.length);

console.log('\nsamePlace');

test('shorter name contained in longer one', () => {
  assert.ok(samePlace('Tigard HS Turf', 'Tigard HS Soccer Turf 11v11'));
});
test('punctuation and case ignored', () => {
  assert.ok(samePlace('Cook Park — Field 3', 'cook park field 3'));
});
test('different places', () => {
  assert.ok(!samePlace('Tigard HS Soccer Turf 11v11',
    'Westside Christian High School, Southwest Pfaffle Street, Tigard, OR, USA'));
});
test('one-word and placeholder names never match', () => {
  assert.ok(!samePlace('Gym', 'Main Gym'));
  assert.ok(!samePlace('TBD', 'TBD'));
  assert.ok(!samePlace('Home', 'Home'));
  assert.ok(!samePlace(null, 'Cook Park'));
});

console.log('\nannotateConflicts');

test('different kids, different places, overlapping → conflict', () => {
  assert.deepStrictEqual(counts([
    ev(BOYS, '2026-11-12T03:30:00Z', '2026-11-12T04:45:00Z', 'Tigard HS Soccer Turf'),
    ev(EVIE, '2026-11-12T03:00:00Z', '2026-11-12T04:30:00Z', 'Westside Christian High School'),
  ]), [1, 1]);
});

test('same kid set never conflicts (siblings on one team)', () => {
  assert.deepStrictEqual(counts([
    ev(BOYS, '2026-11-07T23:00:00Z', '2026-11-08T00:20:00Z', 'Tigard HS Soccer Turf 11v11'),
    ev(BOYS, '2026-11-07T23:00:00Z', '2026-11-08T00:30:00Z', 'Tigard HS Turf'),
  ]), [0, 0]);
});

test('same field, different kids → not a conflict', () => {
  assert.deepStrictEqual(counts([
    ev(EVIE, '2026-11-13T03:00:00Z', '2026-11-13T04:30:00Z', 'Tigard HS Soccer Turf 11v11'),
    ev(BOYS, '2026-11-13T03:30:00Z', '2026-11-13T04:45:00Z', 'Tigard HS Soccer Turf 11v11'),
  ]), [0, 0]);
});

test('24h placeholder events do not conflict', () => {
  assert.deepStrictEqual(counts([
    ev(EVIE, '2026-11-07T00:00:00Z', '2026-11-08T00:00:00Z', null, { raw_title: 'OSAA Playoffs - Placeholder Date' }),
    ev(BOYS, '2026-11-07T03:00:00Z', '2026-11-07T04:00:00Z', 'Tigard HS Soccer Turf 11v11'),
  ]), [0, 0]);
});

test('all-day events do not conflict', () => {
  assert.deepStrictEqual(counts([
    ev(EVIE, '2026-11-07T08:00:00Z', null, null, { all_day: true }),
    ev(BOYS, '2026-11-07T18:00:00Z', '2026-11-07T19:00:00Z', 'Cook Park'),
  ]), [0, 0]);
});

test('end before start is rolled forward to the real end time', () => {
  // Fri 3:30–5:00 PM PT with DTEND on Thursday, against a Fri 4:30 PM event.
  assert.deepStrictEqual(counts([
    ev(EVIE, '2026-11-06T23:30:00Z', '2026-11-06T01:00:00Z', 'Westside Christian High School'),
    ev(BOYS, '2026-11-07T00:30:00Z', '2026-11-07T01:30:00Z', 'Tigard HS Soccer Turf'),
  ]), [1, 1]);
});

test('missing end → 1 hour', () => {
  assert.deepStrictEqual(counts([
    ev(EVIE, '2026-11-07T18:00:00Z', null, 'Cook Park Field 3'),
    ev(BOYS, '2026-11-07T18:59:00Z', '2026-11-07T20:00:00Z', 'Tigard HS Turf'),
    ev(BOYS, '2026-11-07T19:00:00Z', '2026-11-07T20:00:00Z', 'Tigard HS Turf'),
  ]), [1, 1, 0]);
});

test('conflict payload lists the other event and its kids', () => {
  const [a] = annotateConflicts([
    ev(EVIE, '2026-11-12T03:00:00Z', '2026-11-12T04:30:00Z', 'Westside Christian High School'),
    ev(BOYS, '2026-11-12T03:30:00Z', '2026-11-12T04:45:00Z', 'Tigard HS Soccer Turf', { display_title: 'Practice' }),
  ]);
  assert.strictEqual(a.conflicts[0].title, 'Practice');
  assert.deepStrictEqual(a.conflicts[0].kid_names, ['Levi', 'James', 'Caleb']);
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
