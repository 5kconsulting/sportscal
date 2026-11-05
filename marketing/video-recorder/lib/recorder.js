// Records a scripted Puppeteer session at a phone viewport and writes an mp4.
//
//   record({ name, token?, startUrl?, caption?, size?, script })
//
// - Viewport is 360x640 CSS at DPR 3 (1080x1920 native, 9:16).
// - `token` is injected as localStorage.sc_token before any app JS runs, so
//   the first frame is already signed in. Omit it for local mock pages.
// - `caption: true` adds the dark narration bar used by the /how videos.
//   Carousel clips leave it off; the slide's own title does the narrating.
// - `size` is the output frame size, e.g. '720x1280' for bundled app assets.
import puppeteer from 'puppeteer';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'out');

async function injectOverlays(page, withCaption) {
  await page.evaluate((withCaption) => {
    window.__scroller = () => {
      const main = document.querySelector('main.main-content');
      return main && main.scrollHeight > main.clientHeight + 5 ? main : document.scrollingElement;
    };
    if (!document.getElementById('__ripple_css')) {
      const style = document.createElement('style');
      style.id = '__ripple_css';
      style.textContent = `
        .__ripple { position: fixed; width: 44px; height: 44px; margin: -22px 0 0 -22px;
          border-radius: 50%; background: rgba(217,119,6,.45); border: 2px solid rgba(217,119,6,.9);
          pointer-events: none; z-index: 2147483646; animation: __rip 520ms ease-out forwards; }
        @keyframes __rip { from { transform: scale(.5); opacity: 1 } to { transform: scale(1.7); opacity: 0 } }`;
      document.head.appendChild(style);
    }
    if (withCaption && !document.getElementById('__cap')) {
      const bar = document.createElement('div');
      bar.id = '__cap';
      Object.assign(bar.style, {
        position: 'fixed', bottom: '0', left: '0', right: '0',
        background: 'rgba(15,23,41,0.94)', color: '#fff', padding: '20px 24px',
        fontSize: '20px', fontWeight: '600', textAlign: 'center', lineHeight: '1.3',
        fontFamily: 'DM Sans, -apple-system, sans-serif', borderTop: '4px solid #D97706',
        zIndex: '2147483647', opacity: '0', transition: 'opacity 200ms ease', pointerEvents: 'none',
      });
      document.body.appendChild(bar);
    }
  }, withCaption);
}

function makeHelpers(page, withCaption) {
  async function caption(text) {
    if (!withCaption) return;
    await page.evaluate((t) => {
      const bar = document.getElementById('__cap');
      if (!bar) return;
      bar.style.opacity = '0';
      setTimeout(() => { bar.textContent = t; bar.style.opacity = '1'; }, 200);
    }, text);
    await sleep(320);
  }

  async function ripple(x, y) {
    await page.evaluate((x, y) => {
      const d = document.createElement('div');
      d.className = '__ripple';
      d.style.left = x + 'px';
      d.style.top = y + 'px';
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 600);
    }, x, y);
  }

  // Finds a clickable element by visible text, shows a tap ripple on it, clicks.
  async function tapText(needle, { wait = 600 } = {}) {
    const box = await page.evaluate((n) => {
      const els = Array.from(document.querySelectorAll('a, button, [role="button"], [role="link"], [role="tab"]'));
      const el = els.find(e => (e.innerText || e.textContent || '').trim().toLowerCase().includes(n.toLowerCase()));
      if (!el) return null;
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, needle);
    if (!box) throw new Error(`tapText: nothing matches "${needle}"`);
    await ripple(box.x, box.y);
    await sleep(180);
    await page.mouse.click(box.x, box.y);
    await sleep(wait);
  }

  // The web app scrolls inside <main class="main-content">, not the window.
  // Both scroll helpers use window.__scroller(), defined in injectOverlays.
  async function scrollTo(y, ms = 1200) {
    await page.evaluate((targetY, duration) => new Promise((done) => {
      const s = window.__scroller();
      const startY = s.scrollTop, dy = targetY - startY, start = performance.now();
      (function tick(now) {
        const t = Math.min(1, (now - start) / duration);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        s.scrollTop = startY + dy * e;
        if (t < 1) requestAnimationFrame(tick); else done();
      })(performance.now());
    }), y, ms);
  }

  async function scrollToText(selector, pattern, { ms = 1200, offset = -120 } = {}) {
    const y = await page.evaluate((sel, pat) => {
      const re = new RegExp(pat, 'i');
      const el = Array.from(document.querySelectorAll(sel)).find(e => re.test(e.textContent || ''));
      if (!el) return null;
      const s = window.__scroller();
      const top = s === document.scrollingElement ? 0 : s.getBoundingClientRect().top;
      return el.getBoundingClientRect().top - top + s.scrollTop;
    }, selector, pattern);
    if (y == null) throw new Error(`scrollToText: no ${selector} matching /${pattern}/`);
    await scrollTo(Math.max(0, y + offset), ms);
  }

  async function goto(path) {
    const url = /^(https?|file):/.test(path) ? path : `https://www.sportscalapp.com${path}`;
    await page.goto(url, { waitUntil: 'networkidle2' });
    await injectOverlays(page, withCaption);
  }

  return { page, sleep, caption, ripple, tapText, scrollTo, scrollToText, goto };
}

export async function record({ name, token, startUrl, caption = false, size = '1080x1920', script }) {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    headless: 'shell',
    defaultViewport: { width: 360, height: 640, deviceScaleFactor: 3 },
    args: ['--no-sandbox', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  if (token) {
    await page.evaluateOnNewDocument((t) => { localStorage.setItem('sc_token', t); }, token);
  }

  await page.goto(startUrl || 'https://www.sportscalapp.com/dashboard', { waitUntil: 'networkidle2' });
  // An expired token silently lands on the marketing site instead of the app.
  if (token && !/sportscalapp\.com\/(dashboard|kids|sources|settings|setup|contacts)/.test(page.url())) {
    await browser.close();
    throw new Error(`Not signed in (landed on ${page.url()}) — the token is probably expired.`);
  }
  await injectOverlays(page, caption);
  await sleep(500);

  const webm = join(OUT_DIR, `${name}.webm`);
  const mp4 = join(OUT_DIR, `${name}.mp4`);
  const recorder = await page.screencast({ path: webm });
  try {
    await script(makeHelpers(page, caption));
  } finally {
    await recorder.stop();
    await browser.close();
  }

  const [w, h] = size.split('x');
  await execFileP('ffmpeg', [
    '-y', '-i', webm,
    '-vf', `scale=${w}:${h}:flags=lanczos`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '23',
    '-an', '-movflags', '+faststart', mp4,
  ]);
  console.log(`[rec] ${name} → ${mp4}`);
  return mp4;
}
