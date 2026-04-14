import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import * as Sentry from '@sentry/react';
import './index.css';

// Initialize Sentry
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.2,
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
});

import Layout          from './components/Layout.jsx';
import Login           from './pages/Login.jsx';
import Signup          from './pages/Signup.jsx';
import Dashboard       from './pages/Dashboard.jsx';
import Kids            from './pages/Kids.jsx';
import Sources         from './pages/Sources.jsx';
import Settings        from './pages/Settings.jsx';
import ForgotPassword  from './pages/ForgotPassword.jsx';
import ResetPassword   from './pages/ResetPassword.jsx';
import SetupAgent      from './pages/SetupAgent.jsx';
import Admin           from './pages/Admin.jsx';
import LogisticsResponse from './pages/LogisticsResponse.jsx';

function RequireGuest({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (user) return children;
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div className="spinner" />
    </div>
  );
  return <Navigate to="/login" replace />;
}

function LandingRedirect() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div className="spinner" />
    </div>
  );
  if (user) return <Navigate to="/dashboard" replace />;
  // Not logged in — show landing page via iframe trick or redirect
  window.location.href = '/landing/index.html';
  return null;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/"               element={<LandingRedirect />} />
          <Route path="/logistics-response" element={<LogisticsResponse />} />
          <Route path="/login"          element={<RequireGuest><Login /></RequireGuest>} />
          <Route path="/signup"         element={<RequireGuest><Signup /></RequireGuest>} />
          <Route path="/forgot-password" element={<RequireGuest><ForgotPassword /></RequireGuest>} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/admin"          element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index                element={<Admin />} />
          </Route>
          <Route path="/dashboard"      element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index                element={<Dashboard />} />
          </Route>
          <Route path="/"              element={<RequireAuth><Layout /></RequireAuth>}>
            <Route path="kids"         element={<Kids />} />
            <Route path="sources"      element={<Sources />} />
            <Route path="settings"     element={<Settings />} />
            <Route path="setup"        element={<SetupAgent onSourceAdded={() => {}} />} />  {/* ← add this */}
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>
);
