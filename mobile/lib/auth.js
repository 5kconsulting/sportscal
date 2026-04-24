import { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api } from './api';

const TOKEN_KEY = 'sc_token';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!token) { setLoading(false); return; }
        api.setToken(token);
        const { user } = await api.get('/api/auth/me');
        setUser(user);
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
    setUser(user);
  }

  async function logout() {
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
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
