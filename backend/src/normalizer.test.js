// ============================================================
// normalizer.test.js
//
// Run with:  node src/normalizer.test.js
// No test framework needed — plain Node assertions.
// ============================================================

import assert from 'assert';
import {
  buildDisplayTitle,
  normalizeIcalFeed,
  normalizeScrapedFeed,
  hashEventContent,
} from './normalizer.js';

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

// ------------------------------------------------------------
// buildDisplayTitle
// ------------------------------------------------------------
console.log('\nTitle builder:');

test('no kids — returns raw title', () => {
  assert.strictEqual(
    buildDisplayTitle('Soccer Practice', null, []),
    'Soccer Practice'
  );
});

test('no kids with location — appends location', () => {
  assert.strictEqual(
    buildDisplayTitle('Soccer Practice', 'Community Park', []),
    'Soccer Practice at Community Park'
  );
});

test('one kid — prefixes name', () => {
  const kids = [{ name: 'Bob', sort_order: 0 }];
  assert.strictEqual(
    buildDisplayTitle('Soccer Practice', null, kids),
    'Bob - Soccer Practice'
  );
});

test('one kid with location', () => {
  const kids = [{ name: 'Bob', sort_order: 0 }];
  assert.strictEqual(
    buildDisplayTitle('Soccer Practice', 'Community Park', kids),
    'Bob - Soccer Practice at Community Park'
  );
});

test('two kids — joined with &', () => {
  const kids = [
    { name: 'Bob', sort_order: 0 },
    { name: 'Emma', sort_order: 1 },
  ];
  assert.strictEqual(
    buildDisplayTitle('Soccer Practice', null, kids),
    'Bob & Emma - Soccer Practice'
  );
});

test('three kids — Oxford-style list', () => {
  const kids = [
    { name: 'Bob', sort_order: 0 },
    { name: 'Emma', sort_order: 1 },
    { name: 'Jake', sort_order: 2 },
  ];
  assert.strictEqual(
    buildDisplayTitle('Soccer Practice', null, kids),
    'Bob, Emma & Jake - Soccer Practice'
  );
});

test('kids sorted by sort_order not insertion order', () => {
  const kids = [
    { name: 'Emma', sort_order: 1 },
    { name: 'Bob', sort_order: 0 },
  ];
  assert.strictEqual(
    buildDisplayTitle('Practice', null, kids),
    'Bob & Emma - Practice'
  );
});

test('kids with same sort_order sorted alphabetically', () => {
  const kids = [
    { name: 'Zoe', sort_order: 0 },
    { name: 'Amy', sort_order: 0 },
  ];
  assert.strictEqual(
    buildDisplayTitle('Game', null, kids),
    'Amy & Zoe - Game'
  );
});

test('full address location uses venue name only', () => {
  const kids = [{ name: 'Bob', sort_order: 0 }];
  assert.strictEqual(
    buildDisplayTitle('Practice', 'Community Park, 1234 Main St, Portland, OR', kids),
    'Bob - Practice at Community Park'
  );
});

test('GPS coordinates location is stripped', () => {
  const kids = [{ name: 'Bob', sort_order: 0 }];
  assert.strictEqual(
    buildDisplayTitle('Practice', '45.5231, -122.6765', kids),
    'Bob - Practice'
  );
});

test('null title falls back to Untitled Event', () => {
  assert.strictEqual(
    buildDisplayTitle(null, null, []),
    'Untitled Event'
  );
});

test('GameChanger suffix stripped from raw title', () => {
  assert.strictEqual(
    buildDisplayTitle('Soccer Practice - GameChanger', null, []),
    'Soccer Practice'
  );
});

test('PlayMetrics suffix stripped from raw title', () => {
  assert.strictEqual(
    buildDisplayTitle('Soccer Practice (PlayMetrics)', null, []),
    'Soccer Practice'
  );
});

test('TeamSnap bracket prefix stripped from raw title', () => {
  assert.strictEqual(
    buildDisplayTitle('[Portland FC] Soccer Practice', null, []),
    'Soccer Practice'
  );
});


// ------------------------------------------------------------
// hashEventContent — change detection
// ------------------------------------------------------------
console.log('\nContent hashing:');

const t1 = new Date('2024-09-14T10:00:00Z');
const t2 = new Date('2024-09-14T12:00:00Z');

test('same inputs produce same hash', () => {
  assert.strictEqual(
    hashEventContent('Practice', 'Park', t1, t2),
    hashEventContent('Practice', 'Park', t1, t2)
  );
});

test('different title produces different hash', () => {
  assert.notStrictEqual(
    hashEventContent('Practice', 'Park', t1, t2),
    hashEventContent('Game', 'Park', t1, t2)
  );
});

test('different time produces different hash', () => {
  const t3 = new Date('2024-09-14T11:00:00Z');
  assert.notStrictEqual(
    hashEventContent('Practice', 'Park', t1, t2),
    hashEventContent('Practice', 'Park', t1, t3)
  );
});

test('title comparison is case-insensitive', () => {
  assert.strictEqual(
    hashEventContent('practice', 'Park', t1, t2),
    hashEventContent('PRACTICE', 'Park', t1, t2)
  );
});


// ------------------------------------------------------------
// normalizeIcalFeed
// ------------------------------------------------------------
console.log('\niCal feed normalization:');

const mockIcalData = {
  event1: {
    type: 'VEVENT',
    uid: 'abc-123@teamsnap.com',
    summary: 'Soccer Practice',
    location: 'Community Park',
    start: new Date('2099-09-14T10:00:00Z'), // far future so not filtered
    end: new Date('2099-09-14T12:00:00Z'),
    datetype: 'datetime',
  },
  event2: {
    type: 'VEVENT',
    uid: 'def-456@teamsnap.com',
    summary: 'Team Photo Day',
    start: new Date('2099-09-21T09:00:00Z'),
    datetype: 'datetime',
  },
  tz: {
    type: 'VTIMEZONE', // should be filtered out
    tzid: 'America/Los_Angeles',
  },
};

test('filters out non-VEVENT entries', () => {
  const kids = [{ name: 'Bob', sort_order: 0 }];
  const events = normalizeIcalFeed(mockIcalData, 'src-1', 'user-1', kids);
  assert.strictEqual(events.length, 2);
});

test('builds display title with kid prefix', () => {
  const kids = [{ name: 'Bob', sort_order: 0 }];
  const events = normalizeIcalFeed(mockIcalData, 'src-1', 'user-1', kids);
  assert.strictEqual(events[0].displayTitle, 'Bob - Soccer Practice at Community Park');
});

test('preserves raw title separately', () => {
  const kids = [{ name: 'Bob', sort_order: 0 }];
  const events = normalizeIcalFeed(mockIcalData, 'src-1', 'user-1', kids);
  assert.strictEqual(events[0].rawTitle, 'Soccer Practice');
});

test('uses iCal UID as sourceUid', () => {
  const events = normalizeIcalFeed(mockIcalData, 'src-1', 'user-1', []);
  assert.strictEqual(events[0].sourceUid, 'abc-123@teamsnap.com');
});

test('events sorted by start time', () => {
  const events = normalizeIcalFeed(mockIcalData, 'src-1', 'user-1', []);
  assert.ok(events[0].startsAt < events[1].startsAt);
});

test('deduplicates events with same uid in one batch', () => {
  const dupeData = {
    ...mockIcalData,
    eventDupe: { ...mockIcalData.event1 }, // same uid
  };
  const events = normalizeIcalFeed(dupeData, 'src-1', 'user-1', []);
  assert.strictEqual(events.length, 2); // not 3
});


// ------------------------------------------------------------
// normalizeScrapedFeed
// ------------------------------------------------------------
console.log('\nScrape feed normalization:');

const mockScraped = [
  {
    uid: 'byga-game-2024-09-14',
    title: 'U12 Boys Game',
    startsAt: new Date('2099-09-14T10:00:00Z'),
    endsAt: new Date('2099-09-14T11:30:00Z'),
    location: 'Tualatin Hills Soccer Complex',
  },
  {
    uid: 'byga-practice-2024-09-17',
    title: 'Practice',
    startsAt: new Date('2099-09-17T17:00:00Z'),
    location: null,
  },
];

test('normalizes scraped events with kid prefix', () => {
  const kids = [{ name: 'Emma', sort_order: 0 }];
  const events = normalizeScrapedFeed(mockScraped, 'src-2', 'user-1', kids);
  assert.strictEqual(events[0].displayTitle, 'Emma - U12 Boys Game at Tualatin Hills Soccer Complex');
});

test('uses scraper-provided uid', () => {
  const events = normalizeScrapedFeed(mockScraped, 'src-2', 'user-1', []);
  assert.strictEqual(events[0].sourceUid, 'byga-game-2024-09-14');
});

test('handles null location gracefully', () => {
  const kids = [{ name: 'Emma', sort_order: 0 }];
  const events = normalizeScrapedFeed(mockScraped, 'src-2', 'user-1', kids);
  assert.strictEqual(events[1].displayTitle, 'Emma - Practice');
});

test('filters out invalid events with no startsAt', () => {
  const bad = [{ title: 'No date event', startsAt: null }];
  const events = normalizeScrapedFeed(bad, 'src-2', 'user-1', []);
  assert.strictEqual(events.length, 0);
});

test('filters out events with unparseable date string', () => {
  const bad = [{ title: 'Bad date', startsAt: 'not a date' }];
  const events = normalizeScrapedFeed(bad, 'src-2', 'user-1', []);
  assert.strictEqual(events.length, 0);
});


// ------------------------------------------------------------
// Summary
// ------------------------------------------------------------
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
