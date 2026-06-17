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

async function api(path) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json() };
}

const draftId = 'e5b56962-0ed3-4d65-b30b-fdf47800eb40';
console.log('--- Default list (no include) ---');
const r = await api(`/v1/reviewSubmissions/${draftId}/items`);
console.log(JSON.stringify(r.body, null, 2));

console.log('\n--- All-fields list ---');
const r2 = await api(`/v1/reviewSubmissions/${draftId}/items?fields[reviewSubmissionItems]=state,appStoreVersion,appCustomProductPageVersion,appEvent`);
console.log(JSON.stringify(r2.body, null, 2));
