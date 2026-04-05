import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { LogoMark } from '../components/LogoMark.jsx';

export default function Signup() {
  const { signup }    = useAuth();
  const navigate      = useNavigate();
  const [form, setForm]   = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signup(form.name, form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--navy)' }}>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '60px', maxWidth: 480,
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
          Stop juggling<br />five different<br />
          <span style={{ color: 'var(--accent)' }}>sports apps.</span>
        </h1>
        <p style={{ fontSize: 16, color: 'var(--slate)', lineHeight: 1.6 }}>
          Free to start. Add your kids, paste your iCal links, subscribe once in Apple or Google Calendar.
        </p>
      </div>

      <div style={{
        flex: 1, display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--off-white)', padding: '40px',
      }}>
        <div className="card fade-up" style={{ width: '100%', maxWidth: 400, padding: '40px' }}>
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
            <button type="submit" className="btn btn-primary"
              style={{ marginTop: 8, justifyContent: 'center', padding: '12px' }}
              disabled={loading}>
              {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Create account'}
            </button>
          </form>
          <p style={{ fontSize: 12, color: 'var(--slate-light)', marginTop: 20, textAlign: 'center' }}>
            Free plan includes 2 kids and 3 sources.
          </p>
        </div>
      </div>
    </div>
  );
}
