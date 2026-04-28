import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../lib/auth';
import { trackLogin } from '../lib/analytics';

export default function Login() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit() {
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      trackLogin('email');
      // Navigation handled by AuthGate
    } catch (err) {
      setError(err.message || 'Login failed');
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
        <View style={s.inner}>
          <Text style={s.logo}>SportsCal</Text>
          <Text style={s.tagline}>One calendar for every game, practice, and meet.</Text>

          <View style={s.card}>
            <Text style={s.h2}>Sign in</Text>

            {error ? <Text style={s.error}>{error}</Text> : null}

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
              placeholder="Your password"
              placeholderTextColor="#8896b0"
              secureTextEntry
              autoComplete="password"
            />

            <TouchableOpacity
              style={[s.btn, loading && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color="#0f1629" />
                : <Text style={s.btnText}>Sign in</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/signup')}
              style={{ marginTop: 18, alignSelf: 'center' }}
            >
              <Text style={s.link}>
                Don{'\u2019'}t have an account? <Text style={s.linkStrong}>Create one</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#0f1629' },
  inner:  { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  logo:   { fontSize: 28, fontWeight: '700', color: '#00d68f', letterSpacing: -0.5, textAlign: 'center' },
  tagline:{ fontSize: 14, color: '#8896b0', marginTop: 8, marginBottom: 40, textAlign: 'center' },
  card:   { backgroundColor: '#1a2540', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#243050' },
  h2:     { fontSize: 20, fontWeight: '600', color: '#ffffff', marginBottom: 20 },
  label:  { fontSize: 13, fontWeight: '500', color: '#b8c4d8', marginBottom: 6, marginTop: 12 },
  input:  {
    backgroundColor: '#0f1629', color: '#ffffff', fontSize: 15,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 8,
    borderWidth: 1, borderColor: '#243050',
  },
  btn:    { backgroundColor: '#00d68f', borderRadius: 10, paddingVertical: 14, marginTop: 24, alignItems: 'center' },
  btnText:{ color: '#0f1629', fontSize: 15, fontWeight: '600' },
  error:  {
    color: '#ff6b6b', fontSize: 13, marginBottom: 8,
    backgroundColor: 'rgba(255,107,107,0.08)',
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 6,
  },
  link:       { fontSize: 13, color: '#8896b0' },
  linkStrong: { color: '#00d68f', fontWeight: '500' },
});
