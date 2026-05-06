import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '../../lib/api';

export default function NewContact() {
  const router = useRouter();
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
            placeholderTextColor="#b8c4d8"
            autoCapitalize="words"
            autoFocus
          />

          <Text style={s.label}>Phone</Text>
          <TextInput
            style={s.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="(503) 555-0123"
            placeholderTextColor="#b8c4d8"
            keyboardType="phone-pad"
            autoComplete="tel"
          />

          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            placeholder="linda@example.com"
            placeholderTextColor="#b8c4d8"
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
              ? <ActivityIndicator color="#0f1629" />
              : <Text style={s.saveText}>Save contact</Text>}
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
  body: { padding: 20, gap: 4 },
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
  saveBtn: {
    backgroundColor: '#00d68f', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 24,
  },
  saveText: { color: '#0f1629', fontSize: 15, fontWeight: '600' },
});
