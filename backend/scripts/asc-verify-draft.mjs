import fs from 'node:fs';
import jwt from 'jsonwebtoken';
const KEY='YKJ4Y552ZW', ISS='a7e67b43-0618-4f73-b0a0-456afd046384', P='/Users/patton/Downloads/AuthKey_YKJ4Y552ZW.p8';
const tok = jwt.sign({}, fs.readFileSync(P,'utf-8'), { algorithm:'ES256', expiresIn:'5m', issuer:ISS, audience:'appstoreconnect-v1', header:{alg:'ES256',kid:KEY,typ:'JWT'} });
async function g(p) { return (await fetch('https://api.appstoreconnect.apple.com'+p, {headers:{Authorization:'Bearer '+tok}})).json(); }

const items = await g('/v1/reviewSubmissions/e5b56962-0ed3-4d65-b30b-fdf47800eb40/items');
console.log('Draft items:');
items.data.forEach(i => console.log(`  id=${i.id} state=${i.attributes?.state}`));
console.log(`  Total: ${items.data.length}`);

// Get the appStoreVersion + its build
const av = await g('/v1/apps/6765724702/appStoreVersions?include=build&filter[appStoreState]=READY_FOR_REVIEW,PREPARE_FOR_SUBMISSION');
console.log('\nApp Store Version:');
av.data.forEach(v => console.log(`  id=${v.id} state=${v.attributes?.appStoreState} buildRel=${v.relationships?.build?.data?.id || '(none)'}`));
av.included?.forEach(inc => {
  if (inc.type === 'builds') console.log(`  Build: version=${inc.attributes?.version}`);
});
