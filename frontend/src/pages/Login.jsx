import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';

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
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: 'var(--navy)',
    }}>
      {/* Left panel — branding */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '60px',
        maxWidth: 480,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
          <div style={{
            width: 40, height: 40,
            background: 'var(--accent)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6.5" stroke="var(--navy)" strokeWidth="1.5"/>
              <path d="M8 1.5C8 1.5 5 5 5 8s3 6.5 3 6.5" stroke="var(--navy)" strokeWidth="1.5"/>
              <path d="M1.5 8h13" stroke="var(--navy)" strokeWidth="1.5"/>
            </svg>
          </div>
          <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--white)', letterSpacing: '-0.02em' }}>
            SportsCal
          </span>
        </div>

        <h1 style={{
          fontSize: 36,
          fontWeight: 600,
          color: 'var(--white)',
          letterSpacing: '-0.03em',
          lineHeight: 1.2,
          marginBottom: 16,
        }}>
          All your kids'<br />
          schedules,<br />
          <span style={{ color: 'var(--accent)' }}>one feed.</span>
        </h1>
        <p style={{ fontSize: 16, color: 'var(--slate)', lineHeight: 1.6 }}>
          Pull from TeamSnap, GameChanger, PlayMetrics, and more into a single calendar that works everywhere.
        </p>
      </div>

      {/* Right panel — form */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--off-white)',
        padding: '40px',
      }}>
        <div className="card fade-up" style={{ width: '100%', maxWidth: 400, padding: '40px' }}>
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
  );
}
