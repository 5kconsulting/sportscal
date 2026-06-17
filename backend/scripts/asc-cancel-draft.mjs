// Cancel (DELETE) the active draft review submission via the API.
import fs from 'node:fs';
import jwt from 'jsonwebtoken';

const KEY_ID='YKJ4Y552ZW', ISSUER_ID='a7e67b43-0618-4f73-b0a0-456afd046384';
const KEY_PATH='/Users/patton/Downloads/AuthKey_YKJ4Y552ZW.p8';
const APP_ID='6765724702';

const tok = jwt.sign({}, fs.readFileSync(KEY_PATH,'utf-8'), {
  algorithm:'ES256', expiresIn:'5m', issuer:ISSUER_ID, audience:'appstoreconnect-v1',
  header:{alg:'ES256', kid:KEY_ID, typ:'JWT'}
});

async function api(method, path, body) {
  const res = await fetch('https://api.appstoreconnect.apple.com' + path, {
    method, headers: { Authorization:'Bearer '+tok, 'Content-Type':'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json().catch(()=>null) };
}

// Find the active READY_FOR_REVIEW submission
const list = await api('GET', `/v1/reviewSubmissions?filter[app]=${APP_ID}&filter[state]=READY_FOR_REVIEW`);
const draft = list.body?.data?.[0];
if (!draft) {
  console.log('No READY_FOR_REVIEW draft found. Current submissions:');
  console.log(JSON.stringify(list.body?.data?.map(d => ({ id: d.id, state: d.attributes?.state })), null, 2));
  process.exit(0);
}
console.log(`Draft id: ${draft.id}`);

// Cancellation in Apple's API is a PATCH to set canceled=true (per ReviewSubmissionUpdateRequest)
const cancel = await api('PATCH', `/v1/reviewSubmissions/${draft.id}`, {
  data: {
    type: 'reviewSubmissions',
    id: draft.id,
    attributes: { canceled: true },
  },
});
console.log('PATCH status:', cancel.status);
console.log(JSON.stringify(cancel.body, null, 2).substring(0, 800));
