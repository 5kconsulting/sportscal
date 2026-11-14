// ============================================================
// calendarLink.test.js — run with: node src/calendarLink.test.js
// ============================================================

import assert from 'assert';
import {
  extractSoleUrl, classifyPastedLink, isGameChangerShareLink,
  checkCalendarLink, linkFastPath,
} from './lib/calendarLink.js';
import { detectAppFromUrl } from './lib/sourceIntake.js';
import { APP_INSTRUCTIONS, buildSystemPrompt } from './lib/setupAgentPrompt.js';

let passed = 0;
let failed = 0;
async function test(label, fn) {
  try { await fn(); console.log(`  ✓ ${label}`); passed++; }
  catch (err) { console.error(`  ✗ ${label}`); console.error(`    ${err.message}`); failed++; }
}

// A stand-in for fetch that answers per URL. Every test uses a distinct
// URL because checkCalendarLink caches definite answers for a few minutes.
const ICS = (n, name) => 'BEGIN:VCALENDAR\r\n' + (name ? `X-WR-CALNAME:${name}\r\n` : '')
  + 'BEGIN:VEVENT\r\nSUMMARY:x\r\nEND:VEVENT\r\n'.repeat(n) + 'END:VCALENDAR\r\n';
const respond = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, text: async () => body });
const actionOf = (content) => JSON.parse(content.match(/ACTION:(\{.*?\})/s)[1]);

const GC_SHARE = 'https://web.gc.com/teams/Gdnh9mSyIGr0/live?pid=Copy&c=team_share_link';

console.log('\nReading a pasted message');

await test('a bare link is picked out', () => {
  assert.strictEqual(extractSoleUrl('  webcal://ical-cdn.teamsnap.com/team_schedule/abc.ics '), 'webcal://ical-cdn.teamsnap.com/team_schedule/abc.ics');
  assert.strictEqual(extractSoleUrl('here: https://x.example.com/a.ics.'), 'https://x.example.com/a.ics');
});
await test('a link with real words around it is left for the model', () => {
  assert.strictEqual(extractSoleUrl("This is Emma's soccer team https://x.example.com/a.ics"), null);
  assert.strictEqual(extractSoleUrl('https://a.example.com/1.ics https://b.example.com/2.ics'), null);
  assert.strictEqual(extractSoleUrl('houston texans'), null);
});
await test('GameChanger team-sharing links are recognised', () => {
  assert.ok(isGameChangerShareLink(GC_SHARE));
  assert.ok(isGameChangerShareLink('https://web.gc.com/teams/Om8aBRRhAYsd/schedule'));
  assert.ok(!isGameChangerShareLink('webcal://api.team-manager.gc.com/ics-calendar-documents/user/abc.ics?teamId=1&token=2'));
  assert.strictEqual(classifyPastedLink(GC_SHARE), 'gamechanger_share');
  assert.strictEqual(classifyPastedLink('https://www.example.org/files/practice-schedule.pdf'), 'pdf');
  assert.strictEqual(classifyPastedLink('https://appserv.teamreach.com/369/calendarical.php?gid=1&uid=2'), 'candidate');
});
await test('real-world hosts map to the right app', () => {
  assert.strictEqual(detectAppFromUrl('https://appserv.teamreach.com/369/calendarical.php?gid=1'), 'teamreach');
  assert.strictEqual(detectAppFromUrl('https://api.teamreach.net/api/events/teams/1/ical'), 'teamreach');
  assert.strictEqual(detectAppFromUrl('https://manage.snap.app/ical/link/x/1/2'), 'teamsnap');
  assert.strictEqual(detectAppFromUrl('webcal://api.team-manager.gc.com/ics-calendar-documents/user/a.ics'), 'gamechanger');
});

console.log('\nChecking a link');

await test('a calendar: counts events and reads its name', async () => {
  const r = await checkCalendarLink('webcal://feeds.example.com/t1.ics', { fetchImpl: respond(200, ICS(3, 'Tualatin FC\\, U12')) });
  assert.deepStrictEqual(r, { ok: true, eventCount: 3, calendarName: 'Tualatin FC, U12' });
});
await test('a web page, a PDF and a dead link are refused', async () => {
  assert.strictEqual((await checkCalendarLink('https://feeds.example.com/page', { fetchImpl: respond(200, '<!doctype html><html>') })).reason, 'web_page');
  assert.strictEqual((await checkCalendarLink('https://feeds.example.com/doc', { fetchImpl: respond(200, '%PDF-1.7 ...') })).reason, 'pdf');
  assert.strictEqual((await checkCalendarLink('https://feeds.example.com/gone.ics', { fetchImpl: respond(404, '') })).reason, 'not_found');
});
await test('a server error or timeout is "can\'t tell", not a refusal', async () => {
  assert.strictEqual((await checkCalendarLink('https://feeds.example.com/busy.ics', { fetchImpl: respond(503, '') })).ok, null);
  assert.strictEqual((await checkCalendarLink('https://feeds.example.com/slow.ics', { fetchImpl: async () => { throw new Error('aborted'); } })).ok, null);
});
await test('private and loopback hosts are never fetched', async () => {
  let called = false;
  const spy = async () => { called = true; return { ok: true, status: 200, text: async () => ICS(1) }; };
  for (const u of ['http://localhost/a.ics', 'http://127.0.0.1/a.ics', 'http://10.0.0.5/a.ics', 'http://redis.railway.internal/a.ics', 'http://[::1]/a.ics']) {
    assert.strictEqual((await checkCalendarLink(u, { fetchImpl: spy })).ok, false);
  }
  assert.ok(!called);
});

console.log('\nThe reply to a pasted link');

await test('a working link is added at once; one kid on the account means no question', async () => {
  const r = await linkFastPath({ text: 'https://appserv.teamreach.com/1/calendarical.php?gid=1&uid=2',
    kids: [{ name: 'Mia' }], platform: 'mobile', fetchImpl: respond(200, ICS(12)) });
  assert.strictEqual(r.kind, 'added');
  assert.deepStrictEqual(actionOf(r.content), { action: 'add_source', name: 'TeamReach calendar', app: 'teamreach',
    ical_url: 'https://appserv.teamreach.com/1/calendarical.php?gid=1&uid=2', kid_names: ['Mia'] });
  assert.ok(r.content.includes('working TeamReach calendar with 12 events'));
  assert.ok(r.content.includes('for Mia'));
  assert.ok(!r.content.includes('Whose schedule'));
});
await test('no kids, or several: added first, then asks whose', async () => {
  for (const kids of [[], [{ name: 'Mia' }, { name: 'Jack' }]]) {
    const url = `webcal://ical-cdn.teamsnap.com/team_schedule/k${kids.length}.ics`;
    const r = await linkFastPath({ text: url, kids, platform: 'mobile', fetchImpl: respond(200, ICS(5, 'Tigers 10U')) });
    const a = actionOf(r.content);
    assert.strictEqual(a.name, 'Tigers 10U');
    assert.deepStrictEqual(a.kid_names, []);
    assert.ok(r.content.includes('Whose schedule is this?'));
  }
});
await test('an empty calendar is still added, and says it will look empty', async () => {
  const r = await linkFastPath({ text: 'https://feeds.example.com/empty.ics', kids: [], fetchImpl: respond(200, ICS(0)) });
  assert.strictEqual(r.kind, 'added');
  assert.ok(r.content.includes('Nothing is posted on it yet'));
});
await test('a link we could not check in time is added anyway', async () => {
  const r = await linkFastPath({ text: 'https://feeds.example.com/timeout.ics', kids: [], fetchImpl: respond(502, '') });
  assert.strictEqual(r.kind, 'added');
});
await test('GameChanger sharing link: says what it is and gives the right steps', async () => {
  const r = await linkFastPath({ text: GC_SHARE, kids: [], platform: 'mobile', fetchImpl: async () => { throw new Error('should not fetch'); } });
  assert.strictEqual(r.kind, 'gamechanger_share');
  assert.ok(!r.content.includes('ACTION:'));
  assert.ok(r.content.includes('team-sharing link'));
  assert.ok(r.content.includes('gear icon'));
  assert.ok(r.content.includes('Schedule Sync'));
  assert.ok(r.content.includes('camera button'));
});
await test('the same sharing link a second time: stops repeating and offers the screenshot', async () => {
  const r = await linkFastPath({ text: GC_SHARE, priorUserTexts: ['I use GameChanger.', GC_SHARE], platform: 'mobile' });
  assert.strictEqual(r.kind, 'gamechanger_share_again');
  assert.ok(r.content.includes('screenshot'));
  assert.ok(!r.content.includes('gear icon'));
});
await test('a web page is refused with that app\'s steps, and nothing is added', async () => {
  const r = await linkFastPath({ text: 'https://go.teamsnap.com/1234/schedule', kids: [], platform: 'web', fetchImpl: respond(200, '<html>') });
  assert.strictEqual(r.kind, 'bad_link');
  assert.ok(!r.content.includes('ACTION:'));
  assert.ok(r.content.includes('web page'));
  assert.ok(r.content.includes('paperclip'));
});
await test('a PDF link points at the PDF route', async () => {
  const r = await linkFastPath({ text: 'https://www.example.org/x/schedule.pdf', platform: 'mobile', inboundAddress: 'add+abc@inbox.sportscalapp.com' });
  assert.strictEqual(r.kind, 'pdf_link');
  assert.ok(r.content.includes('add+abc@inbox.sportscalapp.com'));
});
await test('anything that is not a lone link goes to the model', async () => {
  assert.strictEqual(await linkFastPath({ text: 'we use teamsnap' }), null);
  assert.strictEqual(await linkFastPath({ text: "Emma's team: https://feeds.example.com/x.ics" }), null);
});

console.log('\nWording');

await test('GameChanger steps use the gear, not the share button', () => {
  const steps = APP_INSTRUCTIONS.gamechanger.steps.join(' ');
  assert.ok(steps.includes('gear icon'));
  assert.ok(steps.includes('Sync Schedule to Your Calendar'));
  assert.ok(!/share icon/i.test(steps));
});
await test('no step tells a parent about an "iCal URL"', () => {
  for (const [key, info] of Object.entries(APP_INSTRUCTIONS)) {
    const all = [...info.steps, info.note || '', info.label].join(' ');
    assert.ok(!/iCal URL|iCal link|iCal feed(?!")/i.test(all.replace(/"[^"]*"/g, '')), `${key}: ${all}`);
  }
});
await test('the prompt teaches add-first and the assign_kids follow-up', () => {
  const p = buildSystemPrompt([{ name: 'Emma' }], { platform: 'mobile', inboundAddress: 'add+abc@inbox.sportscalapp.com' });
  assert.ok(p.includes('"action":"assign_kids"'));
  assert.ok(p.includes('Do not ask anything before adding'));
  assert.ok(p.includes('camera button'));
  assert.ok(p.includes('NEVER invent'));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
