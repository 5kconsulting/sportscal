import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../lib/api';

// Same palette as kids/new.jsx + the web Kids page.
const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  '#00d68f', '#06b6d4', '#f43f5e', '#a855f7',
];

export default function EditKid() {
  const { id }   = useLocalSearchParams();
  const router   = useRouter();

  const [name, setName]       = useState('');
  const [color, setColor]     = useState(COLORS[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError]     = useState('');

  // The kids endpoint is list-only (no GET /api/kids/:id), so we fetch the
  // full list and pluck — cheap, kids count is bounded by plan limits.
  useEffect(() => {
    let cancelled = false;
    api.get('/api/kids')
      .then(({ kids }) => {
        if (cancelled) return;
        const k = (kids || []).find(x => x.id === id);
        if (!k) {
          setError('Kid not found.');
        } else {
          setName(k.name || '');
          setColor(k.color || COLORS[0]);
        }
      })
      .catch(err => { if (!cancelled) setError(err.message || 'Could not load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await api.patch(`/api/kids/${id}`, { name: name.trim(), color });
      router.back();
    } catch (err) {
      setError(err.message || 'Could not save member');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    Alert.alert(
      'Remove this family member?',
      'Their attendance overrides and per-kid calendars will also be removed. Events from shared calendars stay.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await api.del(`/api/kids/${id}`);
              router.back();
            } catch (err) {
              setDeleting(false);
              Alert.alert('Could not remove', err.message || 'Please try again.');
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <ModalHeader title="Edit member" onClose={() => router.back()} />
        <View style={s.center}><ActivityIndicator color="#00d68f" size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ModalHeader title="Edit member" onClose={() => router.back()} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          {error ? <Text style={s.error}>{error}</Text> : null}

          <Text style={s.label}>Name *</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="Emma"
            placeholderTextColor="#b8c4d8"
            autoCapitalize="words"
          />

          <Text style={s.label}>Color</Text>
          <View style={s.swatchWrap}>
            {COLORS.map(c => (
              <TouchableOpacity
                key={c}
                onPress={() => setColor(c)}
                style={[
                  s.swatch,
                  { backgroundColor: c },
                  color === c && s.swatchOn,
                ]}
                activeOpacity={0.7}
              />
            ))}
          </View>

          <View style={s.preview}>
            <View style={[s.previewAvatar, { backgroundColor: color }]}>
              <Text style={s.previewAvatarText}>
                {(name || 'A')[0].toUpperCase()}
              </Text>
            </View>
            <Text style={s.previewText} numberOfLines={1}>
              <Text style={{ fontWeight: '600', color: '#0f1629' }}>{name || 'Name'}</Text>
              <Text style={{ color: '#8896b0' }}> — Soccer Practice</Text>
            </Text>
          </View>

          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving || deleting}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color="#0f1629" />
              : <Text style={s.saveText}>Save changes</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={s.deleteBtn}
            onPress={handleDelete}
            disabled={saving || deleting}
            activeOpacity={0.7}
          >
            {deleting
              ? <ActivityIndicator color="#ff6b6b" />
              : <Text style={s.deleteText}>Remove member</Text>}
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  input: {
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e8ecf4',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#0f1629',
  },
  error: {
    color: '#ff6b6b', fontSize: 13, padding: 10,
    backgroundColor: 'rgba(255,107,107,0.08)', borderRadius: 6,
  },
  swatchWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  swatch: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 3, borderColor: 'transparent',
  },
  swatchOn: { borderColor: '#0f1629', transform: [{ scale: 1.1 }] },
  preview: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#ffffff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, marginTop: 16,
    borderWidth: 1, borderColor: '#e8ecf4',
  },
  previewAvatar: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  previewAvatarText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  previewText: { flex: 1, fontSize: 14 },
  saveBtn: {
    backgroundColor: '#00d68f', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 24,
  },
  saveText: { color: '#0f1629', fontSize: 15, fontWeight: '600' },
  deleteBtn: {
    borderWidth: 1, borderColor: '#ff6b6b', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center', marginTop: 12,
    backgroundColor: '#ffffff',
  },
  deleteText: { color: '#ff6b6b', fontSize: 14, fontWeight: '500' },
});
