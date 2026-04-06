import { useState } from 'react';

export function VerificationBanner({ user }) {
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);

  if (!user || user.email_verified) return null;

  async function resend() {
    setLoading(true);
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('sc_token')}` },
      });
      setSent(true);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      background: '#fef3c7',
      borderBottom: '1px solid #fcd34d',
      padding: '10px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      flexWrap: 'wrap',
      fontSize: 13,
    }}>
      <div style={{ color: '#92400e', fontWeight: 500 }}>
        📧 Please verify your email address to ensure you don't miss important notifications.
      </div>
      {sent ? (
        <span style={{ color: '#065f46', fontWeight: 500 }}>✓ Verification email sent!</span>
      ) : (
        <button onClick={resend} disabled={loading}
          style={{
            fontSize: 12, fontWeight: 600, padding: '5px 12px',
            background: '#d97706', color: 'white', border: 'none',
            borderRadius: 6, cursor: 'pointer', flexShrink: 0,
          }}>
          {loading ? 'Sending…' : 'Resend verification email'}
        </button>
      )}
    </div>
  );
}
