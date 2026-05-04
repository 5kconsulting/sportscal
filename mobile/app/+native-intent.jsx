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

export function redirectSystemPath({ path, initial }) {
  // The share extension wakes the host app via a URL of the shape
  //   sportscal://dataUrl=sportscalShareKey
  // depending on iOS version + library version that marker can land in
  // the URL host, path, or query — URL.searchParams parsing misses some
  // of those cases. A substring check catches them all and is simpler
  // anyway.
  //
  // The actual share payload lives in App Group shared storage; this URL
  // is just a wake signal. Bouncing to '/' lets AuthGate take signed-in
  // users into (tabs) and the useShareIntentContext effect in
  // _layout.jsx routes them on to /setup with the consumed payload.
  if (typeof path === 'string' && (path.includes('dataUrl=') || path.includes('ShareIntent'))) {
    return '/';
  }
  return path;
}
