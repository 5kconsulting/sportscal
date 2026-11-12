// ============================================================
// welcomeSeries.test.js — run with: node src/welcomeSeries.test.js
// ============================================================

import assert from 'assert';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const { WELCOME_STEPS, isWelcomeDue, pickWelcomeStep, renderWelcomeEmail } = await import('./emails/welcomeSeries.js');
const { tipsUnsubscribeUrl, verifyTipsUnsubscribe } = await import('./lib/unsubscribe.js');

let passed = 0;
let failed = 0;
function test(label, fn) {
  try { fn(); console.log(`  ✓ ${label}`); passed++; }
  catch (err) { console.error(`  ✗ ${label}`); console.error(`    ${err.message}`); failed++; }
}

const LA = 'America/Los_Angeles';
// Signed up Tue Nov 10, 2026 at 8:30 PM Pacific (= Nov 11 04:30 UTC).
const signup = new Date('2026-11-11T04:30:00Z');
const user = (over = {}) => ({
  id: 'u1', name: 'Patton Smith', timezone: LA, created_at: signup,
  welcome_series: [], welcome_series_sent_at: null, push_enabled: false, push_opted_out: false, ...over,
});
const at = (iso) => new Date(iso);

console.log('\nWhen it sends');

test('not on the signup day, even at 9 AM', () => {
  assert.ok(!isWelcomeDue(user({ created_at: at('2026-11-10T15:00:00Z') }), at('2026-11-10T17:05:00Z')));
});
test('9 AM local the next morning', () => {
  assert.ok(isWelcomeDue(user(), at('2026-11-11T17:05:00Z')));   // 9:05 AM PST
});
test('not at 8 AM or 10 AM local', () => {
  assert.ok(!isWelcomeDue(user(), at('2026-11-11T16:05:00Z')));
  assert.ok(!isWelcomeDue(user(), at('2026-11-11T18:05:00Z')));
});
test("uses the user's own timezone", () => {
  const ny = user({ timezone: 'America/New_York' });
  assert.ok(isWelcomeDue(ny, at('2026-11-11T14:05:00Z')));       // 9:05 AM EST
  assert.ok(!isWelcomeDue(ny, at('2026-11-11T17:05:00Z')));
});
test('one a day: not again once today’s went out', () => {
  assert.ok(!isWelcomeDue(user({ welcome_series: ['forward'], welcome_series_sent_at: at('2026-11-11T17:05:30Z') }), at('2026-11-11T17:35:00Z')));
  assert.ok(isWelcomeDue(user({ welcome_series: ['forward'], welcome_series_sent_at: at('2026-11-11T17:05:30Z') }), at('2026-11-12T17:05:00Z')));
});
test('not enrolled (pre-series accounts) or finished', () => {
  assert.ok(!isWelcomeDue(user({ welcome_series: null }), at('2026-11-11T17:05:00Z')));
  assert.ok(!isWelcomeDue(user({ welcome_series: [...WELCOME_STEPS] }), at('2026-11-20T17:05:00Z')));
});

console.log('\nWhat it sends');

const ctx = (over = {}) => ({ kidNames: [], calendarCount: 0, householdSize: 1, pendingInvite: false, hasApp: false, isPremium: true, atCalendarLimit: false, ...over });

test('steps go in order', () => {
  assert.deepStrictEqual(pickWelcomeStep(user(), ctx()), { key: 'forward', skipped: [] });
  assert.deepStrictEqual(pickWelcomeStep(user({ welcome_series: ['forward'] }), ctx()), { key: 'coparent', skipped: [] });
});
test('co-parent skipped when the household is already shared or invited', () => {
  assert.deepStrictEqual(pickWelcomeStep(user({ welcome_series: ['forward'] }), ctx({ householdSize: 2 })), { key: 'rides', skipped: ['coparent'] });
  assert.deepStrictEqual(pickWelcomeStep(user({ welcome_series: ['forward'] }), ctx({ pendingInvite: true })), { key: 'rides', skipped: ['coparent'] });
});
test('nightly skipped only when they already get it', () => {
  const after = user({ welcome_series: ['forward', 'coparent', 'rides'] });
  assert.strictEqual(pickWelcomeStep(after, ctx({ hasApp: true })).key, 'nightly');      // app, push off
  assert.deepStrictEqual(pickWelcomeStep({ ...after, push_enabled: true }, ctx({ hasApp: true })), { key: 'calendars', skipped: ['nightly'] });
  assert.strictEqual(pickWelcomeStep({ ...after, push_enabled: true, push_opted_out: true }, ctx({ hasApp: true })).key, 'nightly');
});
test('free plan skips rides (Premium-only); no email pitches Premium', () => {
  assert.deepStrictEqual(pickWelcomeStep(user({ welcome_series: ['forward', 'coparent'] }), ctx({ isPremium: false })), { key: 'nightly', skipped: ['rides'] });
  for (const key of WELCOME_STEPS) {
    const e = renderWelcomeEmail(key, { user: user(), ctx: ctx({ isPremium: false }), inboundAddress: 'a@b.c', unsubscribeUrl: 'u' });
    assert.ok(!/premium|upgrade/i.test(e.html + e.text), `${key} mentions Premium`);
  }
});
test('calendars skipped at the plan limit', () => {
  const u = user({ welcome_series: ['forward', 'coparent', 'rides', 'nightly'] });
  assert.deepStrictEqual(pickWelcomeStep(u, ctx({ atCalendarLimit: true })), { key: null, skipped: ['calendars'] });
});
test('nothing left that applies → no key, skips still recorded', () => {
  const u = user({ welcome_series: ['forward', 'rides', 'nightly', 'calendars'] });
  assert.deepStrictEqual(pickWelcomeStep(u, ctx({ householdSize: 2 })), { key: null, skipped: ['coparent'] });
});

console.log('\nForwarding email');

const ADDRESS = 'add+1a2b3c4d@inbox.sportscalapp.com';
const UNSUB = 'https://sportscalapp.com/api/email/unsubscribe?u=u1&t=abc';
const render = (key, c, u = user()) => renderWelcomeEmail(key, { user: u, ctx: c, inboundAddress: ADDRESS, unsubscribeUrl: UNSUB });

test('shows their address', () => {
  const e = render('forward', ctx({ kidNames: ['Bobby'] }));
  assert.ok(e.html.includes(ADDRESS) && e.text.includes(ADDRESS));
  assert.ok(e.html.includes(`mailto:${ADDRESS}`));
});
test('no kids → flags adding a kid first', () => {
  const e = render('forward', ctx());
  assert.ok(e.html.includes('One thing first: add your kids'));
  assert.ok(e.html.includes('/kids'));
  assert.ok(e.text.includes('add your kids'));
});
test('one kid → named, no flag', () => {
  const e = render('forward', ctx({ kidNames: ['Bobby'] }));
  assert.ok(e.html.includes('Bobby’s calendar'));
  assert.ok(!e.html.includes('One thing first'));
});
test('several kids → explains picking whose it is', () => {
  const e = render('forward', ctx({ kidNames: ['Levi', 'James', 'Caleb'] }));
  assert.ok(e.html.includes('Levi, James and Caleb'));
});
test('kid names are escaped', () => {
  assert.ok(!render('forward', ctx({ kidNames: ['<b>Bo</b>'] })).html.includes('<b>Bo</b>'));
});

console.log('\nOther emails');

test('every email links its demo GIF and has the unsubscribe link', () => {
  for (const [key, clip] of [['coparent', 'coparent'], ['rides', 'ride'], ['nightly', 'bedtime'], ['calendars', 'calendar']]) {
    const e = render(key, ctx());
    assert.ok(e.html.includes(`/email/welcome-${clip}.gif`), `${key} gif`);
    assert.ok(e.html.includes(UNSUB) && e.text.includes(UNSUB), `${key} unsubscribe`);
  }
  assert.ok(render('forward', ctx()).html.includes(UNSUB));
});
test('nightly: App Store link without the app, Settings path with it', () => {
  assert.ok(render('nightly', ctx()).html.includes('apps.apple.com'));
  const withApp = render('nightly', ctx({ hasApp: true })).html;
  assert.ok(!withApp.includes('apps.apple.com') && withApp.includes('Nightly heads-up'));
});
test('calendars: copy adapts to how many are connected', () => {
  assert.strictEqual(render('calendars', ctx()).subject, 'Add your first team in about 30 seconds');
  const two = render('calendars', ctx({ calendarCount: 2 }));
  assert.strictEqual(two.subject, 'Is every team in?');
  assert.ok(two.html.includes("connected 2 calendars"));
  assert.ok(two.html.includes(ADDRESS));
});

console.log('\nUnsubscribe links');

const id = '3f6b2c1a-1111-4222-8333-944455556666';
test('a link verifies for its own user only', () => {
  const t = new URL(tipsUnsubscribeUrl(id)).searchParams.get('t');
  assert.ok(verifyTipsUnsubscribe(id, t));
  assert.ok(!verifyTipsUnsubscribe('3f6b2c1a-1111-4222-8333-944455550000', t));
  assert.ok(!verifyTipsUnsubscribe(id, t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A')));
  assert.ok(!verifyTipsUnsubscribe(id, ''));
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
