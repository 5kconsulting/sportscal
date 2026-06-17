// Read-only App Store Connect API probe.
// Generates a JWT signed with our App Store Connect API key (.p8), then
// lists review submissions, subscriptions, and the active draft items
// for SportsCal. Use this to confirm our auth works AND to find the
// draft-submission ID we want to attach IAPs to. Once verified, the
// companion asc-attach-subs.mjs script will POST reviewSubmissionItems.
//
// Run with:
//   cd backend && node scripts/asc-discover.mjs

import fs from 'node:fs';
import jwt from 'jsonwebtoken';

const KEY_ID    = 'YKJ4Y552ZW';
const ISSUER_ID = 'a7e67b43-0618-4f73-b0a0-456afd046384';
const KEY_PATH  = '/Users/patton/Downloads/AuthKey_YKJ4Y552ZW.p8';
const APP_ID    = '6765724702';

const privateKey = fs.readFileSync(KEY_PATH, 'utf-8');

const now = Math.floor(Date.now() / 1000);
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
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

console.log('=== App Store Connect API probe ===\n');

console.log('--- App info ---');
const app = await api(`/v1/apps/${APP_ID}`);
console.log('status:', app.status);
console.log('name:', app.body?.data?.attributes?.name);
console.log('bundleId:', app.body?.data?.attributes?.bundleId);

console.log('\n--- Review submissions (all states) ---');
const subs = await api(`/v1/reviewSubmissions?filter[app]=${APP_ID}&include=items&limit=10`);
console.log('status:', subs.status);
if (subs.body?.data) {
  for (const s of subs.body.data) {
    console.log(`  id=${s.id} state=${s.attributes?.state} platform=${s.attributes?.platform} submittedDate=${s.attributes?.submittedDate || '(draft)'}`);
  }
  console.log(`  ${subs.body.data.length} submission(s)`);
}
if (subs.body?.errors) console.log('  errors:', JSON.stringify(subs.body.errors, null, 2));

console.log('\n--- Subscriptions (for our subscription group) ---');
// We know the group ID is 22150780
const subsList = await api(`/v1/subscriptionGroups/22150780/subscriptions?limit=10`);
console.log('status:', subsList.status);
if (subsList.body?.data) {
  for (const s of subsList.body.data) {
    console.log(`  id=${s.id} productId=${s.attributes?.productId} state=${s.attributes?.state} familySharable=${s.attributes?.familySharable}`);
  }
}
if (subsList.body?.errors) console.log('  errors:', JSON.stringify(subsList.body.errors, null, 2));
