import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { LogoMark } from '../components/LogoMark.jsx';

export default function Login() {
  const { login }     = useAuth();
  const navigate      = useNavigate();
  const [form, setForm]   = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy)' }}>
      <style>{`
        @media (min-width: 769px) {
          .auth-wrap { display: flex !important; }
          .auth-brand { display: flex !important; }
          .auth-form-wrap { flex: 1; display: flex; align-items: center; justify-content: center; background: var(--off-white); padding: 40px; }
        }
        @media (max-width: 768px) {
          .auth-brand { display: none !important; }
          .auth-form-wrap { background: var(--off-white); min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 40px 20px; }
        }
      `}</style>

      <div className="auth-wrap" style={{ minHeight: '100vh' }}>
        {/* Left panel — branding (desktop only) */}
        <div className="auth-brand" style={{
          flex: 1, maxWidth: 480,
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '60px',
          display: 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
            <LogoMark size={40} />
            <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--white)', letterSpacing: '-0.02em' }}>
              SportsCal
            </span>
          </div>
          <h1 style={{
            fontSize: 36, fontWeight: 600, color: 'var(--white)',
            letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 16,
          }}>
            All your kids'<br />schedules,<br />
            <span style={{ color: 'var(--accent)' }}>one feed.</span>
          </h1>
          <p style={{ fontSize: 16, color: 'var(--slate)', lineHeight: 1.6 }}>
            Pull from TeamSnap, GameChanger, PlayMetrics, and more into a single calendar that works everywhere.
          </p>
        </div>

        {/* Right panel — form */}
        <div className="auth-form-wrap">
          <div style={{ width: '100%', maxWidth: 400 }}>
            {/* Mobile logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, justifyContent: 'center' }}>
              <LogoMark size={36} />
              <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--navy)', letterSpacing: '-0.02em' }}>
                SportsCal
              </span>
            </div>

            <div className="card fade-up" style={{ padding: '32px' }}>
              <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8, letterSpacing: '-0.02em' }}>
                Sign in
              </h2>
              <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 28 }}>
                Don't have an account?{' '}
                <Link to="/signup" style={{ color: 'var(--accent-dim)', fontWeight: 500 }}>
                  Sign up free
                </Link>
              </p>

              {error && <div className="error-msg" style={{ marginBottom: 20 }}>{error}</div>}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="field">
                  <label>Email</label>
                  <input className="input" type="email" placeholder="you@example.com"
                    value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    required autoFocus />
                </div>
                <div className="field">
                  <label>Password</label>
                  <input className="input" type="password" placeholder="••••••••"
                    value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    required />
                  <div style={{ textAlign: 'right', marginTop: 4 }}>
                    <Link to="/forgot-password" style={{ fontSize: 13, color: 'var(--accent-dim)', fontWeight: 500 }}>
                      Forgot password?
                    </Link>
                  </div>
                </div>
                <button type="submit" className="btn btn-primary"
                  style={{ marginTop: 8, justifyContent: 'center', padding: '12px' }}
                  disabled={loading}>
                  {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Sign in'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
