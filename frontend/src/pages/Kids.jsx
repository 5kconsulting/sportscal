import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

const COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#14b8a6','#3b82f6','#8b5cf6','#ec4899',
  '#00d68f','#06b6d4','#f43f5e','#a855f7',
];

export default function Kids() {
  const [kids, setKids]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError]         = useState('');

  useEffect(() => { loadKids(); }, []);

  async function loadKids() {
    try {
      const { kids } = await api.kids.list();
      setKids(kids);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 4 }}>Family members</h1>
          <p style={{ color: 'var(--slate)', fontSize: 15 }}>
            Each member's name is prefixed on their calendar events.
          </p>
        </div>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => { setShowForm(true); setEditingId(null); }}>
            + Add member
          </button>
        )}
      </div>

      {error && <div className="error-msg" style={{ marginBottom: 20 }}>{error}</div>}

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
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No family members yet</h3>
          <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 24 }}>
            Add your first family member to get started.
          </p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>Add a member</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {kids.map(kid => (
            <div key={kid.id} className="card" style={{
              padding: '16px 20px',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: kid.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700, color: 'white', flexShrink: 0,
              }}>
                {kid.name[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 500 }}>{kid.name}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => {
                  setEditingId(kid.id);
                  setShowForm(true);
                }}>
                  Edit
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(kid.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
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
              : initial ? 'Save changes' : 'Add member'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
