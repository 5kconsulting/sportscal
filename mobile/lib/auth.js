import { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api } from './api';
import { registerForPush, unregisterPushOnLogout } from './push';

import { loadLatestBeforeFirstRun } from './firstRunUpdate';

const TOKEN_KEY = 'sc_token';
// Set the first time anyone signs in or signs up on this device. Decides
// which screen a signed-out launch opens on: Create account for a brand-new
// install, Sign in for someone who has been here before.
const HAS_ACCOUNT_KEY = 'sc_has_account';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasAccountOnDevice, setHasAccountOnDevice] = useState(false);

  function rememberAccount() {
    setHasAccountOnDevice(true);
    SecureStore.setItemAsync(HAS_ACCOUNT_KEY, '1').catch(() => {});
  }

  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!token) {
          const known = await SecureStore.getItemAsync(HAS_ACCOUNT_KEY).catch(() => null);
          setHasAccountOnDevice(known === '1');
          // Brand-new install: grab the latest over-the-air update before
          // the first screen, so the first session isn't stuck on whatever
          // shipped in the App Store build. May restart the app.
          if (known !== '1') await loadLatestBeforeFirstRun();
          setLoading(false);
          return;
        }
        rememberAccount();
        api.setToken(token);
        const { user } = await api.get('/api/auth/me');
        setUser(user);
        // Fire-and-forget push registration on returning-user launch.
        // Won't ask permission again if already granted; will silently
        // skip on simulators (see lib/push.js).
        registerForPush();
      } catch (err) {
        await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
        api.setToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(email, password) {
    const { token, user } = await api.post('/api/auth/login', { email, password });
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    api.setToken(token);
    rememberAccount();
    setUser(user);
    registerForPush();
  }

  async function signup(name, email, password) {
    const { token, user } = await api.post('/api/auth/signup', {
      name, email, password,
      referral_source: 'ios_app',
    });
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    api.setToken(token);
    rememberAccount();
    setUser(user);
    // Permission prompt fires here on first signup — Apple's HIG is fine
    // with this since the user just intentionally created an account.
    registerForPush();
  }

  function updateUser(patch) {
    setUser(prev => prev ? { ...prev, ...patch } : prev);
  }

  async function logout() {
    // Awaited so the backend stops targeting this device before we
    // wipe the token. Failure is non-fatal — the next login will
    // overwrite the row anyway.
    await unregisterPushOnLogout().catch(() => {});
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
    api.setToken(null);
    setUser(null);
  }

  useEffect(() => {
    api.setUnauthorizedHandler(async () => {
      await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
      api.setToken(null);
      setUser(null);
    });
    return () => api.setUnauthorizedHandler(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, hasAccountOnDevice, login, signup, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
