import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';

const NAV = [
  { to: '/',        label: 'Dashboard', icon: GridIcon },
  { to: '/kids',    label: 'Family',    icon: UsersIcon },
  { to: '/sources', label: 'Sources',   icon: LinkIcon },
  { to: '/settings',label: 'Settings',  icon: GearIcon },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ---- Sidebar ---- */}
      <aside style={{
        width: 'var(--sidebar-w)',
        background: 'var(--navy)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        padding: '0',
      }}>
        {/* Logo */}
        <div style={{ padding: '28px 24px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32,
              background: 'var(--accent)',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <BallIcon />
            </div>
            <span style={{
              fontSize: 17,
              fontWeight: 600,
              color: 'var(--white)',
              letterSpacing: '-0.02em',
            }}>SportsCal</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '0 12px' }}>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 8,
              marginBottom: 2,
              fontSize: 14,
              fontWeight: 500,
              color: isActive ? 'var(--navy)' : 'var(--slate)',
              background: isActive ? 'var(--accent)' : 'transparent',
              transition: 'all 0.15s',
            })}>
              {({ isActive }) => (
                <>
                  <Icon color={isActive ? 'var(--navy)' : 'var(--slate)'} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User + logout */}
        <div style={{
          padding: '16px',
          borderTop: '1px solid var(--navy-mid)',
          margin: '0 0 0 0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--navy-mid)',
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
              <div style={{ fontSize: 11, color: 'var(--slate)', textTransform: 'uppercase',
                            letterSpacing: '0.04em' }}>
                {user?.plan}
              </div>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-ghost btn-sm"
            style={{ width: '100%', justifyContent: 'center', color: 'var(--slate)' }}>
            Sign out
          </button>
        </div>
      </aside>

      {/* ---- Main content ---- */}
      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--off-white)' }}>
        <Outlet />
      </main>
    </div>
  );
}

// ---- Inline SVG icons ----
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
      <path d="M8.5 5.5L10 4A3.182 3.182 0 006.5 .5L5 2" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
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
