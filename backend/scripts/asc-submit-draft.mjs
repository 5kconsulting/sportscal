import fs from 'node:fs';
import jwt from 'jsonwebtoken';
const tok = jwt.sign({}, fs.readFileSync('/Users/patton/Downloads/AuthKey_YKJ4Y552ZW.p8','utf-8'), { algorithm:'ES256', expiresIn:'5m', issuer:'a7e67b43-0618-4f73-b0a0-456afd046384', audience:'appstoreconnect-v1', header:{alg:'ES256',kid:'YKJ4Y552ZW',typ:'JWT'} });
async function api(m, p, b) {
  const r = await fetch('https://api.appstoreconnect.apple.com'+p, { method:m, headers:{Authorization:'Bearer '+tok, 'Content-Type':'application/json'}, body: b ? JSON.stringify(b) : undefined });
  return { s: r.status, body: r.status === 204 ? null : await r.json().catch(()=>null) };
}

const DRAFT_ID = 'e5b56962-0ed3-4d65-b30b-fdf47800eb40';

// PATCH with submitted=true (Apple's ReviewSubmissionUpdateRequest)
const r = await api('PATCH', `/v1/reviewSubmissions/${DRAFT_ID}`, {
  data: { type: 'reviewSubmissions', id: DRAFT_ID, attributes: { submitted: true } },
});
console.log('Submit status:', r.s);
console.log(JSON.stringify(r.body, null, 2).substring(0, 1500));
