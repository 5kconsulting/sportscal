// Intercepts the iOS Share Extension hand-off URL before Expo Router
// runs its normal route-matching pass and tries to render an Unmatched
// Route 404.
//
// What's happening: when a parent shares a URL/photo from another app
// into SportsCal, the share extension persists the payload to App
// Group shared storage and opens the host app via the deep link
//   sportscal://dataUrl=sportscalShareKey
// That URL is just a "wake up, there's something in the inbox" signal
// — the actual payload lives in App Group storage and is read via
// useShareIntentContext() in _layout.jsx. But Expo Router doesn't
// know about that and tries to navigate to the (nonexistent) route,
// hence the 404.
//
// redirectSystemPath gives us a chance to rewrite the path before the
// router uses it. We detect the share-intent URL via the helper from
// expo-share-intent and redirect to '/' so AuthGate + the share
// listener take over.

import { hasShareIntent } from 'expo-share-intent';

export function redirectSystemPath({ path, initial }) {
  try {
    const url = new URL(path);
    if (hasShareIntent(url.searchParams)) {
      // Bounce to root. AuthGate sends signed-in users into (tabs);
      // _layout.jsx's hasShareIntent effect then routes them to /setup
      // with the consumed payload.
      return '/';
    }
  } catch {
    // Malformed URL — fall through to the default behavior so the
    // user at least doesn't see the share-extension URL crash the app.
  }
  return path;
}
