import fs from 'node:fs';
import jwt from 'jsonwebtoken';
const tok = jwt.sign({}, fs.readFileSync('/Users/patton/Downloads/AuthKey_YKJ4Y552ZW.p8','utf-8'), { algorithm:'ES256', expiresIn:'5m', issuer:'a7e67b43-0618-4f73-b0a0-456afd046384', audience:'appstoreconnect-v1', header:{alg:'ES256',kid:'YKJ4Y552ZW',typ:'JWT'} });
async function api(m, p, b) {
  const r = await fetch('https://api.appstoreconnect.apple.com'+p, { method:m, headers:{Authorization:'Bearer '+tok, 'Content-Type':'application/json'}, body: b ? JSON.stringify(b) : undefined });
  return { s: r.status, body: r.status === 204 ? null : await r.json().catch(()=>null) };
}
const DRAFT_ID  = 'e5b56962-0ed3-4d65-b30b-fdf47800eb40';
const VERSION_ID = 'eb8f7f4e-52b4-432b-a260-5a3631aaed16';

const add = await api('POST', '/v1/reviewSubmissionItems', {
  data: {
    type: 'reviewSubmissionItems',
    relationships: {
      reviewSubmission: { data: { type: 'reviewSubmissions', id: DRAFT_ID } },
      appStoreVersion:  { data: { type: 'appStoreVersions', id: VERSION_ID } },
    },
  },
});
console.log('Add version item status:', add.s);
console.log(JSON.stringify(add.body, null, 2).substring(0, 600));

// Re-list items
const items = await api('GET', `/v1/reviewSubmissions/${DRAFT_ID}/items`);
console.log('\nDraft items now:', items.body?.data?.length || 0);
items.body?.data?.forEach(i => console.log(`  id=${i.id} state=${i.attributes?.state}`));
