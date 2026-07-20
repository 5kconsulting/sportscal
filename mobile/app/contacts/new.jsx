import { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '../../lib/api';
import { useTheme } from '../../lib/theme';

export default function NewContact() {
  const router = useRouter();
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [name,  setName]  = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/api/contacts', {
        name:  name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
      });
      router.back();
    } catch (err) {
      setError(err.message || 'Could not save contact');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ModalHeader title="New contact" onClose={() => router.back()} />
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
            placeholder="Grandma Linda"
            placeholderTextColor={t.slateLight}
            autoCapitalize="words"
            autoFocus
          />

          <Text style={s.label}>Phone</Text>
          <TextInput
            style={s.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="(503) 555-0123"
            placeholderTextColor={t.slateLight}
            keyboardType="phone-pad"
            autoComplete="tel"
          />

          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            placeholder="linda@example.com"
            placeholderTextColor={t.slateLight}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            autoCorrect={false}
          />

          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color={t.ctaText} />
              : <Text style={s.saveText}>Save contact</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ModalHeader({ title, onClose }) {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
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

function makeStyles(t) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: t.border,
      backgroundColor: t.surface,
    },
    headerClose: { fontSize: 15, color: t.accent, fontWeight: '600' },
    headerTitle: { fontSize: 15, fontWeight: '600', color: t.navy },
    body: { padding: 20, gap: 4 },
    label: { fontSize: 12, fontWeight: '600', color: t.slate, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
    input: {
      backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
      borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 15, color: t.navy,
    },
    error: {
      color: t.danger, fontSize: 13, padding: 10,
      backgroundColor: 'rgba(255,107,107,0.08)', borderRadius: 6,
    },
    saveBtn: {
      backgroundColor: t.cta, borderRadius: 10,
      paddingVertical: 14, alignItems: 'center', marginTop: 24,
    },
    saveText: { color: t.ctaText, fontSize: 15, fontWeight: '600' },
  });
}
