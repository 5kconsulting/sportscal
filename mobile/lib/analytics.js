// Mobile analytics + ATT helper.
//
// Three things wired here:
//   1. requestTrackingPermission() — shows iOS App Tracking Transparency
//      once per process. Caches the result. If the user grants tracking,
//      we explicitly enable Meta's advertiser-ID collection (otherwise
//      it stays dormant per the plugin defaults). Firebase Analytics
//      works independently of ATT — it doesn't use IDFA by default.
//   2. trackSignUp / trackLogin — log standard auth events to Firebase
//      Analytics and (where applicable) Meta. Wrapped in try/catch so
//      a transient SDK error never breaks the actual auth flow.
//   3. Defensive imports of the native SDK modules — wrapped so the JS
//      boots even if a dev client wasn't built with the latest config.

let _attResult = null;
let _meta = null;
let _fbAnalytics = null;
let _att = null;

function loadModules() {
  if (_meta === null) {
    try { _meta = require('react-native-fbsdk-next'); }
    catch { _meta = false; }
  }
  if (_fbAnalytics === null) {
    try { _fbAnalytics = require('@react-native-firebase/analytics').default; }
    catch { _fbAnalytics = false; }
  }
  if (_att === null) {
    try { _att = require('expo-tracking-transparency'); }
    catch { _att = false; }
  }
}

export async function requestTrackingPermission() {
  if (_attResult) return _attResult;
  loadModules();
  if (!_att) return 'unknown';

  try {
    const { status } = await _att.requestTrackingPermissionsAsync();
    _attResult = status;
    // Only when explicitly granted: enable Meta's IDFA collection +
    // initialize the SDK. The plugin config sets these to false at
    // boot — flipping them on here is what gives Meta useful data.
    if (status === 'granted' && _meta) {
      try {
        _meta.Settings.setAdvertiserTrackingEnabled(true);
        _meta.Settings.initializeSDK();
      } catch (err) {
        console.warn('[analytics] Meta SDK init failed:', err.message);
      }
    }
    return status;
  } catch (err) {
    console.warn('[analytics] ATT request failed:', err.message);
    return 'unknown';
  }
}

export async function trackSignUp(method = 'email') {
  loadModules();
  if (_fbAnalytics) {
    try { await _fbAnalytics().logSignUp({ method }); }
    catch (err) { console.warn('[analytics] firebase sign_up:', err.message); }
  }
  if (_meta) {
    try { _meta.AppEventsLogger.logEvent('CompleteRegistration', { signup_method: method }); }
    catch (err) { console.warn('[analytics] meta sign_up:', err.message); }
  }
}

export async function trackLogin(method = 'email') {
  loadModules();
  if (_fbAnalytics) {
    try { await _fbAnalytics().logLogin({ method }); }
    catch (err) { console.warn('[analytics] firebase login:', err.message); }
  }
}
