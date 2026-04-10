import { useSearchParams } from 'react-router-dom';
import { LogoMark } from '../components/LogoMark.jsx';

export default function LogisticsResponse() {
  const [params] = useSearchParams();
  const status = params.get('status');
  const name   = params.get('name') || 'You';
  const confirmed = status === 'confirmed';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--navy)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: 'var(--font)',
    }}>
      <div style={{
        background: 'var(--navy-light)',
        border: '1px solid var(--navy-mid)',
        borderRadius: 16,
        padding: '48px 40px',
        maxWidth: 420,
        width: '100%',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>
          {confirmed ? '✅' : '😔'}
        </div>

        <h1 style={{
          fontSize: 24, fontWeight: 600, color: 'var(--white)',
          letterSpacing: '-0.02em', marginBottom: 12,
        }}>
          {confirmed ? 'Thanks for confirming!' : 'No worries!'}
        </h1>

        <p style={{ fontSize: 15, color: 'var(--slate)', lineHeight: 1.6, marginBottom: 32 }}>
          {confirmed
            ? `${name} is all set. The family has been notified that you're confirmed for the ride.`
            : `${name} has let the family know you're unable to help this time. They'll make other arrangements.`
          }
        </p>

        <div style={{
          background: confirmed ? 'rgba(0,214,143,0.1)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${confirmed ? 'rgba(0,214,143,0.3)' : 'var(--navy-mid)'}`,
          borderRadius: 10,
          padding: '16px 20px',
          marginBottom: 32,
          fontSize: 14,
          color: confirmed ? 'var(--accent)' : 'var(--slate)',
          lineHeight: 1.5,
        }}>
          {confirmed
            ? '🚗 The family will be in touch with any details about the pickup or drop-off.'
            : '📱 The family will find another arrangement — no need to do anything else.'}
        </div>

        <p style={{ fontSize: 13, color: 'var(--slate)' }}>
          Powered by{' '}
          <a href="https://www.sportscalapp.com" style={{ color: 'var(--accent-dim)', textDecoration: 'none' }}>
            SportsCal
          </a>
          {' '}— family sports calendar made simple.
        </p>
      </div>
    </div>
  );
}
