import { createContext, useContext, useState, useEffect } from 'react';
import { api, setUnauthorizedHandler } from '../lib/api.js';

const AuthContext = createContext(null);

// Routes that don't require auth — never redirect away from these
// when a stray 401 fires (e.g. an out-of-band probe by some other
// hook firing after the user has already signed out). Otherwise the
// auto-logout would kick them off the login page back to the login
// page, which is harmless but creates a visible flicker.
const PUBLIC_PATHS = new Set([
  '/login', '/signup', '/forgot-password', '/reset-password',
  '/', '/privacy', '/terms', '/help',
]);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    // Restore user from cache immediately to prevent flash to login page
    try {
      const cached = localStorage.getItem('sc_user');
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  // Register the global 401 handler. When ANY authed API call comes
  // back 401, this clears localStorage + redirects to /login via a
  // full page reload (kills any stale React state from before the
  // session expired). Replaces the manual 401 handling that used to
  // live in the session-restore useEffect below.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      // Skip if we're already on a public page — no point bouncing
      // login → login.
      if (PUBLIC_PATHS.has(window.location.pathname)) return;
      localStorage.removeItem('sc_token');
      localStorage.removeItem('sc_user');
      // Full reload via location.replace clears React state, in-flight
      // fetches, and any cached component data. Cheaper than wiring a
      // synthetic global state-reset.
      window.location.replace('/login');
    });
    // Clear on unmount (defensive — AuthProvider is a singleton at
    // the root so this is mostly belt-and-suspenders).
    return () => setUnauthorizedHandler(null);
  }, []);

  // Restore session on mount. The api client's 401 handler above now
  // takes care of clearing the token + redirecting on auth failure,
  // so this only needs the happy-path.
  useEffect(() => {
    const token = localStorage.getItem('sc_token');
    if (!token) { setLoading(false); return; }

    api.auth.me()
      .then(({ user }) => {
        setUser(user);
        localStorage.setItem('sc_user', JSON.stringify(user));
      })
      .catch(() => {
        // 401 is already handled globally — falls through to here for
        // network errors etc. Keep cached user; they stay signed in
        // until the next API attempt confirms or denies.
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
