// Run with:  node src/lib/inboundParser.test.js

import assert from 'assert';
import { extractIcalUrls } from './inboundParser.js';

let passed = 0;
let failed = 0;
function test(label, fn) {
  try { fn(); console.log(`  ✓ ${label}`); passed++; }
  catch (err) { console.error(`  ✗ ${label}`); console.error(`    ${err.message}`); failed++; }
}

console.log('\nextractIcalUrls (text)');
test('plain text with .ics', () => {
  const urls = extractIcalUrls({
    text: 'Subscribe at https://teamsnap.com/team/Tigers/schedule.ics for the schedule.',
  });
  assert.deepStrictEqual(urls, ['https://teamsnap.com/team/Tigers/schedule.ics']);
});
test('webcal scheme', () => {
  const urls = extractIcalUrls({
    text: 'Use webcal://gc.com/teams/foo/sched.ics in your calendar app.',
  });
  assert.deepStrictEqual(urls, ['webcal://gc.com/teams/foo/sched.ics']);
});
test('strips trailing punctuation', () => {
  const urls = extractIcalUrls({
    text: 'See: https://teamsnap.com/feed/schedule.ics. Thanks.',
  });
  assert.deepStrictEqual(urls, ['https://teamsnap.com/feed/schedule.ics']);
});
test('multiple unique URLs', () => {
  const urls = extractIcalUrls({
    text: 'A: https://a.com/x.ics  B: https://b.com/y.ics',
  });
  assert.deepStrictEqual(urls.sort(), [
    'https://a.com/x.ics',
    'https://b.com/y.ics',
  ]);
});
test('dedupes repeated URLs', () => {
  const urls = extractIcalUrls({
    text: 'https://a.com/x.ics https://a.com/x.ics',
  });
  assert.deepStrictEqual(urls, ['https://a.com/x.ics']);
});
test('skips non-calendar URLs', () => {
  const urls = extractIcalUrls({
    text: 'Visit https://example.com or read https://example.com/article.html',
  });
  assert.deepStrictEqual(urls, []);
});
test('keeps known-app hosts even without .ics', () => {
  const urls = extractIcalUrls({
    text: 'Schedule: https://teamsnap.com/team/Tigers/feed/abc',
  });
  assert.deepStrictEqual(urls, ['https://teamsnap.com/team/Tigers/feed/abc']);
});
test('empty / null input returns empty array', () => {
  assert.deepStrictEqual(extractIcalUrls({}), []);
  assert.deepStrictEqual(extractIcalUrls({ text: '' }), []);
  assert.deepStrictEqual(extractIcalUrls(undefined), []);
});

console.log('\nextractIcalUrls (html)');
test('decodes HTML entities + strips tags', () => {
  const urls = extractIcalUrls({
    html: '<p>Subscribe: <a href="https://teamsnap.com/team/Tigers/schedule.ics?token=abc&amp;v=2">here</a></p>',
  });
  assert.deepStrictEqual(
    urls,
    ['https://teamsnap.com/team/Tigers/schedule.ics?token=abc&v=2'],
  );
});
test('ignores style / script content', () => {
  const urls = extractIcalUrls({
    html: '<style>body { background: url(https://evil.com/track.ics); }</style><p>Real: https://teamsnap.com/x.ics</p>',
  });
  assert.deepStrictEqual(urls, ['https://teamsnap.com/x.ics']);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
