// POST /v1/reviewSubmissionItems for each of our two subscriptions, attaching
// them to the active draft review submission. Apple's App Store Connect UI
// doesn't expose the attach control for our account (known bug — see Apple
// Developer Forums thread 813407), so we drive the same operation via the
// public API using the same key we issued to RevenueCat.
//
// Run with:
//   cd backend && node scripts/asc-attach-subs.mjs

import fs from 'node:fs';
import jwt from 'jsonwebtoken';

const KEY_ID    = 'YKJ4Y552ZW';
const ISSUER_ID = 'a7e67b43-0618-4f73-b0a0-456afd046384';
const KEY_PATH  = '/Users/patton/Downloads/AuthKey_YKJ4Y552ZW.p8';
const APP_ID    = '6765724702';

// From the discovery probe — confirmed READY_FOR_REVIEW (draft) state
const DRAFT_SUBMISSION_ID = 'e5b56962-0ed3-4d65-b30b-fdf47800eb40';
const SUBS = [
  { id: '6779286099', name: 'monthly' },
  { id: '6779289293', name: 'annual'  },
];

const privateKey = fs.readFileSync(KEY_PATH, 'utf-8');
const token = jwt.sign({}, privateKey, {
  algorithm: 'ES256',
  expiresIn: '5m',
  issuer:   ISSUER_ID,
  audience: 'appstoreconnect-v1',
  header:   { alg: 'ES256', kid: KEY_ID, typ: 'JWT' },
});

async function api(path, init = {}) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

console.log(`=== Attaching ${SUBS.length} subscription(s) to draft ${DRAFT_SUBMISSION_ID} ===\n`);

for (const sub of SUBS) {
  console.log(`--- ${sub.name} (${sub.id}) ---`);
  const reqBody = {
    data: {
      type: 'reviewSubmissionItems',
      relationships: {
        reviewSubmission: {
          data: { type: 'reviewSubmissions', id: DRAFT_SUBMISSION_ID },
        },
        subscription: {
          data: { type: 'subscriptions', id: sub.id },
        },
      },
    },
  };
  const result = await api('/v1/reviewSubmissionItems', {
    method: 'POST',
    body: JSON.stringify(reqBody),
  });
  console.log('status:', result.status);
  if (result.status >= 200 && result.status < 300) {
    console.log('✓ attached. itemId:', result.body?.data?.id);
  } else {
    console.log('FAILED. body:', JSON.stringify(result.body, null, 2));
  }
  console.log('');
}

// Re-list the draft's items to confirm
console.log('--- Draft submission items (post-attach) ---');
const draftItems = await api(`/v1/reviewSubmissions/${DRAFT_SUBMISSION_ID}/items`);
console.log('status:', draftItems.status);
if (draftItems.body?.data) {
  for (const item of draftItems.body.data) {
    console.log(`  itemId=${item.id} type=${item.type} state=${item.attributes?.state || '(no state)'}`);
  }
  console.log(`  ${draftItems.body.data.length} item(s) on draft`);
} else if (draftItems.body?.errors) {
  console.log('  errors:', JSON.stringify(draftItems.body.errors, null, 2));
}
