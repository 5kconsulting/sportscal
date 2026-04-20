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

const COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#14b8a6','#3b82f6','#8b5cf6','#ec4899',
  '#00d68f','#06b6d4','#f43f5e','#a855f7',
];

export default function Kids() {
  const { user } = useAuth();
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
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 4 }}>Family & friends</h1>
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

      {/* Ride contacts */}
      <RideContacts />
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

function RideContacts() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [form, setForm]         = useState({ name: '', email: '', phone: '' });
  const [consent, setConsent]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    api.contacts.list()
      .then(({ contacts }) => setContacts(contacts))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function openAdd() {
    setEditing(null);
    setForm({ name: '', email: '', phone: '' });
    setConsent(false);
    setError('');
    setShowForm(true);
  }

  function openEdit(contact) {
    setEditing(contact);
    setForm({ name: contact.name, email: contact.email || '', phone: contact.phone || '' });
    // When editing, the consent was already captured at creation time.
    setConsent(true);
    setError('');
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    const needsConsent = !!(form.email || form.phone);
    if (needsConsent && !consent) {
      setError('Please confirm you have the contact\u2019s permission to message them.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        const { contact } = await api.contacts.update(editing.id, form);
        setContacts(c => c.map(x => x.id === editing.id ? contact : x));
      } else {
        const { contact } = await api.contacts.create(form);
        setContacts(c => [...c, contact].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setShowForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this contact?')) return;
    await api.contacts.delete(id);
    setContacts(c => c.filter(x => x.id !== id));
  }

  return (
    <div style={{ marginTop: 40, paddingTop: 32, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 4 }}>Ride contacts</h2>
          <p style={{ color: 'var(--slate)', fontSize: 14 }}>
            Grandparents, carpool friends — anyone who helps with drop-off and pick-up.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd} style={{ flexShrink: 0 }}>
          + Add contact
        </button>
      </div>

      <div style={{ marginTop: 20 }}>
        {loading ? (
          <div className="spinner" style={{ width: 20, height: 20 }} />
        ) : contacts.length === 0 ? (
          <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🚗</div>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No ride contacts yet</h3>
            <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 20, maxWidth: 300, margin: '0 auto 20px' }}>
              Add grandparents, carpool friends, or anyone who helps with rides. You can request confirmation from them on any event.
            </p>
            <button className="btn btn-primary" onClick={openAdd}>Add first contact</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {contacts.map(c => (
              <div key={c.id} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'var(--navy)', border: '2px solid var(--navy-mid)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
                }}>
                  {c.name[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>{c.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--slate)', marginTop: 2 }}>
                    {[c.email, c.phone].filter(Boolean).join(' · ') || 'No contact info'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,22,41,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, padding: 20,
        }}>
          <div className="card fade-up" style={{ width: '100%', maxWidth: 400, padding: 28 }}>
            <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 20 }}>
              {editing ? 'Edit contact' : 'Add ride contact'}
            </h3>
            {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <label>Name *</label>
                <input className="input" type="text" placeholder="e.g. Grandma Linda"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required autoFocus />
              </div>
              <div className="field">
                <label>Email <span style={{ color: 'var(--slate-light)' }}>(for ride requests)</span></label>
                <input className="input" type="email" placeholder="grandma@email.com"
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="field">
                <label>Phone <span style={{ color: 'var(--slate-light)' }}>(for text requests)</span></label>
                <input className="input" type="tel" placeholder="(503) 555-0123"
                  value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>

              {(form.email || form.phone) && (
                <label style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                  fontSize: 12, color: 'var(--slate)', lineHeight: 1.55,
                  background: 'var(--off-white)', borderRadius: 8,
                  padding: '12px 14px', border: '1px solid var(--border)',
                }}>
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={e => setConsent(e.target.checked)}
                    style={{ marginTop: 2, flexShrink: 0, accentColor: 'var(--accent)', width: 15, height: 15 }}
                  />
                  <span>
                    I confirm I have this contact&rsquo;s permission to receive ride coordination
                    messages from SportsCal at the email or phone number above.
                    Messages are only sent when I assign them to a specific pickup or dropoff.
                    Recipients can reply <strong>STOP</strong> anytime to opt out, or <strong>HELP</strong> for support.
                    Message and data rates may apply. See our{' '}
                    <a href="/privacy" target="_blank" style={{ color: 'var(--accent-dim)' }}>Privacy Policy</a>.
                  </span>
                </label>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                  {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Save'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
