import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '../../lib/api';

export default function NewGroup() {
  const router = useRouter();
  const [name, setName]   = useState('');
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState([]);   // contact ids
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    api.get('/api/contacts')
      .then(({ contacts }) => setContacts(contacts || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggle(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSave() {
    if (!name.trim()) { setError('Group name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/api/teams', {
        name: name.trim(),
        contact_ids: selected,
      });
      router.back();
    } catch (err) {
      setError(err.message || 'Could not save group');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ModalHeader title="New group" onClose={() => router.back()} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          {error ? <Text style={s.error}>{error}</Text> : null}

          <Text style={s.label}>Group name *</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="Sam's soccer team, Family, Block carpool"
            placeholderTextColor="#b8c4d8"
            autoFocus
          />

          {loading ? (
            <ActivityIndicator color="#00d68f" style={{ marginTop: 24 }} />
          ) : contacts.length === 0 ? (
            <Text style={s.note}>
              No contacts yet. Save the group first, then add members from the group's detail screen.
            </Text>
          ) : (
            <>
              <Text style={s.label}>Add members (optional)</Text>
              <Text style={s.helper}>Tap to include. You can add more later.</Text>
              <View style={s.chipWrap}>
                {contacts.map(c => {
                  const on = selected.includes(c.id);
                  return (
                    <TouchableOpacity key={c.id}
                      style={[s.chip, on && s.chipOn]}
                      onPress={() => toggle(c.id)}
                      activeOpacity={0.7}>
                      <Text style={[s.chipText, on && s.chipTextOn]}>
                        {on ? '✓ ' : ''}{c.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color="#0f1629" />
              : <Text style={s.saveText}>
                  Create group{selected.length ? ` with ${selected.length}` : ''}
                </Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ModalHeader({ title, onClose }) {
  return (
    <View style={s.header}>
      <TouchableOpacity onPress={onClose} hitSlop={16}>
        <Text style={s.headerClose}>Cancel</Text>
      </TouchableOpacity>
      <Text style={s.headerTitle}>{title}</Text>
      <View style={{ width: 56 }} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f6fa' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#e8ecf4',
    backgroundColor: '#ffffff',
  },
  headerClose: { fontSize: 15, color: '#00d68f', fontWeight: '600' },
  headerTitle: { fontSize: 15, fontWeight: '600', color: '#0f1629' },
  body: { padding: 20, gap: 4, paddingBottom: 40 },
  label: { fontSize: 12, fontWeight: '600', color: '#8896b0', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
  helper: { fontSize: 13, color: '#8896b0', marginBottom: 10 },
  note: { fontSize: 13, color: '#8896b0', lineHeight: 19, marginTop: 18 },
  input: {
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e8ecf4',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#0f1629',
  },
  error: {
    color: '#ff6b6b', fontSize: 13, padding: 10,
    backgroundColor: 'rgba(255,107,107,0.08)', borderRadius: 6,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e8ecf4',
  },
  chipOn: { backgroundColor: '#0f1629', borderColor: '#0f1629' },
  chipText: { fontSize: 13, color: '#0f1629', fontWeight: '500' },
  chipTextOn: { color: '#ffffff' },
  saveBtn: {
    backgroundColor: '#00d68f', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 24,
  },
  saveText: { color: '#0f1629', fontSize: 15, fontWeight: '600' },
});
