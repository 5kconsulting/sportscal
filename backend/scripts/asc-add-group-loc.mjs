// Add a subscription group localization (en-US) for SportsCal Premium.
// Apple's API errors said this was missing — without it, no subscription
// in the group is submittable. The localization holds the display name
// users see when managing their subscription under Settings -> Apple ID.
import fs from 'node:fs';
import jwt from 'jsonwebtoken';

const KEY_ID    = 'YKJ4Y552ZW';
const ISSUER_ID = 'a7e67b43-0618-4f73-b0a0-456afd046384';
const KEY_PATH  = '/Users/patton/Downloads/AuthKey_YKJ4Y552ZW.p8';
const GROUP_ID  = '22150780';

const privateKey = fs.readFileSync(KEY_PATH, 'utf-8');
const token = jwt.sign({}, privateKey, {
  algorithm: 'ES256', expiresIn: '5m', issuer: ISSUER_ID, audience: 'appstoreconnect-v1',
  header: { alg: 'ES256', kid: KEY_ID, typ: 'JWT' },
});

async function api(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const r = await api('POST', '/v1/subscriptionGroupLocalizations', {
  data: {
    type: 'subscriptionGroupLocalizations',
    attributes: {
      name:   'SportsCal Premium',
      locale: 'en-US',
    },
    relationships: {
      subscriptionGroup: {
        data: { type: 'subscriptionGroups', id: GROUP_ID },
      },
    },
  },
});
console.log('status:', r.status);
console.log(JSON.stringify(r.body, null, 2));
