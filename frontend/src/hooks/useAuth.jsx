import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const token = localStorage.getItem('sc_token');
    if (!token) { setLoading(false); return; }

    api.auth.me()
      .then(({ user }) => setUser(user))
      .catch(() => localStorage.removeItem('sc_token'))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const { token, user } = await api.auth.login({ email, password });
    localStorage.setItem('sc_token', token);
    setUser(user);
  }

  async function signup(name, email, password) {
    const { token, user } = await api.auth.signup({ name, email, password });
    localStorage.setItem('sc_token', token);
    setUser(user);
  }

  function logout() {
    localStorage.removeItem('sc_token');
    setUser(null);
  }

  function updateUser(data) {
    setUser(prev => ({ ...prev, ...data }));
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
