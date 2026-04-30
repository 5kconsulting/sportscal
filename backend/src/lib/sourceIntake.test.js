// Run with:  node src/lib/sourceIntake.test.js
// Mirrors the no-framework pattern in src/normalizer.test.js.

import assert from 'assert';
import {
  normalizeIcalUrl,
  detectAppFromUrl,
  suggestSourceName,
  intakeFromUrl,
} from './sourceIntake.js';

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

console.log('\nnormalizeIcalUrl');
test('webcal:// gets rewritten to https://', () => {
  assert.strictEqual(
    normalizeIcalUrl('webcal://example.com/feed.ics'),
    'https://example.com/feed.ics',
  );
});
test('https:// passes through', () => {
  assert.ok(normalizeIcalUrl('https://example.com/x.ics').startsWith('https://'));
});
test('non-string returns null', () => {
  assert.strictEqual(normalizeIcalUrl(null), null);
  assert.strictEqual(normalizeIcalUrl(123), null);
});
test('whitespace-only returns null', () => {
  assert.strictEqual(normalizeIcalUrl('   '), null);
});
test('non-http(s) schemes return null', () => {
  assert.strictEqual(normalizeIcalUrl('ftp://x/y'), null);
  assert.strictEqual(normalizeIcalUrl('javascript:alert(1)'), null);
});
test('garbage returns null', () => {
  assert.strictEqual(normalizeIcalUrl('not a url'), null);
});

console.log('\ndetectAppFromUrl');
const appCases = [
  ['https://teamsnap.com/foo.ics',                      'teamsnap'],
  ['webcal://www.teamsnap.com/foo.ics',                 'teamsnap'],
  ['https://go.teamsnap.com/team/x.ics',                'teamsnapone'],
  ['https://gc.com/teams/foo/schedule.ics',             'gamechanger'],
  ['https://www.gamechanger.io/x.ics',                  'gamechanger'],
  ['https://playmetrics.com/x.ics',                     'playmetrics'],
  ['https://league.teamsideline.com/x.ics',             'teamsideline'],
  ['https://x.byga.net/foo.ics',                        'byga'],
  ['https://soccer.sportsengine.com/x.ics',             'sportsengine'],
  ['https://legacy.ngin.com/x.ics',                     'sportsengine'],
  ['https://teamreach.com/x.ics',                       'teamreach'],
  ['https://leagueapps.com/x.ics',                      'leagueapps'],
  ['https://demosphere.com/x.ics',                      'demosphere'],
  ['https://360player.com/x.ics',                       '360player'],
  ['https://sportsyou.com/x.ics',                       'sportsyou'],
  ['https://band.us/x.ics',                             'band'],
  ['https://rankone.com/x.ics',                         'rankone'],
  ['https://calendar.google.com/calendar/ical/abc.ics', 'google_classroom'],
  ['https://example.com/feed.ics',                      'custom'],
];
for (const [url, expected] of appCases) {
  test(`${url} -> ${expected}`, () => {
    assert.strictEqual(detectAppFromUrl(url), expected);
  });
}

console.log('\nsuggestSourceName');
test('skips generic last segment, finds team name', () => {
  assert.strictEqual(
    suggestSourceName('https://gc.com/teams/Tigard%20Tigers/schedule.ics', 'gamechanger'),
    'Tigard Tigers',
  );
});
test('falls back to app label when only opaque tokens', () => {
  assert.strictEqual(
    suggestSourceName('https://teamsnap.com/feed/abc123/calendar.ics', 'teamsnap'),
    'TeamSnap calendar',
  );
});
test('rejects long hex tokens', () => {
  assert.strictEqual(
    suggestSourceName('https://example.com/feed/deadbeef0123/feed.ics', 'custom'),
    'Custom calendar',
  );
});
test('decodes URL-encoded names', () => {
  assert.strictEqual(
    suggestSourceName('https://teamsnap.com/team/Tualatin%20FC%20U12/schedule.ics', 'teamsnap'),
    'Tualatin FC U12',
  );
});
test('replaces dashes with spaces in slugs', () => {
  assert.strictEqual(
    suggestSourceName('https://playmetrics.com/teams/tualatin-fc-u12/feed.ics', 'playmetrics'),
    'tualatin fc u12',
  );
});
test('works on demo feeds', () => {
  assert.strictEqual(
    suggestSourceName('https://www.sportscalapp.com/demo-feeds/soccer-games.ics', 'custom'),
    'soccer games',
  );
});
test('rejects pure-digit segments', () => {
  assert.strictEqual(
    suggestSourceName('https://example.com/123456/feed.ics', 'custom'),
    'Custom calendar',
  );
});

console.log('\nintakeFromUrl');
test('valid url returns ical_source candidate', () => {
  const out = intakeFromUrl('https://teamsnap.com/team/Tigers/schedule.ics');
  assert.strictEqual(out.kind, 'ical_source');
  assert.strictEqual(out.candidate.app, 'teamsnap');
  assert.strictEqual(out.candidate.fetch_type, 'ical');
  assert.strictEqual(out.candidate.ical_url, 'https://teamsnap.com/team/Tigers/schedule.ics');
});
test('webcal url normalized in candidate', () => {
  const out = intakeFromUrl('webcal://teamsnap.com/team/Tigers/schedule.ics');
  assert.ok(out.candidate.ical_url.startsWith('https://'));
});
test('garbage returns null', () => {
  assert.strictEqual(intakeFromUrl('not a url'), null);
  assert.strictEqual(intakeFromUrl(null), null);
  assert.strictEqual(intakeFromUrl(undefined), null);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
