import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Linking, Share, Platform, Switch } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';
import { useTheme, useSkin } from '../../lib/theme';

const FEED_HOST = 'www.sportscalapp.com';

export default function Settings() {
  const { user, logout, updateUser } = useAuth();
  const router = useRouter();
  const t = useTheme();
  const { skin, setSkin } = useSkin();
  const s = useMemo(() => makeStyles(t), [t]);
  const [deleting, setDeleting] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [kids, setKids] = useState([]);
  const [kidsLoading, setKidsLoading] = useState(true);
  const [inboundAddress, setInboundAddress] = useState('');
  const [inboundConfigured, setInboundConfigured] = useState(false);
  // Calendar feed section auto-collapses once the user has any sources
  // (mirrors the web Settings UX). The URL is mostly relevant during
  // initial onboarding; surfacing it on every Settings visit is clutter
  // for established users.
  const [feedCollapsed, setFeedCollapsed] = useState(false);
  const [feedManuallyToggled, setFeedManuallyToggled] = useState(false);

  const httpsFeedUrl  = user?.feed_token ? `https://${FEED_HOST}/feed/${user.feed_token}.ics` : '';
  const webcalFeedUrl = user?.feed_token ? `webcal://${FEED_HOST}/feed/${user.feed_token}.ics`  : '';

  // Load kids on focus so adding/removing a kid on the web (the source of
  // truth for kid CRUD today) is reflected the next time we land here.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      api.get('/api/kids')
        .then(({ kids }) => { if (!cancelled) setKids(kids || []); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setKidsLoading(false); });
      // Lazy-load the inbound address. The endpoint generates the token
      // on first call, so we hit it once per session and cache the result.
      if (!inboundAddress) {
        api.get('/api/auth/inbound-address')
          .then(({ address, configured }) => {
            if (cancelled) return;
            setInboundAddress(address || '');
            setInboundConfigured(!!configured);
          })
          .catch(() => {});
      }
      // Auto-collapse Calendar feed once the user has any sources.
      // Skipped if they've explicitly toggled it open during this session
      // — don't fight a deliberate action.
      if (!feedManuallyToggled) {
        api.get('/api/sources')
          .then(({ sources }) => {
            if (cancelled) return;
            const real = (sources || []).filter(s => s.name !== '__manual__');
            setFeedCollapsed(real.length > 0);
          })
          .catch(() => {});
      }
      return () => { cancelled = true; };
    }, [inboundAddress, feedManuallyToggled])
  );

  async function shareInboundAddress() {
    if (!inboundAddress) return;
    try {
      await Share.share({
        message: inboundAddress,
        url: `mailto:${inboundAddress}`,
      });
    } catch {}
  }

  async function shareKidSchedule(kid) {
    if (!kid?.feed_token) {
      Alert.alert('Missing link', 'This kid is missing a feed token. Pull to refresh and try again.');
      return;
    }
    // webcal:// is what makes Apple/Google Calendar prompt to subscribe
    // rather than just download the .ics. iMessage tappifies the URL
    // the same way it would an https:// link.
    const webcalUrl = `webcal://${FEED_HOST}/feed/kid/${kid.feed_token}.ics`;
    const message   = `Subscribe to your SportsCal schedule, ${kid.name}: ${webcalUrl}`;
    try {
      // Native share sheet — Messages, Mail, AirDrop, Copy, Notes, etc.
      // Better than the web's sms-only path: parents can AirDrop straight
      // to the kid's iPad or share via whichever channel the kid uses.
      await Share.share({ url: webcalUrl, message });
    } catch {
      // user dismissed — no-op
    }
  }

  function subscribeInCalendar() {
    if (!webcalFeedUrl) return;
    Linking.openURL(webcalFeedUrl).catch(() =>
      Alert.alert('Could not open Calendar', 'Try the Share link option instead.')
    );
  }

  async function shareFeedLink() {
    if (!httpsFeedUrl) return;
    try {
      await Share.share({
        url:     httpsFeedUrl,
        message: httpsFeedUrl,
      });
    } catch {
      // user dismissed — no-op
    }
  }

  function handleResetFeed() {
    Alert.alert(
      'Reset calendar link?',
      'Your current subscribed calendars will stop updating until you re-subscribe with the new link.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setRotating(true);
            try {
              const { feed_token } = await api.post('/api/auth/rotate-feed-token');
              updateUser({ feed_token });
            } catch (err) {
              Alert.alert('Could not reset', err.message || 'Please try again.');
            } finally {
              setRotating(false);
            }
          },
        },
      ],
    );
  }

  function handleLogout() {
    Alert.alert(
      'Sign out?',
      'You can sign back in anytime.',
      [
        { text: 'Cancel',    style: 'cancel' },
        { text: 'Sign out',  style: 'destructive', onPress: logout },
      ],
    );
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete account?',
      'This permanently removes your account, all kids, calendars, and events. ' +
      'Active subscriptions will be cancelled. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => Alert.alert(
            'Are you sure?',
            'Last chance — this is permanent.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete forever',
                style: 'destructive',
                onPress: async () => {
                  setDeleting(true);
                  try {
                    await api.del('/api/auth/delete-account');
                    await logout();
                  } catch (err) {
                    setDeleting(false);
                    Alert.alert('Could not delete account', err.message || 'Please try again or contact support.');
                  }
                },
              },
            ],
          ),
        },
      ],
    );
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.scrollContent}>
      <View style={s.section}>
        <Text style={s.label}>Signed in as</Text>
        <Text style={s.value}>{user?.name}</Text>
        <Text style={s.sub}>{user?.email}</Text>
      </View>

      {/* Appearance — the new look is the default; this is the classic
          opt-out. Styled from the theme (not the hardcoded `s` sheet) so
          the row previews the active skin. Persisted per-device via useSkin(). */}
      <View style={{
        backgroundColor: t.surface, borderRadius: 12, padding: 16,
        marginBottom: 12, borderWidth: 1, borderColor: t.border,
        flexDirection: 'row', alignItems: 'center', gap: 12,
      }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: t.navy }}>New look</Text>
          <Text style={{ fontSize: 12, color: t.slate, marginTop: 3, lineHeight: 16 }}>
            On by default — turn off to switch back to classic.
          </Text>
        </View>
        <Switch
          value={skin === 'beta'}
          onValueChange={(v) => setSkin(v ? 'beta' : 'classic')}
          trackColor={{ true: t.accent, false: '#cbd5e1' }}
          accessibilityLabel="Use the new look (beta)"
        />
      </View>

      {/* SportsCal Premium — opens the StoreKit-backed IAP screen.
          After 3.1.1 rejection round 2 (2026-06-10) the only compliant
          path is in-app purchase via StoreKit + RevenueCat. The screen
          itself handles the "already subscribed" state, so showing it
          unconditionally is fine. */}
      <TouchableOpacity
        style={s.upgradeBtn}
        onPress={() => router.push('/upgrade')}
        activeOpacity={0.85}
      >
        <View style={s.upgradeIcon}>
          <Ionicons name="sparkles" size={20} color={t.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.upgradeTitle}>SportsCal Premium</Text>
          <Text style={s.upgradeSub}>
            Unlimited kids & calendars, SMS ride requests, weekly digest.
          </Text>
        </View>
        <Text style={s.upgradeChevron}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={s.setupBtn}
        onPress={() => router.push('/setup')}
        activeOpacity={0.8}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.setupTitle}>Setup helper</Text>
          <Text style={s.setupSub}>
            Add or update calendars by chatting with the helper.
          </Text>
        </View>
        <Text style={s.setupChevron}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={s.manageBtn}
        onPress={() => router.push('/kids')}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.manageTitle}>My kids</Text>
          <Text style={s.manageSub}>
            Names, colors, and each kid's upcoming schedule at a glance.
          </Text>
        </View>
        <Text style={s.manageChevron}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={s.manageBtn}
        onPress={() => router.push('/sources')}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.manageTitle}>Manage calendars</Text>
          <Text style={s.manageSub}>
            Rename, pause, or remove the calendars you've added.
          </Text>
        </View>
        <Text style={s.manageChevron}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={s.manageBtn}
        onPress={() => router.push('/settings/hidden')}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.manageTitle}>Hidden events</Text>
          <Text style={s.manageSub}>
            Events you removed from SportsCal. Restore any you want back.
          </Text>
        </View>
        <Text style={s.manageChevron}>›</Text>
      </TouchableOpacity>

      {inboundAddress ? (
        <View style={s.section}>
          <Text style={s.label}>Forward emails to add a calendar</Text>
          <Text style={s.feedHelp}>
            Forward any email with a calendar link in it to this address and
            we'll add it to your SportsCal automatically. Great for league
            sign-up confirmations.
          </Text>
          <TouchableOpacity
            onPress={shareInboundAddress}
            activeOpacity={0.6}
            style={s.inboundCard}
          >
            <Text style={s.inboundAddress} selectable numberOfLines={1}>
              {inboundAddress}
            </Text>
            <Text style={s.inboundShare}>Share / Copy</Text>
          </TouchableOpacity>
          {!inboundConfigured ? (
            <View style={s.inboundWarn}>
              <Ionicons name="warning-outline" size={14} color="#a87600" style={{ marginTop: 1 }} />
              <Text style={s.inboundWarnText}>
                Email forwarding is not active yet. The address is reserved
                for your account but won't accept mail until DNS + Resend are
                configured.
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {feedCollapsed ? (
        <TouchableOpacity
          style={s.feedCollapsedBtn}
          onPress={() => { setFeedManuallyToggled(true); setFeedCollapsed(false); }}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.feedCollapsedTitle}>Calendar feed</Text>
            <Text style={s.feedCollapsedSub}>
              <Text style={{ color: t.accentDim, fontWeight: '600' }}>✓ Subscribed.</Text>
              {' '}Tap to view, share, or reset.
            </Text>
          </View>
          <Text style={s.feedCollapsedChevron}>›</Text>
        </TouchableOpacity>
      ) : (
        <View style={s.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={s.label}>Calendar feed</Text>
            <TouchableOpacity
              onPress={() => { setFeedManuallyToggled(true); setFeedCollapsed(true); }}
              hitSlop={8}
            >
              <Text style={s.feedHideText}>Hide</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.feedHelp}>
            Subscribe once and your phone calendar stays in sync automatically.
          </Text>

          <TouchableOpacity
            style={s.feedPrimaryBtn}
            onPress={subscribeInCalendar}
            activeOpacity={0.8}
            disabled={!webcalFeedUrl}
          >
            <Text style={s.feedPrimaryText}>Subscribe in Apple Calendar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.feedSecondaryBtn}
            onPress={shareFeedLink}
            activeOpacity={0.7}
            disabled={!httpsFeedUrl}
          >
            <Text style={s.feedSecondaryText}>Share link (Google, Outlook…)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.feedResetBtn}
            onPress={handleResetFeed}
            disabled={rotating}
            activeOpacity={0.7}
          >
            {rotating
              ? <ActivityIndicator color={t.slate} />
              : <Text style={s.feedResetText}>Reset link</Text>}
          </TouchableOpacity>
        </View>
      )}

      <View style={s.section}>
        <View style={s.kidsHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Kid calendars</Text>
            <Text style={s.feedHelp}>
              Each kid has their own subscription link — tap Share to send it
              to their device. Tap a member to edit.
            </Text>
          </View>
          <TouchableOpacity
            style={s.kidsAddBtn}
            onPress={() => router.push('/kids/new')}
            activeOpacity={0.7}
          >
            <Text style={s.kidsAddText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {kidsLoading ? (
          <ActivityIndicator color={t.accent} style={{ marginTop: 8 }} />
        ) : kids.length === 0 ? (
          <Text style={s.kidsEmpty}>
            No family members yet. Tap "+ Add" to add your first.
          </Text>
        ) : (
          <View style={{ gap: 8 }}>
            {kids.map(kid => (
              <TouchableOpacity
                key={kid.id}
                style={s.kidRow}
                onPress={() => router.push(`/kids/${kid.id}`)}
                activeOpacity={0.6}
              >
                <View style={[s.kidAvatar, { backgroundColor: kid.color || '#6366f1' }]}>
                  <Text style={s.kidAvatarText}>{kid.name?.[0] || '?'}</Text>
                </View>
                <Text style={s.kidName} numberOfLines={1}>{kid.name}</Text>
                <TouchableOpacity
                  style={s.kidShareBtn}
                  onPress={() => shareKidSchedule(kid)}
                  activeOpacity={0.7}
                  disabled={!kid.feed_token}
                >
                  <Text style={s.kidShareText}>Share</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
        <Text style={s.logoutText}>Sign out</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.deleteBtn, deleting && { opacity: 0.6 }]}
        onPress={handleDeleteAccount}
        disabled={deleting}
        activeOpacity={0.7}
      >
        {deleting
          ? <ActivityIndicator color={t.slate} />
          : <Text style={s.deleteText}>Delete account</Text>}
      </TouchableOpacity>

      <Text style={s.footer}>SportsCal v1.0.0</Text>
    </ScrollView>
  );
}

function makeStyles(t) {
  return StyleSheet.create({
    // ScrollView outer — flex + bg only. Padding moves to contentContainerStyle
    // because ScrollView doesn't honor padding on its outer style prop.
    root:          { flex: 1, backgroundColor: t.bg },
    // Inner padding + extra bottom space so the last item doesn't sit flush
    // with the tab bar on small phones (SE / mini).
    scrollContent: { padding: 20, paddingBottom: 40 },
    section:  {
      backgroundColor: t.surface, borderRadius: 12, padding: 16,
      marginBottom: 12, borderWidth: 1, borderColor: t.border,
    },
    label:    { fontSize: 11, color: t.slate, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
    value:    { fontSize: 16, fontWeight: '600', color: t.navy },
    sub:      { fontSize: 13, color: t.slate, marginTop: 2 },
    feedHelp: { fontSize: 13, color: t.slate, lineHeight: 18, marginBottom: 12 },
    feedHideText: { fontSize: 13, color: t.accent, fontWeight: '600' },
    // Mirrors s.section's spacing so the collapsed feed sits flush with
    // sibling sections: same horizontal alignment (no extra inset), same
    // 12px gap below before the next section.
    feedCollapsedBtn: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: t.surface,
      paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12,
      borderWidth: 1, borderColor: t.border,
      marginBottom: 12,
    },
    feedCollapsedTitle: {
      fontSize: 12, fontWeight: '600', color: t.slate,
      textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4,
    },
    feedCollapsedSub: { fontSize: 13, color: t.slate },
    feedCollapsedChevron: { fontSize: 22, color: t.slateLight, fontWeight: '300', marginLeft: 8 },
    upgradeBtn: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: t.surface, borderRadius: 12,
      borderWidth: 1.5, borderColor: t.accent,
      padding: 14, marginHorizontal: 16, marginVertical: 8,
    },
    upgradeIcon: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: '#f0fbf6', alignItems: 'center', justifyContent: 'center',
      marginRight: 12,
    },
    upgradeTitle:    { fontSize: 16, fontWeight: '700', color: t.navy },
    upgradeSub:      { fontSize: 12, color: t.slate, marginTop: 3, lineHeight: 17 },
    upgradeChevron:  { fontSize: 22, color: t.accent, marginLeft: 8, fontWeight: '300' },
    setupBtn: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: t.navy, borderRadius: 12,
      paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12,
    },
    setupTitle: { fontSize: 15, fontWeight: '600', color: t.accentOnDark },
    setupSub:   { fontSize: 12, color: t.slateLight, marginTop: 2, lineHeight: 16 },
    setupChevron: { fontSize: 22, color: t.accentOnDark, fontWeight: '300', marginLeft: 8 },
    // Lighter sibling of setupBtn — the setup helper is the "primary" CTA
    // (dark navy / accent green), this manage row is a quieter follow-up
    // styled like a section card to fit visually below it.
    manageBtn: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: t.surface, borderRadius: 12,
      paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12,
      borderWidth: 1, borderColor: t.border,
    },
    manageTitle: { fontSize: 15, fontWeight: '600', color: t.navy },
    manageSub:   { fontSize: 12, color: t.slate, marginTop: 2, lineHeight: 16 },
    manageChevron: { fontSize: 22, color: t.slateLight, fontWeight: '300', marginLeft: 8 },
    inboundCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: t.surface, borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 12,
      borderWidth: 1, borderColor: t.border,
      marginTop: 8,
    },
    inboundAddress: {
      flex: 1, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 13, color: t.navy,
    },
    inboundShare: { fontSize: 13, color: t.accent, fontWeight: '600' },
    inboundWarn:  {
      flexDirection: 'row', alignItems: 'flex-start', gap: 6,
      marginTop: 8,
      backgroundColor: 'rgba(255,180,0,0.08)', borderRadius: 6,
      paddingHorizontal: 10, paddingVertical: 8,
    },
    inboundWarnText: { flex: 1, fontSize: 12, color: '#a87600', lineHeight: 17 },
    feedPrimaryBtn: {
      backgroundColor: t.cta, borderRadius: 10,
      paddingVertical: 13, alignItems: 'center',
    },
    feedPrimaryText: { color: t.ctaText, fontSize: 15, fontWeight: '600' },
    feedSecondaryBtn: {
      borderWidth: 1, borderColor: t.border, borderRadius: 10,
      paddingVertical: 12, alignItems: 'center', marginTop: 8,
      backgroundColor: t.surface,
    },
    feedSecondaryText: { color: t.navy, fontSize: 14, fontWeight: '500' },
    feedResetBtn: { paddingVertical: 10, alignItems: 'center', marginTop: 4 },
    feedResetText: { color: t.slate, fontSize: 12, fontWeight: '500', textDecorationLine: 'underline' },
    kidsHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 4 },
    kidsAddBtn: {
      backgroundColor: t.cta, borderRadius: 8,
      paddingHorizontal: 12, paddingVertical: 8,
    },
    kidsAddText: { color: t.ctaText, fontSize: 14, fontWeight: '600' },
    kidsEmpty: { fontSize: 13, color: t.slate, lineHeight: 18, marginTop: 4 },
    kidRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 6,
    },
    kidAvatar: {
      width: 32, height: 32, borderRadius: 16,
      alignItems: 'center', justifyContent: 'center',
    },
    kidAvatarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    kidName: { flex: 1, fontSize: 15, fontWeight: '500', color: t.navy },
    kidShareBtn: {
      backgroundColor: t.cta, borderRadius: 8,
      paddingHorizontal: 14, paddingVertical: 7,
    },
    kidShareText: { color: t.ctaText, fontSize: 13, fontWeight: '600' },
    logoutBtn:{
      borderWidth: 1, borderColor: t.danger, borderRadius: 10,
      paddingVertical: 14, alignItems: 'center', marginTop: 8, backgroundColor: t.surface,
    },
    logoutText: { color: t.danger, fontSize: 15, fontWeight: '500' },
    deleteBtn: {
      borderRadius: 10, paddingVertical: 14, alignItems: 'center',
      marginTop: 24, backgroundColor: 'transparent',
    },
    deleteText: { color: t.slate, fontSize: 13, fontWeight: '500', textDecorationLine: 'underline' },
    footer:   { textAlign: 'center', fontSize: 12, color: t.slate, marginTop: 32 },
  });
}
