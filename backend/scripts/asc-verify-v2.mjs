import fs from 'node:fs';
import jwt from 'jsonwebtoken';
const tok = jwt.sign({}, fs.readFileSync('/Users/patton/Downloads/AuthKey_YKJ4Y552ZW.p8','utf-8'), { algorithm:'ES256', expiresIn:'5m', issuer:'a7e67b43-0618-4f73-b0a0-456afd046384', audience:'appstoreconnect-v1', header:{alg:'ES256',kid:'YKJ4Y552ZW',typ:'JWT'} });
async function g(p) { const r=await fetch('https://api.appstoreconnect.apple.com'+p, {headers:{Authorization:'Bearer '+tok}}); return { s:r.status, b: await r.json().catch(()=>null) }; }

// All app store versions (no filter)
const av = await g('/v1/apps/6765724702/appStoreVersions?include=build&limit=5');
console.log('App Store Versions (recent 5):');
av.b?.data?.forEach(v => console.log(`  id=${v.id} versionString=${v.attributes?.versionString} state=${v.attributes?.appStoreState} buildId=${v.relationships?.build?.data?.id || '(none)'}`));
av.b?.included?.forEach(inc => {
  if (inc.type === 'builds') console.log(`  Build (included): id=${inc.id} version=${inc.attributes?.version}`);
});

// Look at all reviewSubmissions including DRAFT/COMPLETE
console.log('\nAll review submissions for app:');
const subs = await g('/v1/reviewSubmissions?filter[app]=6765724702&limit=10');
subs.b?.data?.forEach(s => console.log(`  id=${s.id} state=${s.attributes?.state}`));

// Per-submission items
console.log('\nItems per submission:');
for (const s of (subs.b?.data || [])) {
  const items = await g(`/v1/reviewSubmissions/${s.id}/items`);
  console.log(`  ${s.id} (${s.attributes?.state}): ${items.b?.data?.length || 0} items`);
}
