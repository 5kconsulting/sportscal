import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import './index.css';

import Layout          from './components/Layout.jsx';
import Login           from './pages/Login.jsx';
import Signup          from './pages/Signup.jsx';
import Dashboard       from './pages/Dashboard.jsx';
import Kids            from './pages/Kids.jsx';
import Sources         from './pages/Sources.jsx';
import Settings        from './pages/Settings.jsx';
import ForgotPassword  from './pages/ForgotPassword.jsx';
import ResetPassword   from './pages/ResetPassword.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div className="spinner" />
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

function RequireGuest({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/" replace /> : children;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"           element={<RequireGuest><Login /></RequireGuest>} />
          <Route path="/signup"          element={<RequireGuest><Signup /></RequireGuest>} />
          <Route path="/forgot-password" element={<RequireGuest><ForgotPassword /></RequireGuest>} />
          <Route path="/reset-password"  element={<ResetPassword />} />
          <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index          element={<Dashboard />} />
            <Route path="kids"    element={<Kids />} />
            <Route path="sources" element={<Sources />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>
);
