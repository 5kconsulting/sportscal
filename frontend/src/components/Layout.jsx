import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { LogoMark } from './LogoMark.jsx';
import { VerificationBanner } from './VerificationBanner.jsx';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: GridIcon },
  { to: '/kids',      label: 'Family',    icon: UsersIcon },
  { to: '/sources',   label: 'Sources',   icon: LinkIcon },
  { to: '/settings',  label: 'Settings',  icon: GearIcon },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isImpersonating = !!localStorage.getItem('sc_admin_token');

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function handleRestoreAdmin() {
    const adminToken = localStorage.getItem('sc_admin_token');
    const adminUser  = localStorage.getItem('sc_admin_user');
    localStorage.setItem('sc_token', adminToken);
    localStorage.setItem('sc_user', adminUser);
    localStorage.removeItem('sc_admin_token');
    localStorage.removeItem('sc_admin_user');
    window.location.href = '/admin';
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <style>{`
        @media (max-width: 768px) {
          .sidebar { display: none !important; }
          .bottom-nav { display: flex !important; }
          .main-content { padding-bottom: 70px !important; }
          .page-pad { padding: 20px 16px !important; }
          .hide-mobile { display: none !important; }
        }
        @media (min-width: 769px) {
          .bottom-nav { display: none !important; }
        }
      `}</style>

      {/* Impersonation banner */}
      {isImpersonating && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999,
          background: '#f59e0b', color: '#1a1a1a',
          padding: '8px 16px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 16, fontSize: 13, fontWeight: 600,
        }}>
          👤 You are logged in as <strong>{user?.name}</strong> ({user?.email})
          <button onClick={handleRestoreAdmin} style={{
            background: '#1a1a1a', color: '#f59e0b', border: 'none',
            borderRadius: 6, padding: '4px 12px', fontSize: 12,
            fontWeight: 700, cursor: 'pointer',
          }}>
            ← Back to Admin
          </button>
        </div>
      )}

      {/* Sidebar (desktop) */}
      <aside className="sidebar" style={{
        width: 'var(--sidebar-w)',
        background: 'var(--navy)',
        marginTop: isImpersonating ? '37px' : 0,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        <div style={{ padding: '20px 24px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LogoMark size={32} />
            <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--white)', letterSpacing: '-0.02em' }}>
              SportsCal
            </span>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '0 12px' }}>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8, marginBottom: 2,
              fontSize: 14, fontWeight: 500,
              color: isActive ? 'var(--navy)' : 'var(--slate)',
              background: isActive ? 'var(--accent)' : 'transparent',
              transition: 'all 0.15s', textDecoration: 'none',
            })}>
              {({ isActive }) => (
                <>
                  <Icon color={isActive ? 'var(--navy)' : 'var(--slate)'} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
          {user?.is_admin && (
            <NavLink to="/admin" style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8, marginTop: 8,
              fontSize: 14, fontWeight: 500,
              color: isActive ? 'var(--navy)' : 'var(--slate)',
              background: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.04)',
              transition: 'all 0.15s', textDecoration: 'none',
              border: '1px solid rgba(255,255,255,0.08)',
            })}>
              {({ isActive }) => (
                <>
                  <ShieldIcon color={isActive ? 'var(--navy)' : 'var(--slate)'} />
                  Admin
                </>
              )}
            </NavLink>
          )}
        </nav>

        <div style={{ padding: '16px', borderTop: '1px solid var(--navy-mid)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: 'var(--navy-mid)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 600, color: 'var(--slate-light)',
            }}>
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--white)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {user?.plan}
              </div>
            </div>
          </div>
          <a href="https://linear.app/sportscal/new?template=fe41dd70-719e-4ffb-b054-86a35515f038"
             target="_blank" rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', padding: '8px 12px', borderRadius: 8, marginBottom: 2,
              fontSize: 13, color: 'var(--slate)', textDecoration: 'none',
              background: 'transparent', transition: 'color 0.15s',
            }}
            onMouseOver={e => e.currentTarget.style.color = 'var(--white)'}
            onMouseOut={e => e.currentTarget.style.color = 'var(--slate)'}
          >
            💡 Feature request
          </a>
          <a href="https://linear.app/sportscal/new?template=77b9401f-4f21-4447-8c74-71517cbfda1a"
             target="_blank" rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', padding: '8px 12px', borderRadius: 8, marginBottom: 6,
              fontSize: 13, color: 'var(--slate)', textDecoration: 'none',
              background: 'transparent', transition: 'color 0.15s',
            }}
            onMouseOver={e => e.currentTarget.style.color = 'var(--white)'}
            onMouseOut={e => e.currentTarget.style.color = 'var(--slate)'}
          >
            🐛 Report a bug
          </a>
          <a href="mailto:hello@sportscalapp.com"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', padding: '8px 12px', borderRadius: 8, marginBottom: 6,
              fontSize: 13, color: 'var(--slate)', textDecoration: 'none',
              background: 'transparent', transition: 'color 0.15s',
            }}
            onMouseOver={e => e.currentTarget.style.color = 'var(--white)'}
            onMouseOut={e => e.currentTarget.style.color = 'var(--slate)'}
          >
            <HelpIcon color="currentColor" /> Help & support
          </a>
          <button onClick={handleLogout} className="btn btn-ghost btn-sm"
            style={{ width: '100%', justifyContent: 'center', color: 'var(--slate)' }}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content" style={{ flex: 1, overflowY: 'auto', background: 'var(--off-white)' }}>
        <VerificationBanner user={user} />
        <Outlet />
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="bottom-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--navy)',
        borderTop: '1px solid var(--navy-mid)',
        display: 'none',
        justifyContent: 'space-around',
        alignItems: 'center',
        padding: '8px 0 max(8px, env(safe-area-inset-bottom))',
        zIndex: 50,
      }}>
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => ({
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 3, padding: '4px 12px', borderRadius: 8,
            color: isActive ? 'var(--accent)' : 'var(--slate)',
            textDecoration: 'none', transition: 'color 0.15s',
            minWidth: 56,
          })}>
            {({ isActive }) => (
              <>
                <Icon color={isActive ? 'var(--accent)' : 'var(--slate)'} />
                <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.02em' }}>
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
        {user?.is_admin && (
          <NavLink to="/admin" style={({ isActive }) => ({
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 3, padding: '4px 12px', borderRadius: 8,
            color: isActive ? 'var(--accent)' : 'var(--slate)',
            textDecoration: 'none', transition: 'color 0.15s',
            minWidth: 56,
          })}>
            {({ isActive }) => (
              <>
                <ShieldIcon color={isActive ? 'var(--accent)' : 'var(--slate)'} />
                <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.02em' }}>Admin</span>
              </>
            )}
          </NavLink>
        )}
      </nav>
    </div>
  );
}

function HelpIcon({ color = 'currentColor' }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.5"/>
      <path d="M6.5 6.5C6.5 5.7 7.1 5 8 5s1.5.6 1.5 1.4c0 .8-.5 1.2-1 1.6-.4.3-.5.6-.5 1" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="8" cy="11" r="0.75" fill={color}/>
    </svg>
  );
}

function ShieldIcon({ color = 'currentColor' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5L2 4v4c0 3 2.5 5.5 6 6 3.5-.5 6-3 6-6V4L8 1.5z" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M5.5 8l1.5 1.5 3-3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function GridIcon({ color = 'currentColor' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1.5" stroke={color} strokeWidth="1.5"/>
      <rect x="9" y="1" width="6" height="6" rx="1.5" stroke={color} strokeWidth="1.5"/>
      <rect x="1" y="9" width="6" height="6" rx="1.5" stroke={color} strokeWidth="1.5"/>
      <rect x="9" y="9" width="6" height="6" rx="1.5" stroke={color} strokeWidth="1.5"/>
    </svg>
  );
}
function UsersIcon({ color = 'currentColor' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="5" r="2.5" stroke={color} strokeWidth="1.5"/>
      <path d="M1 13c0-2.761 2.239-4 5-4s5 1.239 5 4" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M11 7.5c1.5 0 3 .9 3 3" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="11" cy="4.5" r="2" stroke={color} strokeWidth="1.5"/>
    </svg>
  );
}
function LinkIcon({ color = 'currentColor' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6.5 9.5l3-3" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M5 7.5L3.5 9A3.182 3.182 0 007 12.5l1.5-1.5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M8.5 5.5L10 4A3.182 3.182 0 006.5.5L5 2" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function GearIcon({ color = 'currentColor' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2" stroke={color} strokeWidth="1.5"/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.414 1.414M11.536 11.536l1.414 1.414M3.05 12.95l1.414-1.414M11.536 4.464l1.414-1.414" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function BallIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="var(--navy)" strokeWidth="1.5"/>
      <path d="M8 1.5C8 1.5 5 5 5 8s3 6.5 3 6.5" stroke="var(--navy)" strokeWidth="1.5"/>
      <path d="M1.5 8h13" stroke="var(--navy)" strokeWidth="1.5"/>
    </svg>
  );
}
