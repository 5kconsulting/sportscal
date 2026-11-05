// Welcome carousel clip: "Bring in your co-parent" (real app).
// The invite POST is answered inside the recording browser, so no invite row
// is created and no email goes out. The members refetch that follows gets the
// real household plus the would-be pending invite, which is what the user sees.
// Run: SC_TOKEN=... node videos/welcome-coparent.js
import { record } from '../lib/recorder.js';

const EMAIL = 'theresa@example.com';

await record({
  name: 'welcome-coparent',
  token: process.env.SC_TOKEN,
  startUrl: 'https://www.sportscalapp.com/settings',
  size: '720x1280',
  script: async ({ page, sleep, tapText, scrollToText }) => {
    const real = await page.evaluate(async () => {
      const res = await fetch('/api/household/members', {
        headers: { Authorization: `Bearer ${localStorage.getItem('sc_token')}` },
      });
      return res.json();
    });
    const afterInvite = {
      ...real,
      pending_invites: [
        ...(real.pending_invites || []),
        { token: 'demo', invited_email: EMAIL, expires_at: new Date(Date.now() + 7 * 864e5).toISOString() },
      ],
    };

    let invited = false;
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (req.method() === 'POST' && url.endsWith('/api/household/invites')) {
        invited = true;
        return req.respond({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      }
      if (invited && req.method() === 'GET' && url.endsWith('/api/household/members')) {
        return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(afterInvite) });
      }
      return req.continue();
    });

    await sleep(700);
    await scrollToText('h2', '^household$', { ms: 1300, offset: -40 });
    await sleep(600);

    const input = 'input[type="email"][placeholder*="o-parent"]';
    await page.click(input);
    await page.type(input, EMAIL, { delay: 55 });
    await sleep(500);

    await tapText('Send invite', { wait: 2600 });
    if (!invited) throw new Error('Invite request was never sent — check the form selector.');
  },
});
