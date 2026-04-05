import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LogoMark } from '../components/LogoMark.jsx';

export default function ForgotPassword() {
  const [email, setEmail]     = useState('');
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, justifyContent: 'center' }}>
          <LogoMark size={36} />
          <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--white)', letterSpacing: '-0.02em' }}>
            SportsCal
          </span>
        </div>

        <div className="card fade-up" style={{ padding: '32px' }}>
          {sent ? (
            <>
              <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 16 }}>📬</div>
              <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12, textAlign: 'center', letterSpacing: '-0.02em' }}>
                Check your email
              </h2>
              <p style={{ fontSize: 15, color: 'var(--slate)', lineHeight: 1.6, textAlign: 'center', marginBottom: 24 }}>
                If <strong style={{ color: 'var(--navy)' }}>{email}</strong> has an account, you'll receive a reset link within a few minutes.
              </p>
              <Link to="/login" className="btn btn-ghost" style={{ display: 'block', textAlign: 'center', width: '100%', justifyContent: 'center' }}>
                Back to sign in
              </Link>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8, letterSpacing: '-0.02em' }}>
                Forgot your password?
              </h2>
              <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 28, lineHeight: 1.6 }}>
                Enter your email and we'll send you a reset link.
              </p>

              {error && <div className="error-msg" style={{ marginBottom: 20 }}>{error}</div>}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="field">
                  <label>Email</label>
                  <input className="input" type="email" placeholder="you@example.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                    required autoFocus />
                </div>
                <button type="submit" className="btn btn-primary"
                  style={{ justifyContent: 'center', padding: '12px' }}
                  disabled={loading}>
                  {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Send reset link'}
                </button>
              </form>

              <p style={{ marginTop: 20, textAlign: 'center', fontSize: 14, color: 'var(--slate)' }}>
                Remember it?{' '}
                <Link to="/login" style={{ color: 'var(--accent-dim)', fontWeight: 500 }}>Sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
