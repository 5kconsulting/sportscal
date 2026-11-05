// Welcome carousel clip: "Ask the team for a ride" (mock — group rides need
// a seeded team, and the iMessage half of the flow happens outside the app).
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { record } from '../lib/recorder.js';

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(here, '..', 'out', 'mock-welcome-ride.html');

const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { box-sizing: border-box; -webkit-font-smoothing: antialiased; margin: 0; }
  body { background: #F5F7FB; font-family: -apple-system, "SF Pro Text", sans-serif; color: #0F172A; height: 100vh; overflow: hidden; }
  /* Hard swap + entrance animation (no cross-fade). Puppeteer's screencast
     only emits frames on repaint, so a fade-out can freeze half-done. */
  .scene { position: absolute; inset: 0; padding: 40px 18px; display: none; }
  .scene.on { display: block; animation: enter 380ms ease both; }
  @keyframes enter { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
  .hero { background: #2563EB; color: #fff; border-radius: 16px; padding: 18px 20px; }
  .pill { display: inline-block; background: rgba(255,255,255,.22); font-size: 11px; font-weight: 700;
          padding: 4px 10px; border-radius: 999px; letter-spacing: .08em; }
  .title { font-size: 23px; font-weight: 800; letter-spacing: -.02em; margin: 8px 0 3px; }
  .meta { font-size: 14px; opacity: .9; }
  .lab { font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: .06em; margin: 20px 0 8px; }
  .slot { background: #fff; border: 1.5px dashed #CBD5E1; border-radius: 12px; padding: 13px 14px; margin-bottom: 8px; font-size: 14px; color: #64748B; }
  .slot.done { border: 1.5px solid #A7F3D0; background: #ECFDF5; color: #065F46; font-weight: 600; display: flex; gap: 10px; align-items: center; }
  .av { width: 30px; height: 30px; border-radius: 50%; background: #2563EB; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; }
  .cta { display: block; width: 100%; margin-top: 14px; background: #D97706; color: #fff; border: 0; border-radius: 12px;
         padding: 15px; font-size: 16px; font-weight: 700; font-family: inherit; }
  .thread { background: #fff; border-radius: 18px; overflow: hidden; box-shadow: 0 12px 32px rgba(15,23,41,.1); }
  .th-head { background: #F6F6F8; text-align: center; padding: 14px; border-bottom: 1px solid #E5E5EA; }
  .th-name { font-size: 15px; font-weight: 600; }
  .th-sub { font-size: 12px; color: #8E8E93; margin-top: 2px; }
  .th-body { padding: 16px 12px 20px; display: flex; flex-direction: column; gap: 6px; min-height: 360px; }
  .b { max-width: 80%; padding: 10px 14px; border-radius: 18px; font-size: 15px; line-height: 1.32; display: none; }
  .b.on { display: block; animation: pop 260ms ease both; }
  @keyframes pop { from { opacity: 0; transform: scale(.9) } to { opacity: 1; transform: none } }
  .me { align-self: flex-end; background: #1C8CFF; color: #fff; border-bottom-right-radius: 5px; }
  .them { align-self: flex-start; background: #E9E9EB; color: #000; border-bottom-left-radius: 5px; }
  .who { font-size: 11px; color: #8E8E93; margin: 4px 0 0 8px; display: none; }
  .who.on { display: block; }
  .typing { align-self: flex-start; background: #E9E9EB; border-radius: 18px; padding: 12px 14px; gap: 4px; display: none; }
  .typing.on { display: flex; }
  .typing i { width: 7px; height: 7px; border-radius: 50%; background: #8E8E93; animation: blink 1s infinite; }
  .typing i:nth-child(2) { animation-delay: .15s } .typing i:nth-child(3) { animation-delay: .3s }
  @keyframes blink { 0%,60%,100% { opacity: .3 } 30% { opacity: 1 } }
</style></head><body>
  <section class="scene on" id="a">
    <div class="hero">
      <span class="pill">⚽ TOMORROW · 4:30 PM</span>
      <div class="title">Bobby — Soccer practice</div>
      <div class="meta">Cook Park · Field 3</div>
    </div>
    <div class="lab">Ride coordination</div>
    <div class="slot">🚗 Drop-off · not assigned</div>
    <div class="slot">🏠 Pick-up · not assigned</div>
    <button class="cta" id="ask">👥 Ask a group</button>
  </section>

  <section class="scene" id="b">
    <div class="thread">
      <div class="th-head"><div class="th-name">Tigers U10 parents</div><div class="th-sub">6 people · iMessage</div></div>
      <div class="th-body">
        <div class="b me" id="m1">Can someone drop off Bobby at Cook Park tomorrow 4:30? First yes wins 👇</div>
        <div class="b me" id="m2">sportscalapp.com/r/k7q2</div>
        <div class="typing" id="typing"><i></i><i></i><i></i></div>
        <div class="b them" id="m3">👍 I've got him!</div>
        <div class="who" id="w3">Mike</div>
      </div>
    </div>
  </section>

  <section class="scene" id="d">
    <div class="hero">
      <span class="pill">⚽ TOMORROW · 4:30 PM</span>
      <div class="title">Bobby — Soccer practice</div>
      <div class="meta">Cook Park · Field 3</div>
    </div>
    <div class="lab">Ride coordination</div>
    <div class="slot done"><div class="av">M</div><div>Mike — Drop-off<br><span style="font-weight:500;font-size:13px">✓ Confirmed</span></div></div>
    <div class="slot">🏠 Pick-up · not assigned</div>
  </section>

<script>
  const $ = (id) => document.getElementById(id);
  const show = (id) => $(id).classList.add('on');
  const scene = (id) => document.querySelectorAll('.scene').forEach(s => s.classList.toggle('on', s.id === id));
  $('ask').addEventListener('click', () => {
    scene('b');
    setTimeout(() => show('m1'), 350);
    setTimeout(() => show('m2'), 900);
    setTimeout(() => show('typing'), 1700);
    setTimeout(() => { $('typing').classList.remove('on'); show('m3'); show('w3'); }, 2600);
    setTimeout(() => scene('d'), 5000);
  });
</script>
</body></html>`;

writeFileSync(htmlPath, html, 'utf8');

await record({
  name: 'welcome-ride',
  startUrl: `file://${htmlPath}`,
  size: '720x1280',
  script: async ({ sleep, tapText }) => {
    await sleep(1400);
    await tapText('Ask a group', { wait: 0 });
    await sleep(5000 + 2200);
  },
});
