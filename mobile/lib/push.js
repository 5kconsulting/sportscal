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
// IS the opt-in — no separate in-app toggle. Backend's push_enabled
// goes true automatically when a token registers, false only if the
// user explicitly toggles it off in a future settings screen.
//
// On Android, Expo's setNotificationChannelAsync needs to run before
// any push is delivered or the notification falls through silently.
// ============================================================

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api.js';

// Foreground behavior: when the app is in the foreground and a push
// lands, we want it to show as a banner (default iOS behavior) instead
// of being swallowed silently. setNotificationHandler runs once per
// process; doing it at module load is fine.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList:   true,
    shouldPlaySound:  true,
    shouldSetBadge:   false,
  }),
});

let _registered = false; // process-local debounce so re-renders don't spam the backend

export async function registerForPush() {
  if (_registered) return;
  // Expo push tokens only mint on real devices — simulators get nothing
  // back, which would otherwise turn into a stuck Promise on iOS.
  if (!Device.isDevice) {
    console.log('[push] skipping registration: not a physical device');
    return;
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
      return;
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
  } catch (err) {
    // Non-fatal: a push registration failure shouldn't break app launch.
    // Common causes: simulator, network blip, permission dialog dismissed.
    console.warn('[push] registration failed:', err.message);
  }
}

// Called from useAuth on sign-out so the device stops getting pushes
// targeted at the previous account.
export async function unregisterPushOnLogout() {
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
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response?.notification?.request?.content?.data || {};
    try { handler(data); } catch (e) { console.warn('[push] tap handler threw:', e.message); }
  });
}
