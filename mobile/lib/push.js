// ============================================================
// Push notifications
//
// Flow: useAuth calls registerForPush() on every app launch + after
// login. We:
//   1. Ask iOS for permission (no-op if already granted or denied)
//   2. Fetch the Expo push token for this device
//   3. POST it to /api/push-tokens (which also flips push_enabled=true)
//
// The "Default ON post-permission" design means the iOS permission ask
// IS the opt-in. Backend's push_enabled goes true automatically when a
// token registers, unless the user turned off "Nightly heads-up" in
// Settings (components/NightlyPushRow.jsx), which sets push_opted_out.
//
// On Android, Expo's setNotificationChannelAsync needs to run before
// any push is delivered or the notification falls through silently.
// ============================================================

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api.js';

// expo-notifications + expo-device pull in native modules that are only
// present in dev clients (and production builds) compiled AFTER push
// support landed. Older dev clients on disk (e.g. simulator builds left
// over from before 2026-05-26) crash on import with "Cannot find native
// module 'ExpoPushTokenManager'." Wrap the import so an outdated client
// degrades gracefully — push functions become no-ops instead of taking
// down the whole app. New builds get the real native modules.
let Notifications, Device;
try {
  Notifications = require('expo-notifications');
  Device        = require('expo-device');
} catch (err) {
  console.warn('[push] native modules unavailable, push disabled:', err.message);
}

// Foreground behavior: when the app is in the foreground and a push
// lands, we want it to show as a banner (default iOS behavior) instead
// of being swallowed silently. setNotificationHandler runs once per
// process; doing it at module load is fine. Skipped when the native
// module is missing.
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList:   true,
      shouldPlaySound:  true,
      shouldSetBadge:   false,
    }),
  });
}

let _registered = false; // process-local debounce so re-renders don't spam the backend

// iOS notification permission for the Settings switch: 'granted',
// 'denied', 'undetermined', or 'unavailable' (simulator, or an old client
// without the native module).
export async function getPushPermission() {
  if (!Notifications || !Device || !Device.isDevice) return 'unavailable';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  } catch {
    return 'unavailable';
  }
}

// Returns true once this device's token is registered with the backend.
export async function registerForPush() {
  if (_registered) return true;
  if (!Notifications || !Device) {
    console.log('[push] native modules missing — skipping registration');
    return false;
  }
  // Expo push tokens only mint on real devices — simulators get nothing
  // back, which would otherwise turn into a stuck Promise on iOS.
  if (!Device.isDevice) {
    console.log('[push] skipping registration: not a physical device');
    return false;
  }

  try {
    // Android needs an explicit channel before notifications display.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#0f1629',
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const ask = await Notifications.requestPermissionsAsync();
      status = ask.status;
    }
    if (status !== 'granted') {
      console.log('[push] permission denied — skipping token registration');
      return false;
    }

    // EAS projectId is required when using EAS Build; pulling it from
    // expoConfig lets us avoid hard-coding it here.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;

    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenResponse.data;

    await api.post('/api/push-tokens', {
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });

    _registered = true;
    console.log('[push] registered token');
    return true;
  } catch (err) {
    // Non-fatal: a push registration failure shouldn't break app launch.
    // Common causes: simulator, network blip, permission dialog dismissed.
    console.warn('[push] registration failed:', err.message);
    return false;
  }
}

// Called from useAuth on sign-out so the device stops getting pushes
// targeted at the previous account.
export async function unregisterPushOnLogout() {
  if (!Notifications || !Device) return;
  if (!Device.isDevice) return;
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenResponse.data;
    await api.del(`/api/push-tokens/${encodeURIComponent(token)}`);
    _registered = false;
  } catch (err) {
    console.warn('[push] unregister failed:', err.message);
  }
}

// Subscribe to tap events. Returns the subscription so the caller
// can dispose it on unmount. The handler gets the notification's
// `data` payload (see pushWorker.js — we send { type, date }).
export function subscribeToNotificationTaps(handler) {
  if (!Notifications) return { remove: () => {} };
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response?.notification?.request?.content?.data || {};
    try { handler(data); } catch (e) { console.warn('[push] tap handler threw:', e.message); }
  });
}
