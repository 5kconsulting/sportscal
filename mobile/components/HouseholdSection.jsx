import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '../lib/api';
import { useTheme } from '../lib/theme';

// ============================================================
// HouseholdSection — mobile mirror of the web HouseholdSection.
//
// Shows current household members, pending invites (when the
// server-side HOUSEHOLD_INVITES_ENABLED flag is on), and an
// invite form. Everything else — receiving/redeeming the magic
// link, sign-in flow — happens on the web at /household/join,
// so on mobile we only surface the pieces a signed-in member
// actually uses from their phone:
//   * see who's in the household
//   * invite a co-parent by email (sends the same magic-link)
//   * leave the household (or remove the other member)
//
// Renders nothing while loading and never shows an error blob —
// the section stays quiet if the endpoint is unreachable so the
// rest of Settings still lays out normally.
// ============================================================
export default function HouseholdSection({ currentUserId }) {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setEmail] = useState('');
  const [busy, setBusy]       = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/household/members');
      setData(res);
    } catch {
      // Silent — the section just doesn't render on failure.
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setBusy(true);
    try {
      await api.post('/api/household/invites', { email: inviteEmail.trim() });
      setEmail('');
      Alert.alert('Invite sent', "They'll get an email with a magic link in a moment.");
      await load();
    } catch (err) {
      Alert.alert("Couldn't send invite", err.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function handleRevoke(token) {
    Alert.alert(
      'Cancel this invite?',
      'The magic link will stop working immediately.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel invite',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await api.del(`/api/household/invites/${token}`);
              await load();
            } catch (err) {
              Alert.alert("Couldn't cancel", err.message || 'Please try again.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  function handleRemove(userId, name) {
    const self = userId === currentUserId;
    Alert.alert(
      self ? 'Leave household?' : `Remove ${name}?`,
      self
        ? "You'll go back to a household of just you. Your kids and calendars come with you."
        : `${name} keeps their own account and any calendars they added.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: self ? 'Leave' : 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await api.del(`/api/household/members/${userId}`);
              await load();
            } catch (err) {
              Alert.alert("Couldn't remove", err.message || 'Please try again.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  if (loading || !data) return null;

  const { members = [], pending_invites = [], invites_enabled, max_members = 2 } = data;
  const roomLeft = Math.max(0, max_members - members.length);

  return (
    <View style={s.section}>
      <Text style={s.label}>Household</Text>
      <Text style={s.help}>
        Share your family calendar with a co-parent. You both see the same kids,
        team feeds, and events.
      </Text>

      {/* Members */}
      <View style={{ gap: 8, marginTop: 12 }}>
        {members.map(m => (
          <View key={m.id} style={s.memberRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.memberName}>
                {m.name}
                {m.id === currentUserId ? <Text style={s.memberTag}>  you</Text> : null}
                {m.role === 'owner' && m.id !== currentUserId ? <Text style={s.memberTag}>  owner</Text> : null}
              </Text>
              <Text style={s.memberEmail}>{m.email}</Text>
            </View>
            {members.length > 1 ? (
              <TouchableOpacity
                onPress={() => handleRemove(m.id, m.name)}
                disabled={busy}
                style={s.rowAction}
                activeOpacity={0.6}
              >
                <Text style={s.rowActionText}>
                  {m.id === currentUserId ? 'Leave' : 'Remove'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </View>

      {/* Pending invites */}
      {pending_invites.length > 0 ? (
        <View style={{ marginTop: 16 }}>
          <Text style={s.subLabel}>Pending invites</Text>
          {pending_invites.map(inv => (
            <View key={inv.token} style={s.pendingRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.pendingEmail}>{inv.invited_email}</Text>
                <Text style={s.pendingExpiry}>
                  expires {new Date(inv.expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </Text>
              </View>
              <TouchableOpacity onPress={() => handleRevoke(inv.token)} disabled={busy} style={s.rowAction} activeOpacity={0.6}>
                <Text style={s.rowActionText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}

      {/* Invite form */}
      {invites_enabled && roomLeft > 0 ? (
        <View style={{ marginTop: 16 }}>
          <TextInput
            value={inviteEmail}
            onChangeText={setEmail}
            placeholder="Co-parent's email"
            placeholderTextColor={t.slateLight}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            style={s.input}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!inviteEmail || busy) && { opacity: 0.5 }]}
            onPress={handleInvite}
            disabled={!inviteEmail || busy}
            activeOpacity={0.8}
          >
            {busy
              ? <ActivityIndicator color={t.ctaText} />
              : <Text style={s.sendBtnText}>Send invite</Text>}
          </TouchableOpacity>
        </View>
      ) : null}

      {invites_enabled && roomLeft === 0 ? (
        <Text style={[s.help, { marginTop: 12 }]}>
          Your household is full (2 members max). Remove one to invite someone else.
        </Text>
      ) : null}

      {!invites_enabled ? (
        <Text style={[s.help, { marginTop: 12 }]}>
          Household invites are coming soon — you'll be able to add a co-parent here.
        </Text>
      ) : null}
    </View>
  );
}

function makeStyles(t) {
  return StyleSheet.create({
    section:  {
      backgroundColor: t.surface, borderRadius: 12, padding: 16,
      marginBottom: 12, borderWidth: 1, borderColor: t.border,
    },
    label:    { fontSize: 11, color: t.slate, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
    subLabel: { fontSize: 10.5, color: t.slate, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8 },
    help:     { fontSize: 13, color: t.slate, lineHeight: 18 },
    memberRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: t.bg, borderRadius: 10, padding: 12,
      borderWidth: 1, borderColor: t.border,
    },
    memberName: { fontSize: 15, fontWeight: '600', color: t.navy },
    memberTag: { fontSize: 12, fontWeight: '500', color: t.slate },
    memberEmail: { fontSize: 12.5, color: t.slate, marginTop: 2 },
    pendingRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: t.bg, borderRadius: 10, padding: 10,
      borderWidth: 1, borderColor: t.border, borderStyle: 'dashed',
      marginBottom: 6,
    },
    pendingEmail: { fontSize: 14, color: t.navy, fontWeight: '500' },
    pendingExpiry: { fontSize: 12, color: t.slate, marginTop: 1 },
    rowAction: { paddingHorizontal: 10, paddingVertical: 6 },
    rowActionText: { fontSize: 13, color: t.danger, fontWeight: '600' },
    input: {
      borderWidth: 1, borderColor: t.border, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 15, color: t.navy, backgroundColor: t.bg,
      marginBottom: 10,
    },
    sendBtn: {
      backgroundColor: t.cta, borderRadius: 10,
      paddingVertical: 12, alignItems: 'center',
    },
    sendBtnText: { color: t.ctaText, fontSize: 15, fontWeight: '600' },
  });
}
