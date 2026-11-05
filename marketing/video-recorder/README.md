# Video recorder

Records phone-sized (9:16) walkthrough videos by driving the real SportsCal web
app (or a local mock page) with Puppeteer and screen-recording the session.
Every frame is the real product, not an animation.

## Setup

```bash
cd marketing/video-recorder
npm install          # needs ffmpeg on PATH (brew install ffmpeg)
```

## Getting a token

Real-app clips need a signed-in session. Sign in as the demo account at
sportscalapp.com → DevTools → Application → Local Storage → copy `sc_token`.
Tokens last 30 days. If a run fails with "Not signed in", the token expired.

## Recording

```bash
SC_TOKEN=eyJ... node videos/welcome-meet.js   # real-app clip
node videos/welcome-ride.js                   # mock clip, no token needed
```

Output lands in `out/` (gitignored). The welcome carousel clips are recorded at
720×1280 and copied into `mobile/assets/tutorials/welcome-*.mp4`.

## Writing a clip

Each file in `videos/` calls `record({ name, token, startUrl, size, caption, script })`.
The script gets helpers: `tapText(text)` (tap ripple + click), `ripple(x, y)`,
`scrollTo(y)`, `scrollToText(selector, regex)`, `goto(path)`, `caption(text)`,
`sleep(ms)`, and the raw Puppeteer `page`.

Rules that keep runs safe against the demo account:
- Don't let a form submit reach the server. Stub the request inside the
  recording browser with `page.setRequestInterception` (see
  `welcome-coparent.js`), or stop at a tap ripple without clicking (see
  `welcome-calendar.js`).
- The web app scrolls inside `main.main-content`, not the window. Use
  `scrollTo`/`scrollToText`, which handle that. A scroll the page ignores
  produces no repaints, and a clip with no repaints records as an empty file.
- Mock pages: hide inactive scenes with `display: none`, not a fade. The
  screencast only captures repaints, so a fade-out can freeze half-finished.
