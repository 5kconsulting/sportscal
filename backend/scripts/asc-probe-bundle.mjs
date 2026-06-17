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

const APP_ID  = '6765724702';
const SUB_ID  = '6779286099';
const DRAFT_ID = 'e5b56962-0ed3-4d65-b30b-fdf47800eb40';

console.log('--- (1) Find the appStoreVersion id for the inflight version ---');
let r = await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[appStoreState]=READY_FOR_REVIEW,PREPARE_FOR_SUBMISSION,WAITING_FOR_REVIEW,WAITING_FOR_EXPORT_COMPLIANCE,DEVELOPER_REJECTED,REJECTED,IN_REVIEW`);
console.log('status:', r.status);
const versions = r.body?.data || [];
versions.forEach(v => console.log(`  id=${v.id} versionString=${v.attributes?.versionString} state=${v.attributes?.appStoreState}`));
const versionId = versions[0]?.id;

console.log('\n--- (2) Try subscriptionSubmissions WITH appStoreVersion relationship ---');
r = await api('POST', '/v1/subscriptionSubmissions', {
  data: {
    type: 'subscriptionSubmissions',
    relationships: {
      subscription:    { data: { type: 'subscriptions',    id: SUB_ID } },
      appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } },
    },
  },
});
console.log('status:', r.status, '\n', JSON.stringify(r.body, null, 2).substring(0, 1200));

console.log('\n--- (3) Try subscriptionSubmissions WITH reviewSubmission relationship ---');
r = await api('POST', '/v1/subscriptionSubmissions', {
  data: {
    type: 'subscriptionSubmissions',
    relationships: {
      subscription:     { data: { type: 'subscriptions',     id: SUB_ID } },
      reviewSubmission: { data: { type: 'reviewSubmissions', id: DRAFT_ID } },
    },
  },
});
console.log('status:', r.status, '\n', JSON.stringify(r.body, null, 2).substring(0, 1200));

console.log('\n--- (4) Try legacy POST /v1/appStoreVersionSubmissions for the inflight version ---');
r = await api('POST', '/v1/appStoreVersionSubmissions', {
  data: {
    type: 'appStoreVersionSubmissions',
    relationships: {
      appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } },
    },
  },
});
console.log('status:', r.status, '\n', JSON.stringify(r.body, null, 2).substring(0, 1200));
