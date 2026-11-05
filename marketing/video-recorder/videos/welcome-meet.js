// Welcome carousel clip: "Every kid. Every game. One calendar." (real app)
// Run: SC_TOKEN=... node videos/welcome-meet.js
import { record } from '../lib/recorder.js';

await record({
  name: 'welcome-meet',
  token: process.env.SC_TOKEN,
  size: '720x1280',
  script: async ({ sleep, scrollTo }) => {
    await sleep(1200);
    await scrollTo(320, 1200);   // kid filters + conflict banner
    await sleep(1800);
    await scrollTo(760, 1200);   // event stack
    await sleep(1600);
    await scrollTo(0, 1000);
    await sleep(700);
  },
});
