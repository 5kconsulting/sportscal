import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../lib/auth';

function AuthGate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router   = useRouter();

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
        name="contacts/picker"
        options={{ presentation: 'modal', headerShown: false }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <AuthGate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
