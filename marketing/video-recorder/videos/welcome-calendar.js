// Welcome carousel clip: "Add your team's calendar" (real app).
// Fills the Add-calendar form but never submits, so nothing is created.
// Run: SC_TOKEN=... node videos/welcome-calendar.js
import { record } from '../lib/recorder.js';

const URL = 'webcal://ical.teamsnap.com/team_schedule/a8f2c3d1.ics';

await record({
  name: 'welcome-calendar',
  token: process.env.SC_TOKEN,
  startUrl: 'https://www.sportscalapp.com/sources',
  size: '720x1280',
  // The free-plan upgrade card shows a price; keep it out of the clip,
  // which plays in the iOS app and in email.
  beforeRecord: (page) => page.evaluate(() => {
    const label = Array.from(document.querySelectorAll('div'))
      .find(d => d.children.length === 0 && /Upgrade to Premium/.test(d.textContent || ''));
    const card = label?.parentElement?.parentElement;
    if (card) card.style.display = 'none';
  }),
  script: async ({ page, sleep, tapText, ripple, scrollToText }) => {
    await sleep(900);
    await tapText('+ Add calendar', { wait: 700 });
    await scrollToText('h3', '^Add a calendar$', { ms: 700, offset: -24 });
    await sleep(400);

    const url = 'input[placeholder^="https://"]';
    await page.click(url);
    await page.type(url, URL, { delay: 22 });
    await sleep(600);

    // Assign the first kid chip, if the form shows any.
    try { await tapText('bobby', { wait: 700 }); } catch {}

    // Tap animation on the save button only — no click, no new source.
    // Measure after the smooth scroll settles, or the ripple lands off-target.
    const findSubmit = () => Array.from(document.querySelectorAll('button[type="submit"]'))
      .find(x => /add calendar/i.test(x.textContent || ''));
    await page.evaluate(`(${findSubmit})()?.scrollIntoView({ block: 'center', behavior: 'smooth' })`);
    await sleep(700);
    const box = await page.evaluate(`(() => {
      const b = (${findSubmit})();
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (box) await ripple(box.x, box.y);
    await sleep(1500);
  },
});
