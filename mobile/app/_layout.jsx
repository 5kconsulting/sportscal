import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { AuthProvider, useAuth } from '../lib/auth';
import { requestTrackingPermission } from '../lib/analytics';

function AuthGate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router   = useRouter();
  // iOS Share Extension hand-off. When a parent shares a calendar URL or
  // schedule photo from Safari/Mail/Photos into SportsCal, the share
  // extension persists the payload and the host app reads it via this
  // hook on next launch/foreground. We route the user into /setup, which
  // owns the consume-and-process logic — see app/setup.jsx.
  //
  // Only routing happens here; setup.jsx calls resetShareIntent() once
  // the payload is in flight, so we don't bounce them back into setup
  // every time they navigate elsewhere.
  const { hasShareIntent } = useShareIntentContext();

  // Once auth state has resolved, ask for App Tracking Transparency.
  // Doing it here (rather than at app launch) means the prompt appears
  // after the user has seen the brand splash + login screen, which
  // satisfies Apple's "in context" expectation. requestTrackingPermission
  // dedupes per-process, so this useEffect is safe to fire repeatedly.
  useEffect(() => {
    if (loading) return;
    requestTrackingPermission();
  }, [loading]);

  useEffect(() => {
    if (loading) return;
    const first = segments[0];
    const onAuthScreen = first === 'login' || first === 'signup';

    if (!user && !onAuthScreen) {
      router.replace('/login');
    } else if (user && (onAuthScreen || !first)) {
      router.replace('/(tabs)');
    }
  }, [user, loading, segments]);

  // Whenever a share-extension payload arrives (cold launch or warm
  // foreground), bounce the signed-in user into /setup. setup.jsx reads
  // the same context, processes the payload, and calls resetShareIntent
  // once it's in flight. We use push() not replace() so the user can
  // tap close on the modal and return to wherever they were.
  useEffect(() => {
    if (loading || !user) return;
    if (!hasShareIntent) return;
    const first = segments[0];
    if (first === 'setup') return; // already there
    router.push('/setup');
  }, [hasShareIntent, user, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f1629' }}>
        <ActivityIndicator color="#00d68f" size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="event/[id]"
        options={{ presentation: 'modal', headerShown: false }}
      />
      <Stack.Screen
        name="event/new"
        options={{ presentation: 'modal', headerShown: false }}
      />
      <Stack.Screen
        name="contacts/picker"
        options={{ presentation: 'modal', headerShown: false }}
      />
      <Stack.Screen
        name="contacts/new"
        options={{ presentation: 'modal', headerShown: false }}
      />
      <Stack.Screen
        name="teams/new"
        options={{ presentation: 'modal', headerShown: false }}
      />
      <Stack.Screen
        name="teams/[id]"
        options={{ presentation: 'modal', headerShown: false }}
      />
      <Stack.Screen
        name="kids/new"
        options={{ presentation: 'modal', headerShown: false }}
      />
      <Stack.Screen
        name="kids/[id]"
        options={{ presentation: 'modal', headerShown: false }}
      />
      <Stack.Screen
        name="sources/index"
        options={{ presentation: 'modal', headerShown: false }}
      />
      <Stack.Screen
        name="sources/[id]"
        options={{ presentation: 'modal', headerShown: false }}
      />
      <Stack.Screen
        name="setup"
        options={{ presentation: 'modal', headerShown: false }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* ShareIntentProvider must wrap the whole app so useShareIntentContext
          works in any screen. The provider itself is a thin wrapper around
          the native module's event emitters; it has no UI and no overhead
          when nothing's being shared. */}
      <ShareIntentProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <AuthGate />
        </AuthProvider>
      </ShareIntentProvider>
    </SafeAreaProvider>
  );
}
