// Welcome carousel clip: "Know tomorrow, tonight" (real dashboard behind a
// mocked iOS push banner — the push itself only exists on a real phone).
// Run: SC_TOKEN=... node videos/welcome-bedtime.js
import { record } from '../lib/recorder.js';

// Builds the banner from the demo account's real events for tomorrow, the
// same way renderDigest() in backend/src/workers/pushWorker.js does at 8 PM,
// so the notification matches the dashboard behind it.
const TZ = 'America/Los_Angeles'; // the demo account's timezone

async function tomorrowDigest(page) {
  const digest = await page.evaluate(async (tz) => {
    const day = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
    const tomorrow = day(new Date(Date.now() + 86_400_000));
    const r = await fetch('/api/events?days=3', { headers: { Authorization: `Bearer ${localStorage.getItem('sc_token')}` } });
    const list = ((await r.json()).events || []).filter(e => day(new Date(e.starts_at)) === tomorrow);
    if (!list.length) return null;
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
    const lines = list.slice(0, 3).map(e => `${e.all_day ? 'All day' : fmt.format(new Date(e.starts_at))} · ${e.display_title || e.title || 'Event'}`);
    if (list.length > 3) lines.push(`+${list.length - 3} more`);
    return { title: list.length === 1 ? 'Tomorrow on SportsCal' : `Tomorrow: ${list.length} events`, body: lines.join('\n') };
  }, TZ);
  if (!digest) throw new Error('The demo account has nothing tomorrow; the banner would be made up. Re-record another day.');
  return digest;
}

async function pushBanner(page, show, { title, body } = {}) {
  await page.evaluate((show, title, body) => {
    let b = document.getElementById('__push');
    if (!b) {
      b = document.createElement('div');
      b.id = '__push';
      Object.assign(b.style, {
        position: 'fixed', top: '12px', left: '10px', right: '10px', zIndex: '2147483645',
        background: 'rgba(246,247,250,.96)', backdropFilter: 'blur(20px)', borderRadius: '20px',
        padding: '13px 14px', display: 'flex', gap: '11px', alignItems: 'flex-start',
        boxShadow: '0 14px 36px rgba(0,0,0,.28)', transform: 'translateY(-170%)',
        transition: 'transform 520ms cubic-bezier(.22,1,.36,1)',
        fontFamily: '-apple-system, "SF Pro Text", sans-serif',
      });
      b.innerHTML = `
        <img src="/favicon-192.png" style="width:38px;height:38px;border-radius:9px;flex-shrink:0">
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between">
            <span style="font-size:13px;font-weight:600;color:#0F172A">SportsCal</span>
            <span style="font-size:12px;color:#64748B">8:00 PM</span>
          </div>
          <div data-k="title" style="font-size:14px;font-weight:600;color:#0F172A;margin-top:2px"></div>
          <div data-k="body" style="font-size:13px;color:#374151;margin-top:2px;line-height:1.35;white-space:pre-line"></div>
        </div>`;
      b.querySelector('[data-k="title"]').textContent = title;
      b.querySelector('[data-k="body"]').textContent = body;
      document.body.appendChild(b);
    }
    requestAnimationFrame(() => { b.style.transform = show ? 'translateY(0)' : 'translateY(-170%)'; });
  }, show, title, body);
}

await record({
  name: 'welcome-bedtime',
  token: process.env.SC_TOKEN,
  size: '720x1280',
  script: async ({ page, sleep, scrollTo }) => {
    const digest = await tomorrowDigest(page);
    console.log(`[bedtime] banner: ${digest.title} / ${digest.body.replace(/\n/g, ' | ')}`);
    await sleep(900);
    await pushBanner(page, true, digest);
    await sleep(3600);
    await pushBanner(page, false);
    await sleep(600);
    await scrollTo(520, 1200);  // tomorrow's events
    await sleep(1500);
    await scrollTo(0, 900);
    await sleep(500);
  },
});
