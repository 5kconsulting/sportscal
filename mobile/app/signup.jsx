import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
  Pressable, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { trackSignUp } from '../lib/analytics';
import { useTheme } from '../lib/theme';

export default function Signup() {
  const { signup } = useAuth();
  const router = useRouter();
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
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
      // Fire-and-forget — analytics never blocks navigation.
      trackSignUp('email');
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
              placeholderTextColor={t.slate}
              autoComplete="name"
              autoCapitalize="words"
            />

            <Text style={s.label}>Email</Text>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={t.slate}
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
              placeholderTextColor={t.slate}
              secureTextEntry
              autoComplete="new-password"
            />

            <Pressable
              onPress={() => setAgreed(a => !a)}
              style={s.checkRow}
              hitSlop={6}
            >
              <View style={[s.checkbox, agreed && s.checkboxOn]}>
                {agreed ? <Ionicons name="checkmark" size={14} color={t.onAccent} /> : null}
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
                ? <ActivityIndicator color={t.ctaText} />
                : <Text style={s.btnText}>Create account</Text>}
            </TouchableOpacity>

            {/* Plan reference removed for iOS App Store compliance with
                3.1.1 — Apple flags ANY in-app mention of "Free plan"
                because it implies a paid tier exists. Soft cap still
                enforced server-side; users discover paid options on web. */}
            <Text style={s.freeNote}>Get started with up to 2 kids and 2 calendars.</Text>

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

function makeStyles(t) {
  return StyleSheet.create({
    root:   { flex: 1, backgroundColor: t.navy },
    inner:  { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 40, justifyContent: 'center' },
    logo:   { fontSize: 28, fontWeight: '700', color: t.accentOnDark, letterSpacing: -0.5, textAlign: 'center' },
    tagline:{ fontSize: 14, color: t.slate, marginTop: 8, marginBottom: 32, textAlign: 'center' },
    card:   { backgroundColor: t.navyMid, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: t.navyMid },
    h2:     { fontSize: 20, fontWeight: '600', color: '#fff', marginBottom: 20 },
    label:  { fontSize: 13, fontWeight: '500', color: t.slateLight, marginBottom: 6, marginTop: 12 },
    input:  {
      backgroundColor: t.navy, color: '#fff', fontSize: 15,
      paddingHorizontal: 14, paddingVertical: 12, borderRadius: 8,
      borderWidth: 1, borderColor: t.navyMid,
    },
    checkRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 18, gap: 10 },
    checkbox: {
      width: 20, height: 20, borderRadius: 4,
      borderWidth: 1, borderColor: t.slate,
      backgroundColor: t.navy,
      alignItems: 'center', justifyContent: 'center',
      marginTop: 1,
    },
    checkboxOn:{ backgroundColor: t.accentOnDark, borderColor: t.accentOnDark },
    checkLabel:{ flex: 1, fontSize: 13, color: t.slateLight, lineHeight: 18 },
    btn:    { backgroundColor: t.cta, borderRadius: 10, paddingVertical: 14, marginTop: 22, alignItems: 'center' },
    btnText:{ color: t.ctaText, fontSize: 15, fontWeight: '600' },
    error:  {
      color: t.danger, fontSize: 13, marginBottom: 8,
      backgroundColor: 'rgba(255,107,107,0.08)',
      paddingHorizontal: 12, paddingVertical: 10, borderRadius: 6,
    },
    freeNote:   { fontSize: 12, color: t.slate, textAlign: 'center', marginTop: 14 },
    link:       { fontSize: 13, color: t.slate },
    linkStrong: { color: t.accentOnDark, fontWeight: '500' },
  });
}
