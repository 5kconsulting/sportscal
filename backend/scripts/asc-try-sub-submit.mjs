// Try various plausible endpoints for submitting a subscription to App Review.
import fs from 'node:fs';
import jwt from 'jsonwebtoken';

const KEY_ID    = 'YKJ4Y552ZW';
const ISSUER_ID = 'a7e67b43-0618-4f73-b0a0-456afd046384';
const KEY_PATH  = '/Users/patton/Downloads/AuthKey_YKJ4Y552ZW.p8';

const privateKey = fs.readFileSync(KEY_PATH, 'utf-8');
const token = jwt.sign({}, privateKey, {
  algorithm: 'ES256',
  expiresIn: '5m',
  issuer:   ISSUER_ID,
  audience: 'appstoreconnect-v1',
  header:   { alg: 'ES256', kid: KEY_ID, typ: 'JWT' },
});

async function api(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let parsed;
  try { parsed = await res.json(); } catch { parsed = null; }
  return { status: res.status, body: parsed };
}

const MONTHLY_SUB_ID = '6779286099';

console.log('--- (1) GET /v1/subscriptions/<id> to see what relationships exist on the sub ---');
let r = await api('GET', `/v1/subscriptions/${MONTHLY_SUB_ID}?include=appStoreReviewScreenshot,prices,subscriptionLocalizations`);
console.log('status:', r.status);
if (r.status >= 400) console.log(JSON.stringify(r.body?.errors, null, 2));
else console.log('relationships:', Object.keys(r.body?.data?.relationships || {}));

console.log('\n--- (2) Try POST /v1/subscriptionSubmissions ---');
r = await api('POST', '/v1/subscriptionSubmissions', {
  data: {
    type: 'subscriptionSubmissions',
    relationships: {
      subscription: { data: { type: 'subscriptions', id: MONTHLY_SUB_ID } },
    },
  },
});
console.log('status:', r.status);
console.log(JSON.stringify(r.body, null, 2));

console.log('\n--- (3) Try POST /v1/inAppPurchaseV2Submissions ---');
r = await api('POST', '/v1/inAppPurchaseV2Submissions', {
  data: {
    type: 'inAppPurchaseV2Submissions',
    relationships: {
      inAppPurchaseV2: { data: { type: 'inAppPurchases', id: MONTHLY_SUB_ID } },
    },
  },
});
console.log('status:', r.status);
console.log(JSON.stringify(r.body, null, 2));

console.log('\n--- (4) Try POST /v1/reviewSubmissionItems with subscriptionGroupSubmittal ---');
r = await api('POST', '/v1/reviewSubmissionItems', {
  data: {
    type: 'reviewSubmissionItems',
    relationships: {
      reviewSubmission: { data: { type: 'reviewSubmissions', id: 'e5b56962-0ed3-4d65-b30b-fdf47800eb40' } },
      appStoreVersion:  { data: { type: 'subscriptions',     id: MONTHLY_SUB_ID } },
    },
  },
});
console.log('status:', r.status);
console.log(JSON.stringify(r.body, null, 2));
