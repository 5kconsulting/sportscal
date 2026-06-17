import fs from 'node:fs';
import jwt from 'jsonwebtoken';
const tok = jwt.sign({}, fs.readFileSync('/Users/patton/Downloads/AuthKey_YKJ4Y552ZW.p8','utf-8'), { algorithm:'ES256', expiresIn:'5m', issuer:'a7e67b43-0618-4f73-b0a0-456afd046384', audience:'appstoreconnect-v1', header:{alg:'ES256',kid:'YKJ4Y552ZW',typ:'JWT'} });
async function g(p) { return (await fetch('https://api.appstoreconnect.apple.com'+p, {headers:{Authorization:'Bearer '+tok}})).json(); }

const items = await g('/v1/reviewSubmissions/e5b56962-0ed3-4d65-b30b-fdf47800eb40/items');
console.log('Submission items:', items.data.length);
items.data.forEach(i => console.log(`  id=${i.id} state=${i.attributes?.state}`));

const subs = await g('/v1/subscriptionGroups/22150780/subscriptions');
console.log('\nSubscription states:');
subs.data.forEach(s => console.log(`  ${s.attributes?.productId}: ${s.attributes?.state}`));

const av = await g('/v1/appStoreVersions/eb8f7f4e-52b4-432b-a260-5a3631aaed16?include=build');
console.log('\nApp Store Version state:', av.data.attributes?.appStoreState);
const buildInc = av.included?.find(x => x.type === 'builds');
console.log('Bound build:', buildInc?.attributes?.version);
