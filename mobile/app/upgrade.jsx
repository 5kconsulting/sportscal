// SportsCal Premium upgrade screen.
//
// Apple-mandated requirements baked in:
//   • Pricing visible BEFORE the Subscribe button
//   • Subscription length (monthly/yearly) visible
//   • Restore Purchases button (required for any subscription app)
//   • Terms of Service + Privacy Policy links (required + must be
//     reachable — both already shipped at /terms and /privacy)
//   • Subscription auto-renew disclosure (Apple's exact required wording)
//
// Surfaces are fetched live from RevenueCat (offerings → packages) so
// changing prices/tiers doesn't need an app rebuild. RC config + product
// IDs lives in the dashboard (RC_OFFERING = "default", entitlement = "premium").

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';
import {
  getOfferings, purchasePackage, restorePurchases,
  PREMIUM_ENTITLEMENT,
} from '../lib/iap';

const FEATURES = [
  { icon: 'paper-plane-outline',   text: 'SMS ride requests to your carpool' },
  { icon: 'people-outline',        text: 'Unlimited kids' },
  { icon: 'calendar-outline',      text: 'Unlimited connected calendars' },
  { icon: 'mail-outline',          text: 'Weekly email digest of upcoming events' },
  { icon: 'sparkles-outline',      text: 'Priority support' },
];

export default function UpgradeScreen() {
  const router = useRouter();
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [offering, setOffering] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [busy, setBusy]         = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const o = await getOfferings();
    setOffering(o);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onPurchase(pkg) {
    if (busy) return;
    setBusy(true);
    try {
      const { customerInfo } = await purchasePackage(pkg);
      const ok = !!customerInfo?.entitlements?.active?.[PREMIUM_ENTITLEMENT];
      if (ok) {
        Alert.alert('Welcome to Premium!', 'You\'re all set. Thanks for supporting SportsCal.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        // Edge case: purchase reported success but entitlement isn't
        // active yet. RevenueCat usually self-heals on a second fetch.
        Alert.alert('Purchase received', 'Your subscription is processing. It may take a moment to activate.');
      }
    } catch (err) {
      // Treat user-cancellation as a silent no-op; surface other errors.
      if (err?.userCancelled || err?.code === 'PURCHASE_CANCELLED' || /cancel/i.test(err?.message || '')) {
        // no-op
      } else {
        Alert.alert('Purchase failed', err?.message || 'Try again in a moment.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function onRestore() {
    if (busy) return;
    setBusy(true);
    try {
      const info = await restorePurchases();
      const ok = !!info?.entitlements?.active?.[PREMIUM_ENTITLEMENT];
      if (ok) {
        Alert.alert('Restored', 'Your Premium subscription is active again.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Nothing to restore', 'No active Premium subscription was found for this Apple ID.');
      }
    } catch (err) {
      Alert.alert('Restore failed', err?.message || 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.closeBtn} hitSlop={12}>
          <Ionicons name="close" size={26} color={t.slate} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>SportsCal Premium</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.hero}>
          <Ionicons name="sparkles" size={36} color={t.accent} />
          <Text style={s.heroTitle}>Unlock the full SportsCal</Text>
          <Text style={s.heroSub}>
            Carpool with confidence and connect every calendar.
          </Text>
        </View>

        <View style={s.features}>
          {FEATURES.map((f, i) => (
            <View key={i} style={s.featureRow}>
              <Ionicons name={f.icon} size={20} color={t.accent} />
              <Text style={s.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={t.accent} size="large" style={{ marginVertical: 32 }} />
        ) : !offering || !offering.availablePackages?.length ? (
          <View style={s.empty}>
            <Text style={s.emptyText}>
              Subscriptions aren't available right now. Please try again later or visit
              sportscalapp.com from a browser to manage your account.
            </Text>
          </View>
        ) : (
          <View style={s.packages}>
            {offering.availablePackages.map((pkg) => {
              const isAnnual = pkg.packageType === 'ANNUAL' || /year/i.test(pkg.identifier);
              return (
                <TouchableOpacity
                  key={pkg.identifier}
                  style={[s.pkgBtn, isAnnual && s.pkgBtnHighlight]}
                  activeOpacity={0.85}
                  onPress={() => onPurchase(pkg)}
                  disabled={busy}
                >
                  {isAnnual && <Text style={s.pkgBadge}>BEST VALUE</Text>}
                  <Text style={[s.pkgTitle, isAnnual && s.pkgTitleHighlight]}>
                    {pkg.product?.title || pkg.product?.identifier}
                  </Text>
                  <Text style={[s.pkgPrice, isAnnual && s.pkgPriceHighlight]}>
                    {pkg.product?.priceString}
                  </Text>
                  {pkg.product?.description ? (
                    <Text style={[s.pkgDesc, isAnnual && s.pkgDescHighlight]}>
                      {pkg.product.description}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Apple-required boilerplate: auto-renewal disclosure + Terms/Privacy
            links. These are MANDATORY for subscription apps; rejection
            otherwise. Wording matches Apple's recommended pattern verbatim. */}
        <Text style={s.disclosure}>
          Payment will be charged to your Apple ID at the confirmation of purchase.
          Your subscription automatically renews unless it is canceled at least 24
          hours before the end of the current period. Manage or cancel anytime in
          your Apple ID Settings.
        </Text>

        <View style={s.linksRow}>
          <TouchableOpacity onPress={() => Linking.openURL('https://www.sportscalapp.com/terms')}>
            <Text style={s.link}>Terms of Service</Text>
          </TouchableOpacity>
          <Text style={s.linkSep}>·</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://www.sportscalapp.com/privacy')}>
            <Text style={s.link}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={s.linkSep}>·</Text>
          <TouchableOpacity onPress={onRestore} disabled={busy}>
            <Text style={s.link}>Restore</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(t) {
  return StyleSheet.create({
    root:   { flex: 1, backgroundColor: t.surface },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 12, paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border,
    },
    closeBtn:    { padding: 4 },
    headerTitle: { fontSize: 17, fontWeight: '600', color: t.navy },
    scroll:      { padding: 20, paddingBottom: 40 },
    hero:        { alignItems: 'center', marginTop: 12, marginBottom: 24 },
    heroTitle:   { fontSize: 22, fontWeight: '700', color: t.navy, marginTop: 10 },
    heroSub:     { fontSize: 15, color: t.slate, marginTop: 6, textAlign: 'center', lineHeight: 21 },
    features:    { marginBottom: 24 },
    featureRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
    featureText: { fontSize: 15, color: t.navy, marginLeft: 12, flex: 1 },
    empty:       { padding: 24, backgroundColor: t.bg, borderRadius: 12, marginVertical: 16 },
    emptyText:   { fontSize: 14, color: t.slate, lineHeight: 20, textAlign: 'center' },
    packages:    { gap: 12, marginBottom: 24 },
    pkgBtn:      {
      borderWidth: 1.5, borderColor: t.border, borderRadius: 14,
      padding: 16, alignItems: 'center', backgroundColor: t.surface,
    },
    pkgBtnHighlight: {
      borderColor: t.accent, backgroundColor: t.accent + '14',
    },
    pkgBadge: {
      position: 'absolute', top: -10, paddingHorizontal: 10, paddingVertical: 3,
      backgroundColor: t.accent, color: '#fff', fontSize: 10, fontWeight: '700',
      borderRadius: 10, letterSpacing: 0.5,
    },
    pkgTitle:          { fontSize: 16, fontWeight: '600', color: t.navy },
    pkgTitleHighlight: { color: t.navy },
    pkgPrice:          { fontSize: 22, fontWeight: '700', color: t.navy, marginTop: 4 },
    pkgPriceHighlight: { color: t.accentDim },
    pkgDesc:           { fontSize: 13, color: t.slate, marginTop: 4, textAlign: 'center' },
    pkgDescHighlight:  { color: t.slate },
    disclosure:        {
      fontSize: 11, color: t.slate, lineHeight: 16, textAlign: 'center',
      marginTop: 8, marginBottom: 14,
    },
    linksRow:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
    link:        { fontSize: 12, color: t.accent, fontWeight: '600' },
    linkSep:     { fontSize: 12, color: t.slateLight, marginHorizontal: 10 },
  });
}
