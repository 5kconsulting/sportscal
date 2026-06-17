import fs from 'node:fs';
import jwt from 'jsonwebtoken';
const KEY='YKJ4Y552ZW', ISS='a7e67b43-0618-4f73-b0a0-456afd046384', P='/Users/patton/Downloads/AuthKey_YKJ4Y552ZW.p8';
const tok = jwt.sign({}, fs.readFileSync(P,'utf-8'), { algorithm:'ES256', expiresIn:'5m', issuer:ISS, audience:'appstoreconnect-v1', header:{alg:'ES256',kid:KEY,typ:'JWT'} });
const r = await fetch('https://api.appstoreconnect.apple.com/v1/builds?filter[app]=6765724702&sort=-version&limit=5', { headers:{Authorization:'Bearer '+tok} }).then(r=>r.json());
r.data.forEach(b => console.log(`build ${b.attributes.version} state=${b.attributes.processingState} valid=${b.attributes.expired === false} uploaded=${b.attributes.uploadedDate}`));
