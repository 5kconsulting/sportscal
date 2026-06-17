import fs from 'node:fs';
import jwt from 'jsonwebtoken';
const tok = jwt.sign({}, fs.readFileSync('/Users/patton/Downloads/AuthKey_YKJ4Y552ZW.p8','utf-8'), { algorithm:'ES256', expiresIn:'5m', issuer:'a7e67b43-0618-4f73-b0a0-456afd046384', audience:'appstoreconnect-v1', header:{alg:'ES256',kid:'YKJ4Y552ZW',typ:'JWT'} });
async function api(m, p, b) {
  const r = await fetch('https://api.appstoreconnect.apple.com'+p, { method:m, headers:{Authorization:'Bearer '+tok, 'Content-Type':'application/json'}, body: b ? JSON.stringify(b) : undefined });
  return { s: r.status, body: r.status === 204 ? null : await r.json().catch(()=>null) };
}
const VERSION_ID = 'eb8f7f4e-52b4-432b-a260-5a3631aaed16';

// Find Build 18 id
const builds = await api('GET', '/v1/builds?filter[app]=6765724702&sort=-version&limit=3');
const b18 = builds.body?.data?.find(b => b.attributes?.version === '18');
console.log('Build 18 id:', b18?.id);

// PATCH the appStoreVersion's build relationship to point at Build 18
const patch = await api('PATCH', `/v1/appStoreVersions/${VERSION_ID}/relationships/build`, {
  data: { type: 'builds', id: b18.id },
});
console.log('PATCH build relationship status:', patch.s);
if (patch.body) console.log(JSON.stringify(patch.body, null, 2));
