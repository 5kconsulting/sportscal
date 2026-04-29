// Group detail modal — list members, add (existing or inline new),
// remove, share invite link, rename, delete.

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
  Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';

export default function GroupDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [team, setTeam]               = useState(null);
  const [allContacts, setAllContacts] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');

  // Inline new-person form state
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName]   = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [creating, setCreating] = useState(false);

  // Existing-contact picker visibility
  const [showPicker, setShowPicker] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tRes, cRes] = await Promise.all([
        api.get('/api/teams'),
        api.get('/api/contacts'),
      ]);
      const t = (tRes.teams || []).find(x => x.id === id);
      if (!t) {
        setError('Group not found');
      } else {
        setTeam(t);
      }
      setAllContacts(cRes.contacts || []);
    } catch (err) {
      setError(err.message || 'Could not load group');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleAddExisting(contact) {
    try {
      await api.post(`/api/teams/${id}/members`, { contact_ids: [contact.id] });
      await load();
    } catch (err) {
      Alert.alert('Could not add', err.message || 'Please try again.');
    }
  }

  async function handleCreateAndAdd() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { contact } = await api.post('/api/contacts', {
        name:  newName.trim(),
        phone: newPhone.trim() || null,
        email: newEmail.trim() || null,
      });
      await api.post(`/api/teams/${id}/members`, { contact_ids: [contact.id] });
      setNewName(''); setNewPhone(''); setNewEmail('');
      setShowNew(false);
      await load();
    } catch (err) {
      Alert.alert('Could not add', err.message || 'Please try again.');
    } finally {
      setCreating(false);
    }
  }

  async function handleRemove(member) {
    Alert.alert(
      'Remove from group?',
      `${member.name} stays in your contacts; they're just removed from "${team?.name}".`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            try {
              await api.del(`/api/teams/${id}/members/${member.id}`);
              await load();
            } catch (err) {
              Alert.alert('Could not remove', err.message || 'Please try again.');
            }
          },
        },
      ],
    );
  }

  function handleRename() {
    Alert.prompt(
      'Rename group',
      undefined,
      async (next) => {
        const v = (next || '').trim();
        if (!v || v === team.name) return;
        try {
          await api.patch(`/api/teams/${id}`, { name: v });
          await load();
        } catch (err) {
          Alert.alert('Could not rename', err.message || 'Please try again.');
        }
      },
      'plain-text',
      team?.name || '',
    );
  }

  function handleDelete() {
    Alert.alert(
      'Delete group?',
      `Members stay in your contacts. The "${team?.name}" group itself will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await api.del(`/api/teams/${id}`);
              router.back();
            } catch (err) {
              Alert.alert('Could not delete', err.message || 'Please try again.');
            }
          },
        },
      ],
    );
  }

  async function handleShareInvite() {
    try {
      const { url } = await api.post(`/api/teams/${id}/invites`);
      const body =
        `Join my ${team.name} group on SportsCal so I can include you in ` +
        `ride coordination: ${url}`;
      Linking.openURL(`sms:?body=${encodeURIComponent(body)}`).catch(() => {
        Alert.alert('Invite created', url);
      });
    } catch (err) {
      Alert.alert('Could not create invite', err.message || 'Please try again.');
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <ModalHeader title="" onClose={() => router.back()} />
        <View style={s.center}><ActivityIndicator color="#00d68f" size="large" /></View>
      </SafeAreaView>
    );
  }
  if (error || !team) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <ModalHeader title="" onClose={() => router.back()} />
        <View style={s.center}>
          <Text style={s.errorText}>{error || 'Group not found'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const memberIds = new Set((team.members || []).map(m => m.id));
  const candidates = allContacts.filter(c => !memberIds.has(c.id));

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ModalHeader title="Group" onClose={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* Title block */}
          <View style={s.titleBlock}>
            <Text style={s.title}>{team.name}</Text>
            <Text style={s.titleMeta}>
              {(team.members || []).length} {(team.members || []).length === 1 ? 'member' : 'members'}
            </Text>
            <View style={s.actionsRow}>
              <ActionButton icon="share-outline" label="Share invite" onPress={handleShareInvite} />
              <ActionButton icon="create-outline" label="Rename" onPress={handleRename} />
              <ActionButton icon="trash-outline"  label="Delete"  onPress={handleDelete} danger />
            </View>
          </View>

          {/* Members */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>Members</Text>
            {(team.members || []).length === 0 ? (
              <Text style={s.empty}>No members yet — add some below.</Text>
            ) : (
              <View style={{ gap: 8 }}>
                {team.members.map(m => (
                  <View key={m.id} style={s.memberRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.memberName} numberOfLines={1}>{m.name}</Text>
                      {m.phone ? <Text style={s.memberMeta} numberOfLines={1}>{m.phone}</Text> : null}
                    </View>
                    <TouchableOpacity onPress={() => handleRemove(m)} hitSlop={8}>
                      <Ionicons name="close-circle-outline" size={22} color="#8896b0" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Add members */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>Add members</Text>

            {showNew ? (
              <View style={s.newForm}>
                <TextInput style={s.input} placeholder="Name *" placeholderTextColor="#b8c4d8"
                  value={newName} onChangeText={setNewName} autoFocus autoCapitalize="words" />
                <TextInput style={s.input} placeholder="Phone" placeholderTextColor="#b8c4d8"
                  value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" />
                <TextInput style={s.input} placeholder="Email" placeholderTextColor="#b8c4d8"
                  value={newEmail} onChangeText={setNewEmail}
                  autoCapitalize="none" keyboardType="email-address" autoCorrect={false} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[s.primaryBtn, { flex: 1 }, (creating || !newName.trim()) && { opacity: 0.6 }]}
                    onPress={handleCreateAndAdd}
                    disabled={creating || !newName.trim()}>
                    {creating ? <ActivityIndicator color="#0f1629" /> : <Text style={s.primaryBtnText}>Add to group</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.ghostBtn}
                    onPress={() => { setShowNew(false); setNewName(''); setNewPhone(''); setNewEmail(''); }}>
                    <Text style={s.ghostBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : showPicker ? (
              candidates.length === 0 ? (
                <View style={s.newForm}>
                  <Text style={s.empty}>Every contact is already in this group.</Text>
                  <TouchableOpacity style={s.ghostBtn} onPress={() => setShowPicker(false)}>
                    <Text style={s.ghostBtnText}>Back</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={s.newForm}>
                  <Text style={s.helper}>Tap a contact to add them to the group.</Text>
                  <View style={{ gap: 6 }}>
                    {candidates.map(c => (
                      <TouchableOpacity key={c.id} style={s.candidateRow}
                        onPress={() => handleAddExisting(c)}>
                        <Text style={s.candidateName}>{c.name}</Text>
                        <Ionicons name="add-circle-outline" size={22} color="#00d68f" />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity style={s.ghostBtn} onPress={() => setShowPicker(false)}>
                    <Text style={s.ghostBtnText}>Done</Text>
                  </TouchableOpacity>
                </View>
              )
            ) : (
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <TouchableOpacity style={[s.dashedBtn, { flex: 1 }]}
                  onPress={() => setShowNew(true)}>
                  <Text style={s.dashedBtnText}>+ New person</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.dashedBtn, { flex: 1 }]}
                  onPress={() => setShowPicker(true)}
                  disabled={candidates.length === 0}>
                  <Text style={[s.dashedBtnText, candidates.length === 0 && { opacity: 0.4 }]}>
                    + From contacts ({candidates.length})
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ModalHeader({ title, onClose }) {
  return (
    <View style={s.header}>
      <TouchableOpacity onPress={onClose} hitSlop={16}>
        <Text style={s.headerClose}>Done</Text>
      </TouchableOpacity>
      <Text style={s.headerTitle}>{title}</Text>
      <View style={{ width: 56 }} />
    </View>
  );
}

function ActionButton({ icon, label, onPress, danger }) {
  return (
    <TouchableOpacity style={s.actionBtn} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={18} color={danger ? '#ef4444' : '#0f1629'} />
      <Text style={[s.actionLabel, danger && { color: '#ef4444' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f6fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#ef4444', fontSize: 14, paddingHorizontal: 24, textAlign: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#e8ecf4',
    backgroundColor: '#ffffff',
  },
  headerClose: { fontSize: 15, color: '#00d68f', fontWeight: '600' },
  headerTitle: { fontSize: 15, fontWeight: '600', color: '#0f1629' },
  titleBlock: {
    backgroundColor: '#ffffff', padding: 20,
    borderBottomWidth: 1, borderBottomColor: '#e8ecf4',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#0f1629', letterSpacing: -0.3 },
  titleMeta: { fontSize: 13, color: '#8896b0', marginTop: 4 },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f4f6fa', borderWidth: 1, borderColor: '#e8ecf4',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
  },
  actionLabel: { fontSize: 13, fontWeight: '500', color: '#0f1629' },

  section: { paddingHorizontal: 20, paddingTop: 24 },
  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: '#8896b0',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
  },
  empty: { fontSize: 13, color: '#8896b0', lineHeight: 18 },
  helper: { fontSize: 12, color: '#8896b0', marginBottom: 10 },

  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#ffffff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: '#e8ecf4',
  },
  memberName: { fontSize: 14, fontWeight: '600', color: '#0f1629' },
  memberMeta: { fontSize: 12, color: '#8896b0', marginTop: 1 },

  newForm: { gap: 8 },
  input: {
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e8ecf4',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#0f1629',
  },
  primaryBtn: {
    backgroundColor: '#00d68f', borderRadius: 10, paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#0f1629', fontSize: 14, fontWeight: '600' },
  ghostBtn: {
    backgroundColor: 'transparent', borderRadius: 10, paddingVertical: 12,
    paddingHorizontal: 14, alignItems: 'center',
  },
  ghostBtnText: { color: '#8896b0', fontSize: 14, fontWeight: '500' },

  dashedBtn: {
    minWidth: 140,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1, borderColor: '#e8ecf4',
    borderStyle: 'dashed', alignItems: 'center',
    backgroundColor: 'transparent',
  },
  dashedBtnText: { color: '#0f1629', fontSize: 13, fontWeight: '500' },

  candidateRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#ffffff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: '#e8ecf4',
  },
  candidateName: { fontSize: 14, color: '#0f1629', fontWeight: '500' },
});
