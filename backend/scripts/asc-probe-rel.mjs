// Probe each plausible relationship name on reviewSubmissionItems to find
// the one that accepts subscriptions. We POST with a subscription target
// under each candidate name. A "RELATIONSHIP.INVALID" with a *type* error
// means the name IS valid but the type is wrong; a "RELATIONSHIP.UNKNOWN"
// means the name itself is bogus.
import fs from 'node:fs';
import jwt from 'jsonwebtoken';

const KEY_ID    = 'YKJ4Y552ZW';
const ISSUER_ID = 'a7e67b43-0618-4f73-b0a0-456afd046384';
const KEY_PATH  = '/Users/patton/Downloads/AuthKey_YKJ4Y552ZW.p8';

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

const DRAFT_ID = 'e5b56962-0ed3-4d65-b30b-fdf47800eb40';
const SUB_ID   = '6779286099';

const candidates = [
  'subscription',
  'subscriptionV2',
  'inAppPurchase',
  'inAppPurchaseV2',
  'subscriptionForFirstSubmission',
  'subscriptionGroupSubmittal',
  'subscriptionSubmittal',
  'subscriptionGroup',
  'iap',
  'inAppPurchaseSubmission',
  'subscriptionSubmission',
];

for (const rel of candidates) {
  const r = await api('POST', '/v1/reviewSubmissionItems', {
    data: {
      type: 'reviewSubmissionItems',
      relationships: {
        reviewSubmission: { data: { type: 'reviewSubmissions', id: DRAFT_ID } },
        [rel]: { data: { type: 'subscriptions', id: SUB_ID } },
      },
    },
  });
  const err = r.body?.errors?.[0];
  const code = err?.code || '';
  const detail = (err?.detail || '').substring(0, 100);
  console.log(`${rel.padEnd(38)} → ${r.status} ${code} | ${detail}`);
}
