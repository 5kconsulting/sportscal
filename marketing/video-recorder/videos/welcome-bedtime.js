// Welcome carousel clip: "Know tomorrow, tonight" (real dashboard behind a
// mocked iOS push banner — the push itself only exists on a real phone).
// Run: SC_TOKEN=... node videos/welcome-bedtime.js
import { record } from '../lib/recorder.js';

// Same shape as renderDigest() in backend/src/workers/pushWorker.js (sent at
// 8 PM local). Keep the event in step with what the demo dashboard shows for
// tomorrow when re-recording.
const title = 'Tomorrow on SportsCal';
const body = '7:00 PM · Bobby - Practice @ Tigard HS Soccer Turf 11v11';

async function pushBanner(page, show) {
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
          <div style="font-size:14px;font-weight:600;color:#0F172A;margin-top:2px">${title}</div>
          <div style="font-size:13px;color:#374151;margin-top:2px;line-height:1.35">${body}</div>
        </div>`;
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
    await sleep(900);
    await pushBanner(page, true);
    await sleep(3600);
    await pushBanner(page, false);
    await sleep(600);
    await scrollTo(520, 1200);  // tomorrow's events
    await sleep(1500);
    await scrollTo(0, 900);
    await sleep(500);
  },
});
