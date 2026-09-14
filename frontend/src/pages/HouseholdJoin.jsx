import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { api } from '../lib/api.js';
import { LogoMark } from '../components/LogoMark.jsx';

// ============================================================
// /household/join?token=xxx
//
// Landing page for the magic link in the household-invite email.
// Public — works whether the recipient is signed in or not.
//
//   1. Fetch the invite preview so we can show "Jane invited you"
//   2. If not signed in → show Sign in / Sign up buttons that
//      preserve the token via ?next=/household/join?token=xxx
//   3. If signed in → show Accept button; POST /redeem on click
//   4. On success → /dashboard
// ============================================================
export default function HouseholdJoin() {
  const [params]    = useSearchParams();
  const navigate    = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const token = params.get('token') || '';

  const [invite, setInvite]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [accepting, setAcc]   = useState(false);

  useEffect(() => {
    if (!token) { setLoading(false); setError('This link is missing its invite token.'); return; }
    api.household.inviteInfo(token)
      .then(({ invite }) => setInvite(invite))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAccept() {
    setAcc(true); setError('');
    try {
      await api.household.redeem(token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
      setAcc(false);
    }
  }

  // Preserve the invite token through auth so the redemption flow
  // resumes automatically after sign-in.
  const nextParam = encodeURIComponent(`/household/join?token=${token}`);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--off-white)',
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                  padding: '40px 20px' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, justifyContent: 'center' }}>
          <LogoMark size={36} dark />
        </div>

        <div className="card fade-up" style={{ padding: '32px' }}>
          {loading || authLoading ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div className="spinner" style={{ margin: '0 auto' }} />
            </div>
          ) : error && !invite ? (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12, letterSpacing: '-0.02em' }}>
                Invite unavailable
              </h2>
              <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 20, lineHeight: 1.6 }}>
                {error}
              </p>
              <Link to="/" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
                Back to SportsCal
              </Link>
            </>
          ) : (
            <>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-dim)',
                          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Household invite
              </p>
              <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12, letterSpacing: '-0.02em' }}>
                {invite.invited_by_name} invited you to their SportsCal family
              </h2>
              <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 24, lineHeight: 1.6 }}>
                Accept and you'll share the same family calendar — kids, team feeds,
                pickups and dropoffs. Your existing account and calendars come with
                you.
              </p>

              {user ? (
                <>
                  <button type="button" onClick={handleAccept} disabled={accepting}
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
                    {accepting ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Accept invite'}
                  </button>
                  <p style={{ fontSize: 13, color: 'var(--slate)', textAlign: 'center', marginTop: 12 }}>
                    Signed in as {user.email}
                  </p>
                </>
              ) : (
                <>
                  <Link to={`/login?next=${nextParam}`} className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', padding: '12px', textDecoration: 'none' }}>
                    Sign in to accept
                  </Link>
                  <p style={{ fontSize: 13, color: 'var(--slate)', textAlign: 'center', marginTop: 12 }}>
                    New to SportsCal?{' '}
                    <Link to={`/signup?next=${nextParam}`} style={{ color: 'var(--accent-dim)', fontWeight: 500 }}>
                      Create an account
                    </Link>
                  </p>
                </>
              )}

              {error && (
                <p style={{ fontSize: 13, color: '#ef4444', marginTop: 12 }}>{error}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
