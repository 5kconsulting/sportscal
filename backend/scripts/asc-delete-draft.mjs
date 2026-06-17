import fs from 'node:fs';
import jwt from 'jsonwebtoken';
const KEY_ID='YKJ4Y552ZW', ISSUER_ID='a7e67b43-0618-4f73-b0a0-456afd046384';
const KEY_PATH='/Users/patton/Downloads/AuthKey_YKJ4Y552ZW.p8';
const tok = jwt.sign({}, fs.readFileSync(KEY_PATH,'utf-8'), {
  algorithm:'ES256', expiresIn:'5m', issuer:ISSUER_ID, audience:'appstoreconnect-v1',
  header:{alg:'ES256', kid:KEY_ID, typ:'JWT'}
});
async function api(m, p) {
  const r = await fetch('https://api.appstoreconnect.apple.com' + p, { method: m, headers: { Authorization: 'Bearer ' + tok }});
  return { status: r.status, body: r.status === 204 ? null : await r.text() };
}

// First, also try DELETE on the existing item in the draft (the app version item)
const draftId = 'e5b56962-0ed3-4d65-b30b-fdf47800eb40';
const items = await api('GET', `/v1/reviewSubmissions/${draftId}/items`);
console.log('items list status:', items.status);
const itemId = JSON.parse(items.body).data?.[0]?.id;
if (itemId) {
  const delItem = await api('DELETE', `/v1/reviewSubmissionItems/${itemId}`);
  console.log('DELETE item status:', delItem.status, delItem.body?.substring?.(0, 300) || '');
}

// Then DELETE the draft itself
const delDraft = await api('DELETE', `/v1/reviewSubmissions/${draftId}`);
console.log('DELETE draft status:', delDraft.status, delDraft.body?.substring?.(0, 300) || '');
