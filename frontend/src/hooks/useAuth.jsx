import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    // Restore user from cache immediately to prevent flash to login page
    try {
      const cached = localStorage.getItem('sc_user');
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const token = localStorage.getItem('sc_token');
    if (!token) { setLoading(false); return; }

    api.auth.me()
      .then(({ user }) => {
        setUser(user);
        localStorage.setItem('sc_user', JSON.stringify(user));
      })
      .catch(err => {
        // Only clear token on 401 (expired/invalid) not network errors
        if (err.message === 'Unauthorized' || err.message?.includes('401')) {
          localStorage.removeItem('sc_token');
          localStorage.removeItem('sc_user');
          setUser(null);
        }
        // Otherwise keep cached user and let them stay logged in
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const { token, user } = await api.auth.login({ email, password });
    localStorage.setItem('sc_token', token);
    localStorage.setItem('sc_user', JSON.stringify(user));
    setUser(user);
  }

  async function signup(name, email, password, referralSource = null, smsConsent = false) {
    const { token, user } = await api.auth.signup({
      name, email, password,
      referral_source: referralSource,
      sms_consent: smsConsent,
    });
    localStorage.setItem('sc_token', token);
    localStorage.setItem('sc_user', JSON.stringify(user));
    setUser(user);
  }

  function logout() {
    localStorage.removeItem('sc_token');
    localStorage.removeItem('sc_user');
    setUser(null);
  }

  function updateUser(data) {
    setUser(prev => {
      const updated = { ...prev, ...data };
      localStorage.setItem('sc_user', JSON.stringify(updated));
      return updated;
    });
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
