import { useState, useEffect, useMemo } from 'react';
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
          Get 8 family members and 24 calendars for $5/month.
        </div>
      </div>
      <button onClick={handleUpgrade} disabled={loading}
        className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}>
        {loading ? '…' : 'Upgrade — $5/mo'}
      </button>
    </div>
  );
}

const COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#14b8a6','#3b82f6','#8b5cf6','#ec4899',
  '#00d68f','#06b6d4','#f43f5e','#a855f7',
];

// Legible text (dark/white) on a filled kid-color card.
function textOn(hex) {
  const h = String(hex).replace('#', '');
  if (h.length !== 6) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#0f172a' : '#ffffff';
}
function dayKey(d) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }

export default function Kids() {
  const { user } = useAuth();
  const [kids, setKids]           = useState([]);
  const [events, setEvents]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError]         = useState('');

  useEffect(() => { loadKids(); }, []);

  async function loadKids() {
    try {
      const [{ kids }, ev] = await Promise.all([
        api.kids.list(),
        api.events.list({ days: 30 }).catch(() => ({ events: [] })),
      ]);
      setKids(kids);
      setEvents(ev.events || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Per-kid upcoming (30d) + a 7-day sparkline, derived from the resolved
  // events (same kid attribution the calendar uses).
  const stats = useMemo(() => {
    const now = new Date();
    const d7 = [];
    for (let i = 0; i < 7; i++) { const d = new Date(now); d.setDate(now.getDate() + i); d7.push(dayKey(d)); }
    const map = {};
    for (const ev of events) {
      const ek = Array.isArray(ev.kids) ? ev.kids : [];
      const k = dayKey(new Date(ev.starts_at));
      for (const kid of ek) {
        if (!map[kid.id]) map[kid.id] = { upcoming: 0, spark: Object.fromEntries(d7.map(x => [x, 0])) };
        map[kid.id].upcoming += 1;
        if (k in map[kid.id].spark) map[kid.id].spark[k] += 1;
      }
    }
    return { map, days: d7 };
  }, [events]);

  async function shareKidSchedule(kid) {
    if (!kid?.feed_token) {
      alert('This kid is missing a feed token — try reloading the page.');
      return;
    }
    // webcal:// is what makes Apple/Google Calendar prompt to
    // subscribe rather than just download the .ics. iMessage
    // tappifies the URL the same way it would an https:// link.
    const webcalUrl = `webcal://www.sportscalapp.com/feed/kid/${kid.feed_token}.ics`;
    const body = `Subscribe to your SportsCal schedule, ${kid.name}: ${webcalUrl}`;
    // sms: deep link works on Mac (iCloud Messages), iOS, Android.
    // Windows/Linux desktop typically have nothing registered for
    // sms:, so we fall back to copy-to-clipboard there. Same UA
    // detection pattern as the logistics fallback.
    const supportsSmsLink = /Mac|iPhone|iPad|iPod|Android/.test(navigator.userAgent);
    if (supportsSmsLink) {
      window.location.href = `sms:?&body=${encodeURIComponent(body)}`;
    } else {
      try {
        await navigator.clipboard.writeText(webcalUrl);
        alert(`Copied ${kid.name}'s calendar link. Send it to their device however you'd like — when they tap it, their calendar app will offer to subscribe.`);
      } catch {
        window.prompt(`${kid.name}'s calendar link — send this to their device:`, webcalUrl);
      }
    }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this family member? Their events will also be removed.')) return;
    try {
      await api.kids.delete(id);
      setKids(k => k.filter(k => k.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ padding: '40px', maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 4 }}>My kids</h1>
          <p style={{ color: 'var(--slate)', fontSize: 15 }}>
            Each kid's name is prefixed on their calendar events so you can tell whose game is whose.
          </p>
        </div>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => { setShowForm(true); setEditingId(null); }}>
            + Add a kid
          </button>
        )}
      </div>

      {error && <div className="error-msg" style={{ marginBottom: 20 }}>{error}</div>}

      {user?.plan === 'free' && <UpgradeBanner />}

      {showForm && (
        <KidForm
          onSave={async (data) => {
            try {
              if (editingId) {
                const { kid } = await api.kids.update(editingId, data);
                setKids(k => k.map(x => x.id === editingId ? kid : x));
              } else {
                const { kid } = await api.kids.create(data);
                setKids(k => [...k, kid]);
              }
              setShowForm(false);
              setEditingId(null);
            } catch (err) {
              setError(err.message);
            }
          }}
          onCancel={() => { setShowForm(false); setEditingId(null); }}
          initial={editingId ? kids.find(k => k.id === editingId) : null}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      ) : kids.length === 0 && !showForm ? (
        <div className="card" style={{ padding: '60px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>👨‍👩‍👧‍👦</div>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No kids yet</h3>
          <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 24 }}>
            Add your first kid to get started.
          </p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>Add a kid</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {kids.map(kid => {
            const color = kid.color;
            const fg = textOn(color);
            const st = stats.map[kid.id] || { upcoming: 0, spark: {} };
            const cal = kid.calendar_count ?? 0;
            const vals = stats.days.map(d => st.spark[d] || 0);
            const maxV = Math.max(1, ...vals);
            const barBg = fg === '#ffffff' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.28)';
            const actBg = fg === '#ffffff' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.10)';
            const btn = { border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: actBg, color: fg };
            return (
              <div key={kid.id} style={{
                position: 'relative', overflow: 'hidden',
                background: color, color: fg, borderRadius: 16, padding: '18px 20px',
                boxShadow: 'var(--shadow)',
              }}>
                <svg viewBox="0 0 24 24" width="150" height="150" fill="none" stroke={fg} strokeWidth="1.4"
                  style={{ position: 'absolute', right: -18, bottom: -32, opacity: 0.15 }}>
                  <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" />
                </svg>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                    background: fg === '#ffffff' ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, fontWeight: 800,
                  }}>
                    {kid.name[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>{kid.name}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.92, marginTop: 1 }}>
                      {cal} {cal === 1 ? 'calendar' : 'calendars'} · {st.upcoming} upcoming
                    </div>
                  </div>
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 4, height: 28, marginTop: 14 }}>
                  {vals.map((v, i) => (
                    <div key={i} style={{ flex: 1, borderRadius: 2, height: 6 + (v / maxV) * 20, background: barBg }} />
                  ))}
                </div>
                <div style={{ position: 'relative', display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                  <button style={btn} onClick={() => shareKidSchedule(kid)} title="Send the calendar subscription link to this kid's device">Share schedule</button>
                  <button style={btn} onClick={() => { setEditingId(kid.id); setShowForm(true); }}>Edit</button>
                  <button style={btn} onClick={() => handleDelete(kid.id)}>Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}


function KidForm({ onSave, onCancel, initial }) {
  const [name, setName]     = useState(initial?.name || '');
  const [color, setColor]   = useState(initial?.color || COLORS[0]);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    await onSave({ name, color });
    setSaving(false);
  }

  return (
    <div className="card fade-up" style={{ padding: '24px', marginBottom: 20 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>
        {initial ? 'Edit member' : 'Add a family member'}
      </h3>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="field">
          <label>Name</label>
          <input className="input" type="text" placeholder="e.g. Emma"
            value={name} onChange={e => setName(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label>Color</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)} style={{
                width: 32, height: 32, borderRadius: '50%', background: c,
                border: color === c ? '3px solid var(--navy)' : '3px solid transparent',
                outline: color === c ? '2px solid var(--accent)' : 'none',
                outlineOffset: 2, cursor: 'pointer', transition: 'transform 0.1s',
                transform: color === c ? 'scale(1.15)' : 'scale(1)',
              }} />
            ))}
          </div>
        </div>

        {/* Preview */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', background: 'var(--off-white)',
          borderRadius: 'var(--radius)', border: '1px solid var(--border)',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: 'white',
          }}>
            {(name || 'A')[0].toUpperCase()}
          </div>
          <span style={{ fontSize: 14, color: 'var(--slate)' }}>
            <strong style={{ color: 'var(--navy)' }}>{name || 'Name'}</strong>
            {' '}- Soccer Practice at Community Park
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving
              ? <span className="spinner" style={{ width: 14, height: 14 }} />
              : initial ? 'Save changes' : 'Add kid'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

