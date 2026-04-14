import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { LogoMark } from '../components/LogoMark.jsx';

export default function Signup() {
  const { signup }    = useAuth();
  const navigate      = useNavigate();
  const [searchParams] = useSearchParams();
  const referralSource = searchParams.get('ref') || null;
  const [form, setForm]   = useState({ name: '', email: '', password: '' });
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!agreed) { setError('Please accept the Terms of Service and Privacy Policy to continue.'); return; }
    setError('');
    setLoading(true);
    try {
      await signup(form.name, form.email, form.password, referralSource);
      navigate('/dashboard');
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
          </div>
          <h1 style={{
            fontSize: 36, fontWeight: 600, color: 'var(--white)',
            letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 16,
          }}>
            Stop juggling<br />five different<br />
            <span style={{ color: 'var(--accent)' }}>sports apps.</span>
          </h1>
          <p style={{ fontSize: 16, color: 'var(--slate)', lineHeight: 1.6 }}>
            Free to start. Add your kids, paste your iCal links, subscribe once in Apple or Google Calendar.
          </p>
        </div>

        {/* Right panel — form */}
        <div className="auth-form-wrap">
          <div style={{ width: '100%', maxWidth: 400 }}>
            {/* Mobile logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, justifyContent: 'center' }}>
              <LogoMark size={36} dark />
            </div>

            <div className="card fade-up" style={{ padding: '32px' }}>
              <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8, letterSpacing: '-0.02em' }}>
                Create your account
              </h2>
              <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 28 }}>
                Already have one?{' '}
                <Link to="/login" style={{ color: 'var(--accent-dim)', fontWeight: 500 }}>Sign in</Link>
              </p>

              {error && <div className="error-msg" style={{ marginBottom: 20 }}>{error}</div>}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="field">
                  <label>Your name</label>
                  <input className="input" type="text" placeholder="Alex"
                    value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    required autoFocus />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input className="input" type="email" placeholder="you@example.com"
                    value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    required />
                </div>
                <div className="field">
                  <label>Password</label>
                  <input className="input" type="password" placeholder="At least 8 characters"
                    value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    required minLength={8} />
                </div>
                <label style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  cursor: 'pointer', marginTop: 4,
                }}>
                  <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                    style={{ marginTop: 3, flexShrink: 0, accentColor: 'var(--accent)', width: 15, height: 15 }} />
                  <span style={{ fontSize: 13, color: 'var(--slate-light)', lineHeight: 1.5 }}>
                    I agree to the{' '}
                    <a href="/terms" target="_blank" style={{ color: 'var(--accent-dim)' }}>Terms of Service</a>
                    {' '}and{' '}
                    <a href="/privacy" target="_blank" style={{ color: 'var(--accent-dim)' }}>Privacy Policy</a>
                  </span>
                </label>

                <button type="submit" className="btn btn-primary"
                  style={{ marginTop: 4, justifyContent: 'center', padding: '12px', opacity: agreed ? 1 : 0.6 }}
                  disabled={loading || !agreed}>
                  {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Create account'}
                </button>
              </form>
              <p style={{ fontSize: 12, color: 'var(--slate-light)', marginTop: 20, textAlign: 'center' }}>
                Free plan includes 2 family members and 2 sources.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
