import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.jsx';

function UpgradeBanner() {
  const [loading, setLoading] = useState(false);

  async function handleUpgrade() {
    setLoading(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('sc_token')}`,
        },
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: 'linear-gradient(135deg, var(--navy) 0%, #1a3050 100%)',
      borderRadius: 12, padding: '16px 20px', marginBottom: 28,
      border: '1px solid rgba(0,214,143,0.2)',
      flexWrap: 'wrap', gap: 12,
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--white)', marginBottom: 2 }}>
          ⚡ Upgrade to Premium
        </div>
        <div style={{ fontSize: 13, color: 'var(--slate)' }}>
          Get 8 family members and 24 sources for $5/month.
        </div>
      </div>
      <button onClick={handleUpgrade} disabled={loading}
        className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}>
        {loading ? '…' : 'Upgrade — $5/mo'}
      </button>
    </div>
  );
}

const APP_OPTIONS = [
  { value: 'teamsnap',    label: 'TeamSnap',     fetchType: 'ical' },
  { value: 'gamechanger', label: 'GameChanger',  fetchType: 'ical' },
  { value: 'playmetrics', label: 'PlayMetrics',  fetchType: 'ical' },
  { value: 'teamsideline',label: 'TeamSideline', fetchType: 'ical' },
  { value: 'byga',        label: 'BYGA',         fetchType: 'ical' },
  { value: 'custom',      label: 'Custom iCal',  fetchType: 'ical' },
];

const APP_HELP = {
  teamsnap:    'In TeamSnap: More → Export Calendar → Copy the iCal link',
  gamechanger: 'In GameChanger: Schedule → Share → Copy iCal link',
  playmetrics: 'In PlayMetrics: Calendar → Subscribe → Copy link',
  teamsideline:'In TeamSideline: Schedule → Subscribe to Calendar → Copy link',
  byga:        'In BYGA: Find the iCal subscription link in your team calendar',
  custom:      'Paste any iCal (.ics) feed URL',
};

export default function Sources() {
  const { user } = useAuth();
  const [sources, setSources]     = useState([]);
  const [kids, setKids]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editingSource, setEditingSource] = useState(null);
  const [refreshing, setRefreshing] = useState({});
  const [error, setError]         = useState('');

  useEffect(() => {
    Promise.all([api.sources.list(), api.kids.list()])
      .then(([{ sources }, { kids }]) => { setSources(sources); setKids(kids); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleRefresh(id) {
    setRefreshing(r => ({ ...r, [id]: true }));
    try {
      await api.sources.refresh(id);
    } catch (err) {
      setError(err.message);
    } finally {
      setTimeout(() => setRefreshing(r => ({ ...r, [id]: false })), 1500);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this source? All events from it will be deleted.')) return;
    try {
      await api.sources.delete(id);
      setSources(s => s.filter(s => s.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleToggle(source) {
    try {
      const { source: updated } = await api.sources.update(source.id, { enabled: !source.enabled });
      setSources(s => s.map(x => x.id === source.id ? updated : x));
    } catch (err) {
      setError(err.message);
    }
  }

  function handleEdit(source) {
    setEditingSource(source);
    setShowForm(true);
  }

  function handleCancelForm() {
    setShowForm(false);
    setEditingSource(null);
  }

  return (
    <div style={{ padding: '40px', maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 4 }}>Sources</h1>
          <p style={{ color: 'var(--slate)', fontSize: 15 }}>
            Connect your sports apps and assign kids to each one.
          </p>
        </div>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => { setEditingSource(null); setShowForm(true); }}>
            + Add source
          </button>
        )}
      </div>

      {error && <div className="error-msg" style={{ marginBottom: 20 }}>{error}</div>}

      {user?.plan === 'free' && <UpgradeBanner />}

      {showForm && (
        <SourceForm
          kids={kids}
          initial={editingSource}
          onSave={async (data) => {
            try {
              if (editingSource) {
                const { source } = await api.sources.update(editingSource.id, data);
                setSources(s => s.map(x => x.id === editingSource.id ? source : x));
              } else {
                const { source } = await api.sources.create(data);
                setSources(s => [...s, source]);
              }
              setShowForm(false);
              setEditingSource(null);
            } catch (err) {
              setError(err.message);
            }
          }}
          onCancel={handleCancelForm}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      ) : sources.length === 0 && !showForm ? (
        <div className="card" style={{ padding: '60px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔗</div>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No sources yet</h3>
          <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 24, maxWidth: 320, margin: '0 auto 24px' }}>
            Add a source to pull schedules from TeamSnap, GameChanger, PlayMetrics, and others.
          </p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>Add first source</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sources.map(source => (
            <SourceCard key={source.id}
              source={source}
              onRefresh={() => handleRefresh(source.id)}
              onDelete={() => handleDelete(source.id)}
              onToggle={() => handleToggle(source)}
              onEdit={() => handleEdit(source)}
              refreshing={refreshing[source.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SourceCard({ source, onRefresh, onDelete, onToggle, onEdit, refreshing }) {
  const appInfo = APP_OPTIONS.find(a => a.value === source.app);
  const hasError = source.last_fetch_status === 'error';

  return (
    <div className="card" style={{
      padding: '16px',
      opacity: source.enabled ? 1 : 0.6,
      transition: 'opacity 0.2s',
    }}>
      {/* Top row: badge + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          padding: '3px 8px',
          background: 'var(--navy)',
          color: 'var(--accent)',
          borderRadius: 6,
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          flexShrink: 0,
        }}>
          {appInfo?.label || source.app}
        </div>
        <div style={{ fontSize: 15, fontWeight: 500, flex: 1, minWidth: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {source.name}
        </div>
      </div>

      {/* Kids */}
      {source.kids?.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {source.kids.map(kid => (
            <span key={kid.id} style={{
              fontSize: 12, padding: '2px 8px', borderRadius: 20,
              background: kid.color + '20', color: kid.color,
              border: `1px solid ${kid.color}40`, fontWeight: 500,
            }}>
              {kid.name}
            </span>
          ))}
        </div>
      )}

      {/* Status */}
      <div style={{ fontSize: 12, color: hasError ? 'var(--red)' : 'var(--slate)', marginBottom: 12 }}>
        {hasError
          ? `⚠ ${source.last_fetch_error || 'Last fetch failed'}`
          : source.last_fetched_at
            ? `✓ Synced ${timeAgo(source.last_fetched_at)} · ${source.last_event_count || 0} events`
            : 'Not yet synced'}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={onRefresh}
          disabled={refreshing} style={{ minWidth: 64 }}>
          {refreshing ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '↻ Sync'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onEdit}>Edit</button>
        <button className="btn btn-ghost btn-sm" onClick={onToggle}>
          {source.enabled ? 'Pause' : 'Resume'}
        </button>
        <button className="btn btn-danger btn-sm" onClick={onDelete}>Remove</button>
      </div>
    </div>
  );
}

function SourceForm({ kids, initial, onSave, onCancel }) {
  const isEditing = !!initial;
  const initialApp = initial?.app || 'teamsnap';
  const appInfo = APP_OPTIONS.find(a => a.value === initialApp);

  const [app, setApp]         = useState(initialApp);
  const [name, setName]       = useState(initial?.name || '');
  const [icalUrl, setIcalUrl] = useState(initial?.ical_url || '');
  const [kidIds, setKidIds]   = useState(initial?.kids?.map(k => k.id) || []);
  const [saving, setSaving]   = useState(false);

  const currentAppInfo = APP_OPTIONS.find(a => a.value === app);

  function toggleKid(id) {
    setKidIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const appLabels = { teamsnap:'TeamSnap', gamechanger:'GameChanger', playmetrics:'PlayMetrics', teamsideline:'TeamSideline', byga:'BYGA', custom:'Custom' };
    await onSave({
      name:       name || appLabels[app] || app,
      app,
      fetch_type: currentAppInfo?.fetchType || 'ical',
      ical_url:   icalUrl || null,
      kid_ids:    kidIds,
    });
    setSaving(false);
  }

  return (
    <div className="card fade-up" style={{ padding: '24px', marginBottom: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>
        {isEditing ? `Edit — ${initial.name}` : 'Add a source'}
      </h3>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {!isEditing && (
          <div className="field">
            <label>App</label>
            <select className="input" value={app} onChange={e => setApp(e.target.value)}>
              {APP_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {APP_HELP[app] && (
              <div style={{ fontSize: 13, color: 'var(--slate)', padding: '8px 12px',
                            background: 'var(--off-white)', borderRadius: 'var(--radius)',
                            border: '1px solid var(--border)', lineHeight: 1.5 }}>
                💡 {APP_HELP[app]}
              </div>
            )}
          </div>
        )}

        <div className="field">
          <label>Label <span style={{ color: 'var(--slate-light)' }}>(optional)</span></label>
          <input className="input" type="text"
            placeholder={`e.g. ${currentAppInfo?.label} — Emma Soccer`}
            value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div className="field">
          <label>iCal URL</label>
          <input className="input" type="text"
            placeholder="https:// or webcal://..."
            value={icalUrl} onChange={e => setIcalUrl(e.target.value)} />
        </div>

        {kids.length > 0 && (
          <div className="field">
            <label>Assign to kids</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {kids.map(kid => (
                <button key={kid.id} type="button" onClick={() => toggleKid(kid.id)}
                  style={{
                    padding: '6px 14px', borderRadius: 20, fontSize: 14, fontWeight: 500,
                    border: `2px solid ${kidIds.includes(kid.id) ? kid.color : 'var(--border)'}`,
                    background: kidIds.includes(kid.id) ? kid.color + '15' : 'transparent',
                    color: kidIds.includes(kid.id) ? kid.color : 'var(--slate)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                  {kidIds.includes(kid.id) ? '✓ ' : ''}{kid.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving
              ? <span className="spinner" style={{ width: 14, height: 14 }} />
              : isEditing ? 'Save changes' : 'Add source'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function timeAgo(dateStr) {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 2)  return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
