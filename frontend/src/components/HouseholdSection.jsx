import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// ============================================================
// HouseholdSection
//
// Renders in Settings. Shows current members + pending invites,
// and — when HOUSEHOLD_INVITES_ENABLED is on server-side — the
// invite form. When the feature flag is off the section still
// renders so the user can see who's in their household today
// (usually just themselves post-backfill), but the invite form
// is hidden.
// ============================================================
export default function HouseholdSection({ currentUserId }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [inviteEmail, setEmail] = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');
  const [flash, setFlash]       = useState('');

  async function load() {
    try {
      const res = await api.household.members();
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleInvite(e) {
    e.preventDefault();
    setError(''); setFlash(''); setBusy(true);
    try {
      await api.household.invite(inviteEmail);
      setEmail('');
      setFlash('Invite sent — they\'ll get an email in a moment.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(token) {
    if (!confirm('Cancel this invite?')) return;
    setError(''); setFlash(''); setBusy(true);
    try {
      await api.household.revokeInvite(token);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(userId, name) {
    const self = userId === currentUserId;
    const prompt = self
      ? 'Leave this household? You\'ll go back to a household of just you. Your kids and calendars come with you.'
      : `Remove ${name} from your household? They keep their own account and any calendars they added.`;
    if (!confirm(prompt)) return;
    setError(''); setFlash(''); setBusy(true);
    try {
      await api.household.removeMember(userId);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;
  if (!data) return null;

  const { members = [], pending_invites = [], invites_enabled, max_members = 2 } = data;
  const roomLeft = Math.max(0, max_members - members.length);

  return (
    <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--slate)',
                   textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
        Household
      </h2>
      <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 16, lineHeight: 1.6 }}>
        Share your family's calendar with a co-parent. You'll both see the same kids,
        team feeds, and events. Kids and calendars come with each parent's account.
      </p>

      {/* Members */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {members.map(m => (
          <div key={m.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500 }}>
                {m.name}
                {m.id === currentUserId && (
                  <span style={{ fontSize: 12, color: 'var(--slate)', marginLeft: 8 }}>you</span>
                )}
                {m.role === 'owner' && m.id !== currentUserId && (
                  <span style={{ fontSize: 12, color: 'var(--slate)', marginLeft: 8 }}>owner</span>
                )}
              </div>
              <div style={{ fontSize: 13, color: 'var(--slate)' }}>{m.email}</div>
            </div>
            {members.length > 1 && (
              <button type="button" onClick={() => handleRemove(m.id, m.name)}
                disabled={busy}
                className="btn btn-ghost btn-sm"
                style={{ color: '#ef4444' }}>
                {m.id === currentUserId ? 'Leave' : 'Remove'}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Pending invites */}
      {pending_invites.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)',
                        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Pending invites
          </div>
          {pending_invites.map(inv => (
            <div key={inv.token} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px', border: '1px dashed var(--border)', borderRadius: 'var(--radius)',
              marginBottom: 6,
            }}>
              <div style={{ fontSize: 14 }}>
                {inv.invited_email}
                <span style={{ fontSize: 12, color: 'var(--slate)', marginLeft: 10 }}>
                  expires {new Date(inv.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <button type="button" onClick={() => handleRevoke(inv.token)}
                disabled={busy} className="btn btn-ghost btn-sm">
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Invite form */}
      {invites_enabled && roomLeft > 0 && (
        <form onSubmit={handleInvite} style={{
          display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap',
        }}>
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={e => setEmail(e.target.value)}
            placeholder="Co-parent's email"
            disabled={busy}
            style={{
              flex: 1, minWidth: 220, padding: '10px 12px',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              fontFamily: 'var(--font)', fontSize: 14,
            }}
          />
          <button type="submit" disabled={busy || !inviteEmail}
            className="btn btn-primary btn-sm">
            {busy ? 'Sending…' : 'Send invite'}
          </button>
        </form>
      )}

      {invites_enabled && roomLeft === 0 && (
        <p style={{ fontSize: 13, color: 'var(--slate)', margin: '8px 0 0' }}>
          Your household is full (2 members max). Remove one to invite someone else.
        </p>
      )}

      {!invites_enabled && (
        <p style={{ fontSize: 13, color: 'var(--slate)', margin: '8px 0 0' }}>
          Household invites are coming soon — you'll be able to add a co-parent here.
        </p>
      )}

      {error && (
        <p style={{ fontSize: 13, color: '#ef4444', margin: '10px 0 0' }}>{error}</p>
      )}
      {flash && (
        <p style={{ fontSize: 13, color: '#16a34a', margin: '10px 0 0' }}>{flash}</p>
      )}
    </div>
  );
}
