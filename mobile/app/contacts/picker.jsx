import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../lib/api';
import { selectionStore } from '../../lib/selectionStore';
import { chooseNotify } from '../../lib/notifyChoice';
import { useAuth } from '../../lib/auth';

export default function ContactPicker() {
  const { session, role } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const isPremium = user?.plan === 'premium';

  const [contacts, setContacts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [filter, setFilter]     = useState('');

  // Inline "new contact" form state
  const [addOpen, setAddOpen]   = useState(false);
  const [newName, setNewName]   = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const { contacts } = await api.get('/api/contacts');
      setContacts(contacts || []);
    } catch (err) {
      setError(err.message || 'Could not load contacts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // If the user closes the picker without selecting, tell the opener so it
  // can drop its pending session. Effect cleanup runs on both back and swipe-down.
  useEffect(() => {
    return () => {
      if (session) selectionStore.cancel(String(session));
    };
  }, [session]);

  // Run the notify chooser HERE (not on the opener) so the action sheet
  // is presented while this picker modal is still active. Doing it on the
  // opener after router.back() causes iOS to drop the sheet during the
  // dismiss transition — it would flash for an instant and disappear
  // before the user could tap.
  async function select(contact) {
    if (!session) {
      router.back();
      return;
    }
    const notify = await chooseNotify(contact, role, { isPremium });
    if (notify === null) return; // user cancelled — keep picker open
    selectionStore.resolve(String(session), { contact, notify });
    router.back();
  }

  async function createContact() {
    if (!newName.trim()) {
      Alert.alert('Name required', 'Please enter a name for this contact.');
      return;
    }
    setCreating(true);
    try {
      const { contact } = await api.post('/api/contacts', {
        name: newName.trim(),
        phone: newPhone.trim() || null,
        email: newEmail.trim() || null,
      });
      // Immediately select the new contact — that's why you opened this form.
      select(contact);
    } catch (err) {
      Alert.alert('Could not create contact', err.message || 'Please try again.');
      setCreating(false);
    }
  }

  const filtered = filter.trim()
    ? contacts.filter(c => c.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : contacts;

  const roleLabel = role === 'pickup' ? 'pickup' : role === 'dropoff' ? 'dropoff' : null;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={16}>
          <Text style={s.headerCancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>
          {roleLabel ? `Choose ${roleLabel}` : 'Choose contact'}
        </Text>
        <View style={{ width: 56 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator color="#00d68f" size="large" /></View>
        ) : error ? (
          <View style={s.center}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={c => c.id}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View>
                {contacts.length > 0 && (
                  <View style={s.searchBox}>
                    <TextInput
                      style={s.searchInput}
                      placeholder="Search contacts"
                      placeholderTextColor="#8896b0"
                      value={filter}
                      onChangeText={setFilter}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                )}

                {addOpen ? (
                  <View style={s.addForm}>
                    <Text style={s.formLabel}>Name</Text>
                    <TextInput
                      style={s.formInput}
                      value={newName}
                      onChangeText={setNewName}
                      placeholder="e.g. Grandma Rose"
                      placeholderTextColor="#8896b0"
                      autoFocus
                      editable={!creating}
                    />
                    <Text style={s.formLabel}>Phone (optional)</Text>
                    <TextInput
                      style={s.formInput}
                      value={newPhone}
                      onChangeText={setNewPhone}
                      placeholder="555-123-4567"
                      placeholderTextColor="#8896b0"
                      keyboardType="phone-pad"
                      editable={!creating}
                    />
                    <Text style={s.formLabel}>Email (optional)</Text>
                    <TextInput
                      style={s.formInput}
                      value={newEmail}
                      onChangeText={setNewEmail}
                      placeholder="rose@example.com"
                      placeholderTextColor="#8896b0"
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoCorrect={false}
                      editable={!creating}
                    />
                    <View style={s.formBtnRow}>
                      <TouchableOpacity
                        onPress={() => { setAddOpen(false); setNewName(''); setNewPhone(''); setNewEmail(''); }}
                        style={[s.formBtn, s.formBtnSecondary]}
                        disabled={creating}
                      >
                        <Text style={s.formBtnSecondaryText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={createContact}
                        style={[s.formBtn, s.formBtnPrimary, creating && { opacity: 0.6 }]}
                        disabled={creating}
                      >
                        {creating ? (
                          <ActivityIndicator color="#0f1629" />
                        ) : (
                          <Text style={s.formBtnPrimaryText}>Save & select</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity style={s.addRow} onPress={() => setAddOpen(true)}>
                    <Text style={s.addPlus}>+</Text>
                    <Text style={s.addText}>New contact</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
            ListEmptyComponent={
              !addOpen && (
                <View style={s.empty}>
                  <Text style={s.emptyText}>
                    {contacts.length === 0
                      ? "You haven't added any contacts yet. Tap \u201CNew contact\u201D above to add one."
                      : 'No contacts match your search.'}
                  </Text>
                </View>
              )
            }
            renderItem={({ item }) => (
              <TouchableOpacity style={s.row} onPress={() => select(item)}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>
                    {item.name.trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{item.name}</Text>
                  {item.phone || item.email ? (
                    <Text style={s.sub}>{item.phone || item.email}</Text>
                  ) : null}
                </View>
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f4f6fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: '#ef4444', fontSize: 14, textAlign: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#e8ecf4',
    backgroundColor: '#ffffff',
  },
  headerCancel: { fontSize: 15, color: '#8896b0', fontWeight: '500' },
  headerTitle:  { fontSize: 15, fontWeight: '600', color: '#0f1629' },

  searchBox: { paddingHorizontal: 16, paddingTop: 12 },
  searchInput: {
    backgroundColor: '#ffffff', color: '#0f1629', fontSize: 15,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#e8ecf4',
  },

  addRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#e8ecf4',
    backgroundColor: '#ffffff', marginTop: 12,
  },
  addPlus: { fontSize: 22, color: '#00d68f', fontWeight: '300', marginRight: 12, width: 22, textAlign: 'center' },
  addText: { fontSize: 15, fontWeight: '600', color: '#00d68f' },

  addForm: {
    backgroundColor: '#ffffff', padding: 16, marginTop: 12,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e8ecf4',
  },
  formLabel: { fontSize: 13, color: '#8896b0', marginBottom: 6, marginTop: 10 },
  formInput: {
    backgroundColor: '#f4f6fa', color: '#0f1629', fontSize: 15,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, borderColor: '#e8ecf4',
  },
  formBtnRow: { flexDirection: 'row', marginTop: 16, gap: 10 },
  formBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  formBtnPrimary: { backgroundColor: '#00d68f' },
  formBtnPrimaryText: { color: '#0f1629', fontWeight: '600', fontSize: 15 },
  formBtnSecondary: { backgroundColor: '#f4f6fa', borderWidth: 1, borderColor: '#e8ecf4' },
  formBtnSecondaryText: { color: '#4a5670', fontWeight: '500', fontSize: 15 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#e8ecf4',
    backgroundColor: '#ffffff',
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#0f1629', justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  name: { fontSize: 15, fontWeight: '500', color: '#0f1629' },
  sub:  { fontSize: 13, color: '#8896b0', marginTop: 2 },
  chevron: { fontSize: 22, color: '#b8c4d8', fontWeight: '300' },

  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#8896b0', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
