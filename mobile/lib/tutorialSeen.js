// ============================================================
// Tutorial seen-tracking.
//
// Some onboarding tutorial videos should only play the FIRST
// time the user encounters that flow (e.g., Add a driver, Set
// up team carpool). Others play every time (source chips —
// useful because users often forget app-specific URL paths
// between sessions).
//
// We persist the "seen" flag via expo-secure-store because it
// was already bundled for JWTs — no new native module, no rebuild.
// SecureStore is overkill for these flags (they're not sensitive)
// but the alternative is adding async-storage which is its own
// native module. Cost: storage operations are ~5ms instead of
// <1ms. Imperceptible at this volume.
//
// Naming: `tutorial_seen_<key>`, value "1" once seen. We never
// delete the flag — re-onboarding the same user (e.g., after
// sign-out + back in) should NOT re-play tutorials they've
// already watched on this device.
// ============================================================

import * as SecureStore from 'expo-secure-store';

const PREFIX = 'tutorial_seen_';

export async function hasSeenTutorial(key) {
  try {
    const v = await SecureStore.getItemAsync(PREFIX + key);
    return v === '1';
  } catch {
    return false;
  }
}

export async function markTutorialSeen(key) {
  try {
    await SecureStore.setItemAsync(PREFIX + key, '1');
  } catch {
    // Non-fatal — worst case the user sees the tutorial again next time.
  }
}

// Tutorials that fire on EVERY chip tap (sources). The user benefits
// from a refresher each time because the app-specific URL paths are
// easy to forget between visits.
export const REPLAY_TUTORIALS = new Set([
  'teamsnap',
  'gamechanger',
  'playmetrics',
]);

// Tutorials that fire ONCE per device (host-app feature intros).
export const ONCE_TUTORIALS = new Set([
  'add-driver',
  'setup-team',
]);

// Helper for chip handlers: returns true if we should show the tutorial
// now. For sources we always show (provided a video exists); for one-
// shots we check the seen flag.
export async function shouldShowTutorial(key) {
  if (REPLAY_TUTORIALS.has(key)) return true;
  if (ONCE_TUTORIALS.has(key))   return !(await hasSeenTutorial(key));
  return false;
}
