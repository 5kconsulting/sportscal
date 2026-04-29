// Contacts tab — ride contacts + Teams and Groups CRUD.
//
// Mirror of the web /contacts page but split into stacked sections
// + tap-into-detail modal screens (better for a phone than the
// web's expand-in-place pattern).

import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';

export default function ContactsScreen() {
  const router = useRouter();
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
        <ActivityIndicator color="#00d68f" size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00d68f" />}
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
            <Text style={s.emptyEmoji}>🚗</Text>
            <Text style={s.emptyTitle}>No ride contacts yet</Text>
            <Text style={s.emptySub}>
              Add grandparents, carpool friends, or anyone who helps with drop-off and pick-up.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {contacts.map(c => (
              <View key={c.id} style={s.row}>
                <View style={s.avatar}><Text style={s.avatarText}>{c.name[0]}</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.rowName} numberOfLines={1}>{c.name}</Text>
                  <Text style={s.rowMeta} numberOfLines={1}>
                    {[c.email, c.phone].filter(Boolean).join(' · ') || 'No contact info'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleDeleteContact(c)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={20} color="#8896b0" />
                </TouchableOpacity>
              </View>
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
            <Text style={s.emptyEmoji}>👥</Text>
            <Text style={s.emptyTitle}>No groups yet</Text>
            <Text style={s.emptySub}>
              A group is anyone you can ask for rides at once — your kid's team, your family,
              the carpool down the block.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {teams.map(t => {
              const total = (t.members || []).length;
              return (
                <TouchableOpacity key={t.id}
                  style={s.row}
                  onPress={() => router.push(`/teams/${t.id}`)}>
                  <View style={[s.avatar, { backgroundColor: '#1a3050' }]}>
                    <Ionicons name="people" size={18} color="#00d68f" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.rowName} numberOfLines={1}>{t.name}</Text>
                    <Text style={s.rowMeta}>
                      {total} {total === 1 ? 'member' : 'members'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#b8c4d8" />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f4f6fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f4f6fa' },
  errorBanner: {
    backgroundColor: 'rgba(255,107,107,0.08)', marginHorizontal: 16, marginTop: 12,
    padding: 12, borderRadius: 8,
  },
  errorText: { color: '#ff6b6b', fontSize: 13 },
  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '600', color: '#0f1629', letterSpacing: -0.3 },
  sectionSub: { fontSize: 13, color: '#8896b0', marginTop: 2, lineHeight: 18 },
  addBtn: {
    backgroundColor: '#00d68f', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  addBtnText: { color: '#0f1629', fontSize: 14, fontWeight: '600' },
  emptyCard: {
    backgroundColor: '#ffffff', borderRadius: 12,
    padding: 24, alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: '#e8ecf4',
  },
  emptyEmoji: { fontSize: 28 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#0f1629' },
  emptySub:   { fontSize: 13, color: '#8896b0', textAlign: 'center', lineHeight: 18 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#ffffff', borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: '#e8ecf4',
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#0f1629', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#00d68f', fontSize: 16, fontWeight: '700' },
  rowName: { fontSize: 15, fontWeight: '600', color: '#0f1629' },
  rowMeta: { fontSize: 13, color: '#8896b0', marginTop: 2 },
});
