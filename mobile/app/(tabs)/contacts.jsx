// Contacts tab — ride contacts + Teams and Groups CRUD.
//
// Mirror of the web /contacts page but split into stacked sections
// + tap-into-detail modal screens (better for a phone than the
// web's expand-in-place pattern).

import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Linking,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { shouldShowTutorial } from '../../lib/tutorialSeen';
import { useTheme } from '../../lib/theme';

// Deterministic avatar color from a name — so a driver / team member keeps
// the same color across the app. Contacts have no color field of their own.
const AV_COLORS = ['#2563EB', '#7C3AED', '#0D9488', '#DB2777', '#EA580C', '#0891B2', '#CA8A04', '#059669', '#9333EA', '#DC2626'];
function avatarColor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}

export default function ContactsScreen() {
  const router = useRouter();
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [contacts, setContacts] = useState([]);
  const [teams, setTeams]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [cRes, tRes] = await Promise.all([
        api.get('/api/contacts'),
        api.get('/api/teams'),
      ]);
      setContacts(cRes.contacts || []);
      setTeams(tRes.teams || []);
    } catch (err) {
      setError(err.message || 'Could not load contacts');
    }
  }, []);

  // Refetch on focus so a contact / team created in a modal screen
  // shows up immediately when the user pops back to the list.
  useFocusEffect(
    useCallback(() => { load().finally(() => setLoading(false)); }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function handleDeleteContact(contact) {
    Alert.alert(
      'Remove contact?',
      `Remove ${contact.name} from your ride contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            try {
              await api.del(`/api/contacts/${contact.id}`);
              setContacts(c => c.filter(x => x.id !== contact.id));
            } catch (err) {
              Alert.alert('Could not remove', err.message || 'Please try again.');
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={t.accent} size="large" />
      </View>
    );
  }

  // Fresh-user chip welcome — zero contacts AND zero teams. Two big
  // tappable buttons skip the dual-section page that would otherwise
  // show two parallel empty states to a brand-new carpool user.
  // Tapping a chip navigates to the matching create-modal — same
  // destinations as the section "+ Add" buttons in the normal layout.
  if (contacts.length === 0 && teams.length === 0) {
    return (
      <View style={s.root}>
        <Text style={s.chipHeadline}>How do you want to start?</Text>
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <TouchableOpacity
            style={s.chipBtn}
            onPress={async () => {
              const show = await shouldShowTutorial('add-driver');
              const next = encodeURIComponent('/contacts/new');
              router.push(show
                ? `/tutorial/add-driver?next=${next}`
                : '/contacts/new');
            }}
            activeOpacity={0.8}
          >
            <Text style={s.chipBtnText}>Add a driver</Text>
            <Ionicons name="arrow-forward" size={18} color={t.accentOnDark} style={{ opacity: 0.7 }} />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.chipBtn}
            onPress={async () => {
              const show = await shouldShowTutorial('setup-team');
              const next = encodeURIComponent('/teams/new');
              router.push(show
                ? `/tutorial/setup-team?next=${next}`
                : '/teams/new');
            }}
            activeOpacity={0.8}
          >
            <Text style={s.chipBtnText}>Setup team carpool</Text>
            <Ionicons name="arrow-forward" size={18} color={t.accentOnDark} style={{ opacity: 0.7 }} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} />}
    >
      {error ? (
        <View style={s.errorBanner}><Text style={s.errorText}>{error}</Text></View>
      ) : null}

      {/* Ride contacts */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionTitle}>Ride contacts</Text>
            <Text style={s.sectionSub}>
              Grandparents, carpool friends — anyone who helps with rides.
            </Text>
          </View>
          <TouchableOpacity style={s.addBtn} onPress={() => router.push('/contacts/new')}>
            <Text style={s.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>
        {contacts.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="car-outline" size={28} color={t.slate} />
            <Text style={s.emptyTitle}>No ride contacts yet</Text>
            <Text style={s.emptySub}>
              Add grandparents, carpool friends, or anyone who helps with drop-off and pick-up.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 9 }}>
            {contacts.map(c => (
              <TouchableOpacity
                key={c.id}
                style={s.driverCard}
                activeOpacity={0.85}
                onLongPress={() => handleDeleteContact(c)}
                delayLongPress={350}
                accessibilityHint="Long-press to remove this contact"
              >
                <View style={[s.dAv, { backgroundColor: avatarColor(c.name) }]}>
                  <Text style={s.dAvTxt}>{(c.name || '?')[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.dName} numberOfLines={1}>{c.name}</Text>
                  <Text style={s.dMeta} numberOfLines={1}>
                    {c.phone || c.email || 'No contact info'}
                  </Text>
                </View>
                <View style={s.dActs}>
                  {c.phone ? (
                    <>
                      <TouchableOpacity style={s.iconBtn} hitSlop={6}
                        onPress={() => Linking.openURL(`tel:${c.phone}`).catch(() => {})}
                        accessibilityLabel={`Call ${c.name}`}>
                        <Ionicons name="call-outline" size={17} color={t.accent} />
                      </TouchableOpacity>
                      <TouchableOpacity style={s.iconBtn} hitSlop={6}
                        onPress={() => Linking.openURL(`sms:${c.phone}`).catch(() => {})}
                        accessibilityLabel={`Text ${c.name}`}>
                        <Ionicons name="chatbubble-outline" size={16} color={t.accent} />
                      </TouchableOpacity>
                    </>
                  ) : c.email ? (
                    <TouchableOpacity style={s.iconBtn} hitSlop={6}
                      onPress={() => Linking.openURL(`mailto:${c.email}`).catch(() => {})}
                      accessibilityLabel={`Email ${c.name}`}>
                      <Ionicons name="mail-outline" size={17} color={t.accent} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Teams and Groups */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionTitle}>Teams and Groups</Text>
            <Text style={s.sectionSub}>
              Ask everyone in a group for a ride at once. First to claim wins.
            </Text>
          </View>
          <TouchableOpacity style={s.addBtn} onPress={() => router.push('/teams/new')}>
            <Text style={s.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>
        {teams.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="people-outline" size={28} color={t.slate} />
            <Text style={s.emptyTitle}>No groups yet</Text>
            <Text style={s.emptySub}>
              A group is anyone you can ask for rides at once — your kid's team, your family,
              the carpool down the block.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 9 }}>
            {teams.map(team => {
              const members = team.members || [];
              const total = members.length;
              const reachable = members.filter(m => m.phone).length;
              const shown = members.slice(0, 5);
              const extra = total - shown.length;
              return (
                <TouchableOpacity key={team.id}
                  style={s.teamCard}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/teams/${team.id}`)}>
                  <View style={s.teamRow}>
                    <View style={s.tIc}>
                      <Ionicons name="people" size={20} color={t.accentOnDark} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.tName} numberOfLines={1}>{team.name}</Text>
                      <Text style={s.tMeta}>{total} {total === 1 ? 'member' : 'members'}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={t.slateLight} />
                  </View>
                  {total > 0 && (
                    <View style={s.stack}>
                      {shown.map((m, i) => (
                        <View key={m.id ?? i}
                          style={[s.stackAv, { backgroundColor: avatarColor(m.name || ''), marginLeft: i === 0 ? 0 : -8 }]}>
                          <Text style={s.stackAvTxt}>{(m.name || '?')[0].toUpperCase()}</Text>
                        </View>
                      ))}
                      {extra > 0 && (
                        <View style={[s.stackMore, { marginLeft: -8 }]}>
                          <Text style={s.stackMoreTxt}>+{extra}</Text>
                        </View>
                      )}
                      <View style={s.reach}>
                        <Text style={s.reachTxt}>{reachable} reachable</Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function makeStyles(t) {
  return StyleSheet.create({
    root:   { flex: 1, backgroundColor: t.bg },
    chipHeadline: {
      fontSize: 22, fontWeight: '600', color: t.navy,
      paddingHorizontal: 20, paddingTop: 32, paddingBottom: 24,
      letterSpacing: -0.3,
    },
    chipBtn: {
      backgroundColor: t.navy,
      paddingHorizontal: 22, paddingVertical: 20,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    chipBtnText:  { color: t.accentOnDark, fontSize: 17, fontWeight: '600' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg },
    errorBanner: {
      backgroundColor: 'rgba(255,107,107,0.08)', marginHorizontal: 16, marginTop: 12,
      padding: 12, borderRadius: 8,
    },
    errorText: { color: t.danger, fontSize: 13 },
    section: { paddingHorizontal: 16, paddingTop: 20 },
    sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 12 },
    sectionTitle: { fontSize: 20, fontWeight: '600', color: t.navy, letterSpacing: -0.3 },
    sectionSub: { fontSize: 13, color: t.slate, marginTop: 2, lineHeight: 18 },
    addBtn: {
      backgroundColor: t.cta, borderRadius: 8,
      paddingHorizontal: 12, paddingVertical: 8,
    },
    addBtnText: { color: t.ctaText, fontSize: 14, fontWeight: '600' },
    emptyCard: {
      backgroundColor: t.surface, borderRadius: 12,
      padding: 24, alignItems: 'center', gap: 6,
      borderWidth: 1, borderColor: t.border,
    },
    emptyTitle: { fontSize: 15, fontWeight: '600', color: t.navy },
    emptySub:   { fontSize: 13, color: t.slate, textAlign: 'center', lineHeight: 18 },

    // driver card
    driverCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: t.surface, borderRadius: 14, padding: 12,
      borderWidth: 1, borderColor: t.border,
      shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1,
    },
    dAv: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    dAvTxt: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
    dName: { fontSize: 15.5, fontWeight: '700', color: t.navy },
    dMeta: { fontSize: 12.5, color: t.slate, marginTop: 1 },
    dActs: { flexDirection: 'row', gap: 6 },
    iconBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },

    // team card
    teamCard: {
      backgroundColor: t.surface, borderRadius: 14, padding: 13,
      borderWidth: 1, borderColor: t.border,
      shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1,
    },
    teamRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    tIc: { width: 44, height: 44, borderRadius: 14, backgroundColor: t.navy, alignItems: 'center', justifyContent: 'center' },
    tName: { fontSize: 15.5, fontWeight: '700', color: t.navy },
    tMeta: { fontSize: 12.5, color: t.slate, marginTop: 1 },
    stack: { flexDirection: 'row', alignItems: 'center', marginTop: 11 },
    stackAv: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: t.surface, alignItems: 'center', justifyContent: 'center' },
    stackAvTxt: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
    stackMore: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: t.surface, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' },
    stackMoreTxt: { color: t.slate, fontSize: 11, fontWeight: '700' },
    reach: { marginLeft: 'auto', backgroundColor: '#16a34a22', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
    reachTxt: { color: '#16a34a', fontSize: 11, fontWeight: '700' },
  });
}
