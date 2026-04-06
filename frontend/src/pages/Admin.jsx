import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import { useNavigate } from 'react-router-dom';

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && !user.is_admin) navigate('/');
  }, [user]);

  const [tab, setTab] = useState('overview');

  if (!user?.is_admin) return null;

  return (
    <div style={{ padding: '32px', maxWidth: 1100 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 4 }}>
          Admin
        </h1>
        <p style={{ color: 'var(--slate)', fontSize: 14 }}>
          Internal dashboard — visible to admins only.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'users', label: 'Users' },
          { id: 'errors', label: 'Source Errors' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', border: 'none', cursor: 'pointer',
            background: 'none', fontSize: 14, fontWeight: 500,
            color: tab === t.id ? 'var(--navy)' : 'var(--slate)',
            borderBottom: tab === t.id ? '2px solid var(--navy)' : '2px solid transparent',
            marginBottom: -1, transition: 'all 0.15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'errors' && <ErrorsTab />}
    </div>
  );
}

function useAdminFetch(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(url, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('sc_token')}` }
    })
      .then(r => r.json())
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [url]);

  return { data, loading, error };
}

// ---- Overview ----
function OverviewTab() {
  const { data, loading } = useAdminFetch('/api/admin/stats');

  if (loading) return <Spinner />;

  const stats = [
    { label: 'Total users', value: data?.total_users ?? 0 },
    { label: 'Premium users', value: data?.premium_users ?? 0 },
    { label: 'Free users', value: data?.free_users ?? 0 },
    { label: 'MRR', value: `$${data?.mrr ?? 0}` },
    { label: 'Active sources', value: data?.active_sources ?? 0 },
    { label: 'New last 7 days', value: data?.new_last_7d ?? 0 },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
      {stats.map(s => (
        <div key={s.label} className="card" style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 4 }}>
            {s.value}
          </div>
          <div style={{ fontSize: 13, color: 'var(--slate)' }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ---- Users ----
function UsersTab() {
  const [search, setSearch] = useState('');
  const [plan, setPlan]     = useState('');
  const [selected, setSelected] = useState(null);
  const [users, setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (plan)   params.set('plan', plan);

    fetch(`/api/admin/users?${params}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('sc_token')}` }
    })
      .then(r => r.json())
      .then(d => setUsers(d.users || []))
      .finally(() => setLoading(false));
  }, [search, plan]);

  async function updatePlan(userId, newPlan) {
    await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('sc_token')}`,
      },
      body: JSON.stringify({ plan: newPlan }),
    });
    setUsers(u => u.map(x => x.id === userId ? { ...x, plan: newPlan } : x));
    if (selected?.id === userId) setSelected(s => ({ ...s, plan: newPlan }));
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          className="input" placeholder="Search by name or email…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <select className="input" value={plan} onChange={e => setPlan(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="">All plans</option>
          <option value="free">Free</option>
          <option value="premium">Premium</option>
        </select>
      </div>

      {loading ? <Spinner /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['Name', 'Email', 'Plan', 'Members', 'Sources', 'Last sync', 'Signed up', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12,
                                       fontWeight: 600, color: 'var(--slate)', textTransform: 'uppercase',
                                       letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--off-white)'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{u.name}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--slate)' }}>{u.email}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: u.plan === 'premium' ? 'rgba(0,214,143,0.1)' : 'var(--off-white)',
                      color: u.plan === 'premium' ? 'var(--accent-dim)' : 'var(--slate)',
                      border: u.plan === 'premium' ? '1px solid rgba(0,214,143,0.3)' : '1px solid var(--border)',
                    }}>
                      {u.plan}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--slate)', textAlign: 'center' }}>{u.kid_count}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--slate)', textAlign: 'center' }}>{u.source_count}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--slate)', whiteSpace: 'nowrap' }}>
                    {u.last_sync ? timeAgo(new Date(u.last_sync)) : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--slate)', whiteSpace: 'nowrap' }}>
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => setSelected(u)}
                        style={{ fontSize: 11, padding: '2px 8px' }}>
                        View
                      </button>
                      {u.plan === 'free' ? (
                        <button className="btn btn-sm" onClick={() => updatePlan(u.id, 'premium')}
                          style={{ fontSize: 11, padding: '2px 8px', background: 'var(--accent)',
                                   color: 'var(--navy)', border: 'none' }}>
                          → Premium
                        </button>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => updatePlan(u.id, 'free')}
                          style={{ fontSize: 11, padding: '2px 8px', color: 'var(--slate)' }}>
                          → Free
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--slate)', padding: 40 }}>No users found.</p>
          )}
        </div>
      )}

      {selected && <UserDetail user={selected} onClose={() => setSelected(null)} onPlanChange={updatePlan} />}
    </div>
  );
}

// ---- User Detail Modal ----
function UserDetail({ user, onClose, onPlanChange }) {
  const { data, loading } = useAdminFetch(`/api/admin/users/${user.id}`);
  const feedUrl = `https://www.sportscalapp.com/feed/${data?.user?.feed_token}.ics`;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,22,41,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 20,
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 640, padding: 32, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{user.name}</h2>
            <p style={{ fontSize: 14, color: 'var(--slate)' }}>{user.email}</p>
          </div>
          <button onClick={onClose} style={{ fontSize: 22, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)' }}>×</button>
        </div>

        {loading ? <Spinner /> : (
          <>
            {/* User info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              {[
                { label: 'Plan', value: data?.user?.plan },
                { label: 'Signed up', value: new Date(data?.user?.created_at).toLocaleDateString() },
                { label: 'Family members', value: data?.kids?.length ?? 0 },
                { label: 'Sources', value: data?.sources?.length ?? 0 },
                { label: 'Stripe customer', value: data?.user?.stripe_customer_id || '—' },
                { label: 'Admin', value: data?.user?.is_admin ? 'Yes' : 'No' },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--off-white)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Feed URL */}
            {data?.user?.feed_token && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Feed URL</div>
                <div style={{ background: 'var(--off-white)', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontFamily: 'var(--mono)', wordBreak: 'break-all', color: 'var(--slate)' }}>
                  {feedUrl}
                </div>
                <a href={feedUrl} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 13, color: 'var(--accent-dim)', marginTop: 4, display: 'inline-block' }}>
                  Test feed →
                </a>
              </div>
            )}

            {/* Sources */}
            {data?.sources?.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Sources</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.sources.map(s => (
                    <div key={s.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px', background: 'var(--off-white)', borderRadius: 8,
                      borderLeft: `3px solid ${s.last_fetch_status === 'error' ? '#ef4444' : 'var(--accent)'}`,
                    }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--slate)' }}>
                          {s.app} · {s.event_count} events
                          {s.last_fetch_status === 'error' && (
                            <span style={{ color: '#ef4444', marginLeft: 8 }}>⚠ Error</span>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--slate)', textAlign: 'right' }}>
                        {s.last_fetched_at ? timeAgo(new Date(s.last_fetched_at)) : 'Never'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              {data?.user?.plan === 'free' ? (
                <button className="btn btn-primary btn-sm"
                  onClick={() => onPlanChange(user.id, 'premium')}>
                  Upgrade to Premium
                </button>
              ) : (
                <button className="btn btn-ghost btn-sm"
                  onClick={() => onPlanChange(user.id, 'free')}>
                  Downgrade to Free
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- Source Errors ----
function ErrorsTab() {
  const { data, loading } = useAdminFetch('/api/admin/sources');

  if (loading) return <Spinner />;

  const sources = data?.sources || [];

  return (
    <div>
      <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 20 }}>
        Sources with errors — {sources.length} found.
      </p>
      {sources.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
          <p style={{ color: 'var(--slate)' }}>No source errors. Everything is syncing correctly.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sources.map(s => (
            <div key={s.id} className="card" style={{ padding: '16px 20px', borderLeft: '3px solid #ef4444' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 2 }}>{s.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--slate)' }}>
                    {s.user_name} ({s.user_email}) · {s.app}
                  </div>
                  {s.last_fetch_error && (
                    <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6, fontFamily: 'var(--mono)' }}>
                      {s.last_fetch_error}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--slate)', textAlign: 'right', flexShrink: 0 }}>
                  {s.last_fetched_at ? timeAgo(new Date(s.last_fetched_at)) : 'Never'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <div className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  );
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
