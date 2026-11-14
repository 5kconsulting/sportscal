// ============================================================
// First-run update check.
//
// expo-updates normally downloads a new over-the-air update in the
// background and applies it on the NEXT launch. For someone who just
// installed the app that means their whole first session — the one that
// decides whether they ever add a calendar — runs whatever was baked
// into the App Store build, however old.
//
// So on a brand-new install only (never signed in on this device), we
// wait a few seconds for the latest update before showing the first
// screen, and restart into it if one arrived. Everyone else keeps the
// normal instant launch.
// ============================================================

import * as SecureStore from 'expo-secure-store';

const CHECKED_KEY = 'sc_first_run_update_checked';

let Updates = null;
try { Updates = require('expo-updates'); } catch { /* older dev clients */ }

/**
 * Resolves when the app should carry on rendering. If a newer update was
 * downloaded in time, the app restarts into it instead and this never
 * resolves in the old bundle.
 */
export async function loadLatestBeforeFirstRun(timeoutMs = 5000) {
  if (__DEV__ || !Updates?.isEnabled) return;
  try {
    // Once per install: the restarted app must not check (and wait) again.
    if (await SecureStore.getItemAsync(CHECKED_KEY)) return;
    await SecureStore.setItemAsync(CHECKED_KEY, '1');

    const fetched = (async () => {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) return false;
      const result = await Updates.fetchUpdateAsync();
      return !!result.isNew;
    })().catch(() => false);
    const timedOut = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs));

    // If the download loses the race it still finishes in the background
    // and applies on the next launch, as it always has.
    if (await Promise.race([fetched, timedOut])) await Updates.reloadAsync();
  } catch {
    // Never let an update check stand between a new parent and the app.
  }
}
