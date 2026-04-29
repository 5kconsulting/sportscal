import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Linking, Share } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';

const FEED_HOST = 'www.sportscalapp.com';

export default function Settings() {
  const { user, logout, updateUser } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [kids, setKids] = useState([]);
  const [kidsLoading, setKidsLoading] = useState(true);

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
      return () => { cancelled = true; };
    }, [])
  );

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
      'This permanently removes your account, all kids, sources, and events. ' +
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
    <View style={s.root}>
      <View style={s.section}>
        <Text style={s.label}>Signed in as</Text>
        <Text style={s.value}>{user?.name}</Text>
        <Text style={s.sub}>{user?.email}</Text>
      </View>

      <View style={s.section}>
        <Text style={s.label}>Plan</Text>
        <Text style={s.value}>
          {user?.plan === 'premium' ? 'Premium' : 'Free'}
        </Text>
      </View>

      <View style={s.section}>
        <Text style={s.label}>Calendar feed</Text>
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
            ? <ActivityIndicator color="#8896b0" />
            : <Text style={s.feedResetText}>Reset link</Text>}
        </TouchableOpacity>
      </View>

      <View style={s.section}>
        <Text style={s.label}>Kid calendars</Text>
        <Text style={s.feedHelp}>
          Each kid has their own subscription link — tap Share to send it
          to their device. They'll see only their own events.
        </Text>

        {kidsLoading ? (
          <ActivityIndicator color="#00d68f" style={{ marginTop: 8 }} />
        ) : kids.length === 0 ? (
          <Text style={s.kidsEmpty}>
            No kids yet. Add one on sportscalapp.com (mobile editing coming soon).
          </Text>
        ) : (
          <View style={{ gap: 8 }}>
            {kids.map(kid => (
              <View key={kid.id} style={s.kidRow}>
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
              </View>
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
          ? <ActivityIndicator color="#8896b0" />
          : <Text style={s.deleteText}>Delete account</Text>}
      </TouchableOpacity>

      <Text style={s.footer}>SportsCal v0.1.0 — mobile beta</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#f4f6fa', padding: 20 },
  section:  {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#e8ecf4',
  },
  label:    { fontSize: 11, color: '#8896b0', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  value:    { fontSize: 16, fontWeight: '600', color: '#0f1629' },
  sub:      { fontSize: 13, color: '#8896b0', marginTop: 2 },
  feedHelp: { fontSize: 13, color: '#4a5670', lineHeight: 18, marginBottom: 12 },
  feedPrimaryBtn: {
    backgroundColor: '#00d68f', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center',
  },
  feedPrimaryText: { color: '#0f1629', fontSize: 15, fontWeight: '600' },
  feedSecondaryBtn: {
    borderWidth: 1, borderColor: '#e8ecf4', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', marginTop: 8,
    backgroundColor: '#ffffff',
  },
  feedSecondaryText: { color: '#0f1629', fontSize: 14, fontWeight: '500' },
  feedResetBtn: { paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  feedResetText: { color: '#8896b0', fontSize: 12, fontWeight: '500', textDecorationLine: 'underline' },
  kidsEmpty: { fontSize: 13, color: '#8896b0', lineHeight: 18, marginTop: 4 },
  kidRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 6,
  },
  kidAvatar: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  kidAvatarText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  kidName: { flex: 1, fontSize: 15, fontWeight: '500', color: '#0f1629' },
  kidShareBtn: {
    backgroundColor: '#00d68f', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  kidShareText: { color: '#0f1629', fontSize: 13, fontWeight: '600' },
  logoutBtn:{
    borderWidth: 1, borderColor: '#ff6b6b', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 8, backgroundColor: '#ffffff',
  },
  logoutText: { color: '#ff6b6b', fontSize: 15, fontWeight: '500' },
  deleteBtn: {
    borderRadius: 10, paddingVertical: 14, alignItems: 'center',
    marginTop: 24, backgroundColor: 'transparent',
  },
  deleteText: { color: '#8896b0', fontSize: 13, fontWeight: '500', textDecorationLine: 'underline' },
  footer:   { textAlign: 'center', fontSize: 12, color: '#8896b0', marginTop: 32 },
});
