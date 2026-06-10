// RevenueCat in-app purchase integration.
//
// Why RevenueCat over raw StoreKit: hosted receipt verification,
// server-to-server notifications, restore purchases, refund handling,
// family sharing, and a backend webhook out of the box — saves us 2-3
// days of edge-case work for a 1% take rate above $2.5K MRR (free below).
//
// What this module exposes:
//   • configureIap()      — call once at app launch with the user's id
//   • getOfferings()      — list available subscription packages for the
//                           Upgrade screen
//   • purchasePackage(pkg) — kick off the StoreKit purchase flow
//   • restorePurchases()  — Apple-required button on Upgrade screen
//   • isPremiumEntitled() — single source of truth for "is this device's
//                           current user a premium subscriber?"
//   • addCustomerInfoListener(fn) — subscribe to changes (entitlement
//                                    gained/lost, renewal, expiry)
//
// Defensive imports so a dev client without the native module can still
// boot — older binaries (e.g. on disk from before today) crash on import
// otherwise. The functions become no-ops when the module is missing.

import { Platform } from 'react-native';

// Public API keys per platform — set these in app.json's extra block, or
// hard-code (no risk; these keys are designed to be embedded in clients).
// Replace with the real keys from app.revenuecat.com → Project Settings →
// API Keys → Public App-Specific API Keys.
const RC_IOS_KEY     = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY     || '__REPLACE_WITH_RC_IOS_KEY__';
const RC_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || '__REPLACE_WITH_RC_ANDROID_KEY__';

// RevenueCat entitlement identifier (configured in their dashboard).
// We use "premium" everywhere as the single name.
export const PREMIUM_ENTITLEMENT = 'premium';

let _Purchases = null;
let _configured = false;
const _listeners = new Set();

function loadModule() {
  if (_Purchases !== null) return;
  try {
    _Purchases = require('react-native-purchases').default;
  } catch (err) {
    console.warn('[iap] react-native-purchases unavailable — skipping:', err.message);
    _Purchases = false;
  }
}

// Call once after auth resolves. Passing the user id lets RevenueCat
// stitch the same user across devices and merge any Stripe-side
// purchases the user already made on the web (when RC's Stripe import
// is enabled). Idempotent.
export async function configureIap(userId) {
  loadModule();
  if (!_Purchases) return;
  try {
    if (!_configured) {
      const apiKey = Platform.OS === 'ios' ? RC_IOS_KEY : RC_ANDROID_KEY;
      _Purchases.configure({ apiKey, appUserID: userId || null });
      _configured = true;
      // Pipe RC's customerInfo updates to our local subscribers — any
      // screen that cares about entitlement changes can listen.
      _Purchases.addCustomerInfoUpdateListener((info) => {
        for (const fn of _listeners) {
          try { fn(info); } catch (e) { console.warn('[iap] listener threw', e.message); }
        }
      });
    } else if (userId) {
      // User changed (sign-out + sign-in): re-identify so the new user
      // sees their own entitlements, not the previous user's.
      await _Purchases.logIn(userId);
    }
  } catch (err) {
    console.warn('[iap] configure failed:', err.message);
  }
}

export async function logOutIap() {
  loadModule();
  if (!_Purchases || !_configured) return;
  try { await _Purchases.logOut(); } catch (err) { console.warn('[iap] logOut:', err.message); }
}

export async function getOfferings() {
  loadModule();
  if (!_Purchases || !_configured) return null;
  try {
    const offerings = await _Purchases.getOfferings();
    return offerings?.current || null;
  } catch (err) {
    console.warn('[iap] getOfferings:', err.message);
    return null;
  }
}

export async function purchasePackage(pkg) {
  loadModule();
  if (!_Purchases) throw new Error('In-app purchases unavailable on this device.');
  // purchasePackage resolves with { customerInfo, productIdentifier } on
  // success and throws on cancellation / failure. Caller is responsible
  // for handling user-cancelled errors gracefully.
  return _Purchases.purchasePackage(pkg);
}

export async function restorePurchases() {
  loadModule();
  if (!_Purchases) throw new Error('In-app purchases unavailable on this device.');
  return _Purchases.restorePurchases();
}

export async function getCustomerInfo() {
  loadModule();
  if (!_Purchases || !_configured) return null;
  try { return await _Purchases.getCustomerInfo(); }
  catch (err) { console.warn('[iap] getCustomerInfo:', err.message); return null; }
}

// Single source of truth for "is the current device's user premium right
// now?" Reads from RevenueCat's local cache when possible; falls back to
// a network fetch via getCustomerInfo. Used by feature gates throughout
// the app — replaces the old `user.plan === 'premium'` checks.
export async function isPremiumEntitled() {
  const info = await getCustomerInfo();
  if (!info) return false;
  return !!info?.entitlements?.active?.[PREMIUM_ENTITLEMENT];
}

export function addCustomerInfoListener(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
