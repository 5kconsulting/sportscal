import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
  Pressable, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../lib/auth';

export default function Signup() {
  const { signup } = useAuth();
  const router = useRouter();
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed]     = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit() {
    if (!name.trim() || !email.trim() || !password) {
      setError('Please fill in every field.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!agreed) {
      setError('Please accept the Terms and Privacy Policy to continue.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await signup(name.trim(), email.trim(), password);
      // AuthGate handles navigation to (tabs) once user is set
    } catch (err) {
      setError(err.message || 'Could not create account.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={s.inner}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.logo}>SportsCal</Text>
          <Text style={s.tagline}>One calendar for every game, practice, and meet.</Text>

          <View style={s.card}>
            <Text style={s.h2}>Create your account</Text>

            {error ? <Text style={s.error}>{error}</Text> : null}

            <Text style={s.label}>Your name</Text>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={setName}
              placeholder="Alex"
              placeholderTextColor="#8896b0"
              autoComplete="name"
              autoCapitalize="words"
            />

            <Text style={s.label}>Email</Text>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#8896b0"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              autoCorrect={false}
            />

            <Text style={s.label}>Password</Text>
            <TextInput
              style={s.input}
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              placeholderTextColor="#8896b0"
              secureTextEntry
              autoComplete="new-password"
            />

            <Pressable
              onPress={() => setAgreed(a => !a)}
              style={s.checkRow}
              hitSlop={6}
            >
              <View style={[s.checkbox, agreed && s.checkboxOn]}>
                {agreed ? <Text style={s.checkmark}>✓</Text> : null}
              </View>
              <Text style={s.checkLabel}>
                I agree to the{' '}
                <Text
                  style={s.linkStrong}
                  onPress={() => Linking.openURL('https://www.sportscalapp.com/terms')}
                >
                  Terms
                </Text>
                {' '}and{' '}
                <Text
                  style={s.linkStrong}
                  onPress={() => Linking.openURL('https://www.sportscalapp.com/privacy')}
                >
                  Privacy Policy
                </Text>
              </Text>
            </Pressable>

            <TouchableOpacity
              style={[s.btn, (loading || !agreed) && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={loading || !agreed}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color="#0f1629" />
                : <Text style={s.btnText}>Create account</Text>}
            </TouchableOpacity>

            <Text style={s.freeNote}>Free plan: 2 family members and 2 sources.</Text>

            <TouchableOpacity
              onPress={() => router.replace('/login')}
              style={{ marginTop: 16, alignSelf: 'center' }}
            >
              <Text style={s.link}>
                Already have an account? <Text style={s.linkStrong}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#0f1629' },
  inner:  { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 40, justifyContent: 'center' },
  logo:   { fontSize: 28, fontWeight: '700', color: '#00d68f', letterSpacing: -0.5, textAlign: 'center' },
  tagline:{ fontSize: 14, color: '#8896b0', marginTop: 8, marginBottom: 32, textAlign: 'center' },
  card:   { backgroundColor: '#1a2540', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#243050' },
  h2:     { fontSize: 20, fontWeight: '600', color: '#ffffff', marginBottom: 20 },
  label:  { fontSize: 13, fontWeight: '500', color: '#b8c4d8', marginBottom: 6, marginTop: 12 },
  input:  {
    backgroundColor: '#0f1629', color: '#ffffff', fontSize: 15,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 8,
    borderWidth: 1, borderColor: '#243050',
  },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 18, gap: 10 },
  checkbox: {
    width: 20, height: 20, borderRadius: 4,
    borderWidth: 1, borderColor: '#4a5670',
    backgroundColor: '#0f1629',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn:{ backgroundColor: '#00d68f', borderColor: '#00d68f' },
  checkmark: { color: '#0f1629', fontSize: 13, fontWeight: '700', lineHeight: 14 },
  checkLabel:{ flex: 1, fontSize: 13, color: '#b8c4d8', lineHeight: 18 },
  btn:    { backgroundColor: '#00d68f', borderRadius: 10, paddingVertical: 14, marginTop: 22, alignItems: 'center' },
  btnText:{ color: '#0f1629', fontSize: 15, fontWeight: '600' },
  error:  {
    color: '#ff6b6b', fontSize: 13, marginBottom: 8,
    backgroundColor: 'rgba(255,107,107,0.08)',
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 6,
  },
  freeNote:   { fontSize: 12, color: '#8896b0', textAlign: 'center', marginTop: 14 },
  link:       { fontSize: 13, color: '#8896b0' },
  linkStrong: { color: '#00d68f', fontWeight: '500' },
});
