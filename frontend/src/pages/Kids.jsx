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
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => shareKidSchedule(kid)} title="Send the calendar subscription link to this kid's device">
                  📅 Share schedule
                </button>
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

      {/* Teams (groups of contacts for bulk ride requests) */}
      <Teams />
    </div>
  );
}

// ============================================================
// Teams — named groups of ride contacts. Used by the "Request
// from team" flow on the event modal which opens a group
// iMessage with first-yes-wins tap links per parent.
// ============================================================
function Teams() {
  const [teams, setTeams]       = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [adding, setAdding]     = useState(false);   // showing add-team form
  const [newName, setNewName]   = useState('');
  const [newMemberIds, setNewMemberIds] = useState([]);
  const [expanded, setExpanded] = useState(null);    // currently expanded team id
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  // Inline "new person" form state, keyed by team id so each team's
  // expanded view has its own draft.
  const [newMember, setNewMember] = useState({ teamId: null, name: '', email: '', phone: '' });
  const [creatingMember, setCreatingMember] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [tRes, cRes] = await Promise.all([api.teams.list(), api.contacts.list()]);
      setTeams(tRes.teams || []);
      setContacts(cRes.contacts || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleNewMember(id) {
    setNewMemberIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) { setError('Team name is required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.teams.create({ name: newName.trim(), contact_ids: newMemberIds });
      setNewName('');
      setNewMemberIds([]);
      setAdding(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRename(team) {
    const next = window.prompt('Rename team to:', team.name);
    if (!next || !next.trim() || next.trim() === team.name) return;
    try {
      await api.teams.update(team.id, { name: next.trim() });
      await load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDelete(team) {
    if (!confirm(`Delete "${team.name}"? Members stay in your contacts.`)) return;
    try {
      await api.teams.delete(team.id);
      await load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleRemoveMember(team, contactId) {
    try {
      await api.teams.removeMember(team.id, contactId);
      await load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleAddExistingMembers(team, contactIds) {
    if (!contactIds.length) return;
    try {
      await api.teams.addMembers(team.id, contactIds);
      await load();
    } catch (err) {
      alert(err.message);
    }
  }

  // Create a contact AND add to the team in one click. Two API
  // calls (create contact, add to team) but feels like one action
  // to the user. The contact also lands in Ride contacts since
  // contacts are global per-user — that's intentional, no separate
  // "team-only contact" concept yet.
  async function handleCreateAndAddMember(team, e) {
    e.preventDefault();
    if (!newMember.name?.trim()) return;
    if (newMember.teamId !== team.id) return; // sanity
    setCreatingMember(true);
    try {
      const { contact } = await api.contacts.create({
        name:  newMember.name.trim(),
        email: newMember.email?.trim() || null,
        phone: newMember.phone?.trim() || null,
      });
      await api.teams.addMembers(team.id, [contact.id]);
      setNewMember({ teamId: null, name: '', email: '', phone: '' });
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setCreatingMember(false);
    }
  }

  // Contacts not yet in the expanded team — selectable for the add-member picker
  const expandedTeam = teams.find(t => t.id === expanded);
  const candidates = expandedTeam
    ? contacts.filter(c => !(expandedTeam.members || []).some(m => m.id === c.id))
    : [];

  return (
    <div style={{ marginTop: 40, paddingTop: 32, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 4 }}>Teams</h2>
          <p style={{ color: 'var(--slate)', fontSize: 14 }}>
            Group your ride contacts so you can request a pickup from the whole team at once.
          </p>
        </div>
        {!adding && (
          <button className="btn btn-primary" onClick={() => setAdding(true)} style={{ flexShrink: 0 }}>
            + Add team
          </button>
        )}
      </div>

      {error && <div className="error-msg" style={{ marginTop: 12 }}>{error}</div>}

      {adding && (
        <form onSubmit={handleCreate} className="card" style={{ padding: 20, marginTop: 16 }}>
          <div className="field">
            <label>Team name *</label>
            <input className="input" type="text" placeholder="e.g. Sam's soccer team"
              value={newName} onChange={e => setNewName(e.target.value)} required autoFocus />
          </div>
          {contacts.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--slate)', marginBottom: 8, display: 'block' }}>
                Add members (optional, can do later)
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {contacts.map(c => {
                  const on = newMemberIds.includes(c.id);
                  return (
                    <button key={c.id} type="button"
                      onClick={() => toggleNewMember(c.id)}
                      style={{
                        fontSize: 13, padding: '6px 12px', borderRadius: 999,
                        border: '1px solid var(--border)', cursor: 'pointer',
                        background: on ? 'var(--navy)' : 'var(--off-white)',
                        color: on ? 'var(--white)' : 'var(--navy)',
                        transition: 'all 0.15s',
                      }}>
                      {on ? '✓ ' : ''}{c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Create team'}
            </button>
            <button type="button" className="btn btn-ghost"
              onClick={() => { setAdding(false); setNewName(''); setNewMemberIds([]); setError(''); }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div style={{ marginTop: 20 }}>
        {loading ? (
          <div className="spinner" style={{ width: 20, height: 20 }} />
        ) : teams.length === 0 ? (
          !adding && (
            <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No teams yet</h3>
              <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 20, maxWidth: 320, margin: '0 auto 20px' }}>
                A team is a group of parents you ride-share with. Once you've added one, you'll be able to send a single group request from any event.
              </p>
              <button className="btn btn-primary" onClick={() => setAdding(true)}>Add first team</button>
            </div>
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {teams.map(team => {
              const isOpen = expanded === team.id;
              const memberCount = (team.members || []).length;
              return (
                <div key={team.id} className="card" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {team.name}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--slate)', marginTop: 2 }}>
                        {memberCount} {memberCount === 1 ? 'member' : 'members'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(isOpen ? null : team.id)}>
                        {isOpen ? 'Hide' : 'Manage'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleRename(team)}>Rename</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(team)}>Delete</button>
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                      {memberCount === 0 ? (
                        <p style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 12 }}>
                          No members yet — add some below.
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                          {team.members.map(m => (
                            <div key={m.id} style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '8px 12px', background: 'var(--off-white)', borderRadius: 8,
                              border: '1px solid var(--border)',
                            }}>
                              <div style={{ fontSize: 14 }}>
                                <strong>{m.name}</strong>
                                {m.phone && <span style={{ color: 'var(--slate)', marginLeft: 8 }}>{m.phone}</span>}
                              </div>
                              <button className="btn btn-ghost btn-sm" onClick={() => handleRemoveMember(team, m.id)}>
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div>
                        {candidates.length > 0 && (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--slate)', marginBottom: 6 }}>
                              Add an existing contact
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                              {candidates.map(c => (
                                <button key={c.id} type="button"
                                  onClick={() => handleAddExistingMembers(team, [c.id])}
                                  style={{
                                    fontSize: 12, padding: '4px 10px', borderRadius: 999,
                                    border: '1px solid var(--border)', cursor: 'pointer',
                                    background: 'var(--off-white)', color: 'var(--navy)',
                                  }}>
                                  + {c.name}
                                </button>
                              ))}
                            </div>
                          </>
                        )}

                        {/* Inline "new person" form — create contact +
                            add to team in one go, no detour through
                            Ride contacts. */}
                        {newMember.teamId === team.id ? (
                          <form onSubmit={(e) => handleCreateAndAddMember(team, e)}
                            style={{
                              background: 'var(--off-white)', border: '1px solid var(--border)',
                              borderRadius: 8, padding: 12, display: 'flex',
                              flexDirection: 'column', gap: 8,
                            }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--slate)' }}>
                              New person
                            </div>
                            <input className="input" type="text" placeholder="Name *"
                              value={newMember.name}
                              onChange={e => setNewMember(m => ({ ...m, name: e.target.value }))}
                              required autoFocus />
                            <div style={{ display: 'flex', gap: 8 }}>
                              <input className="input" type="tel" placeholder="Phone"
                                value={newMember.phone}
                                onChange={e => setNewMember(m => ({ ...m, phone: e.target.value }))}
                                style={{ flex: 1 }} />
                              <input className="input" type="email" placeholder="Email"
                                value={newMember.email}
                                onChange={e => setNewMember(m => ({ ...m, email: e.target.value }))}
                                style={{ flex: 1 }} />
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button type="submit" className="btn btn-primary btn-sm"
                                disabled={creatingMember || !newMember.name.trim()}
                                style={{ flex: 1, justifyContent: 'center' }}>
                                {creatingMember ? '…' : 'Add to team'}
                              </button>
                              <button type="button" className="btn btn-ghost btn-sm"
                                onClick={() => setNewMember({ teamId: null, name: '', email: '', phone: '' })}>
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : (
                          <button type="button"
                            onClick={() => setNewMember({ teamId: team.id, name: '', email: '', phone: '' })}
                            style={{
                              fontSize: 13, padding: '8px 12px', borderRadius: 8,
                              border: '1px dashed var(--border)', cursor: 'pointer',
                              background: 'transparent', color: 'var(--slate)',
                              width: '100%', textAlign: 'center', fontWeight: 500,
                            }}>
                            + Add a new person
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
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
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [resendingId, setResendingId] = useState(null);

  useEffect(() => {
    api.contacts.list()
      .then(({ contacts }) => setContacts(contacts))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function openAdd() {
    setEditing(null);
    setForm({ name: '', email: '', phone: '' });
    setError('');
    setShowForm(true);
  }

  function openEdit(contact) {
    setEditing(contact);
    setForm({ name: contact.name, email: contact.email || '', phone: contact.phone || '' });
    setError('');
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
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

  async function handleResendOptIn(id) {
    setResendingId(id);
    try {
      await api.contacts.sendOptIn(id);
      // Optimistic \u2014 show the parent we sent something. Actual status
      // remains 'pending' until the contact replies YES.
      setContacts(c => c.map(x => x.id === id ? { ...x, opt_in_sent_at: new Date().toISOString() } : x));
      alert('Opt-in text sent. Waiting for them to reply YES.');
    } catch (err) {
      alert(err.message);
    } finally {
      setResendingId(null);
    }
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
            {contacts.map(c => {
              const status = c.sms_consent_status || 'pending';
              const hasPhone = !!c.phone;
              const pillColor =
                status === 'confirmed' ? '#00b377'
                : status === 'declined' ? '#ef4444'
                : '#f59e0b'; // pending
              const pillLabel =
                status === 'confirmed' ? 'SMS opted in'
                : status === 'declined' ? 'SMS opted out'
                : 'SMS pending';
              return (
                <div key={c.id} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: 'var(--navy)', border: '2px solid var(--navy-mid)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
                  }}>
                    {c.name[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--slate)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[c.email, c.phone].filter(Boolean).join(' · ') || 'No contact info'}
                    </div>
                    {hasPhone && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                        <span style={{
                          display: 'inline-block', width: 6, height: 6, borderRadius: 3,
                          background: pillColor,
                        }} />
                        <span style={{ fontSize: 11, color: pillColor, fontWeight: 600, letterSpacing: 0.3 }}>
                          {pillLabel.toUpperCase()}
                        </span>
                        {status === 'pending' && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleResendOptIn(c.id)}
                            disabled={resendingId === c.id}
                            style={{ fontSize: 11, padding: '2px 8px', marginLeft: 4 }}
                          >
                            {resendingId === c.id ? 'Sending…' : 'Resend opt-in'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>Remove</button>
                  </div>
                </div>
              );
            })}
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

              {form.phone && !editing && (
                <div style={{
                  fontSize: 12, color: 'var(--slate)', lineHeight: 1.55,
                  background: 'var(--off-white)', borderRadius: 8,
                  padding: '12px 14px', border: '1px solid var(--border)',
                }}>
                  When you save, SportsCal will text this number once asking them to reply
                  <strong> YES</strong> to receive ride coordination messages. Until they reply
                  YES, we won&rsquo;t send them anything. They can reply <strong>STOP</strong>
                  any time to opt out. Msg&amp;data rates may apply.
                </div>
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
