import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LogoMark } from '../components/LogoMark.jsx';

export default function ResetPassword() {
  const [searchParams]        = useSearchParams();
  const navigate              = useNavigate();
  const token                 = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [done, setDone]         = useState(false);

  if (!token) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div className="card" style={{ padding: '32px', maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Invalid reset link</h2>
          <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 24 }}>This link is missing a reset token. Please request a new one.</p>
          <Link to="/forgot-password" className="btn btn-primary" style={{ display: 'inline-flex' }}>Request new link</Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      setDone(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, justifyContent: 'center' }}>
          <LogoMark size={36} />
          <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--white)', letterSpacing: '-0.02em' }}>SportsCal</span>
        </div>

        <div className="card fade-up" style={{ padding: '32px' }}>
          {done ? (
            <>
              <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 16 }}>✅</div>
              <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12, textAlign: 'center' }}>Password updated!</h2>
              <p style={{ fontSize: 15, color: 'var(--slate)', textAlign: 'center', lineHeight: 1.6 }}>
                Redirecting you to sign in...
              </p>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8, letterSpacing: '-0.02em' }}>
                Set a new password
              </h2>
              <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 28 }}>
                Choose a strong password of at least 8 characters.
              </p>

              {error && <div className="error-msg" style={{ marginBottom: 20 }}>{error}</div>}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="field">
                  <label>New password</label>
                  <input className="input" type="password" placeholder="At least 8 characters"
                    value={password} onChange={e => setPassword(e.target.value)}
                    required minLength={8} autoFocus />
                </div>
                <div className="field">
                  <label>Confirm password</label>
                  <input className="input" type="password" placeholder="Same password again"
                    value={confirm} onChange={e => setConfirm(e.target.value)}
                    required minLength={8} />
                </div>
                <button type="submit" className="btn btn-primary"
                  style={{ justifyContent: 'center', padding: '12px' }}
                  disabled={loading}>
                  {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Update password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
