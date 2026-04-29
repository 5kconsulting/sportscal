// Contacts page — ride contacts + Teams and Groups.
//
// Split out from the Family page (which now contains just kids)
// because these sections aren't really about the user's family —
// they're about the network of people they coordinate with for
// rides. Both sections were moved verbatim from Kids.jsx; the
// only structural change is removing each section's own
// marginTop/paddingTop/borderTop divider styling since the page
// now provides spacing at the wrapper level.

import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

// Parse a roster line into { name, phone, email } — pulls the email
// and phone via regex and treats whatever's left as the name.
// Forgiving by design: accepts commas, tabs, pipes, "Linda 555-0100",
// "Linda Smith linda@email.com (503) 555-0100", etc.
const ROSTER_EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const ROSTER_PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
function parseRosterLine(line) {
  let s = String(line || '').trim();
  if (!s) return null;
  let email = null, phone = null;
  const em = s.match(ROSTER_EMAIL_RE); if (em) { email = em[0]; s = s.replace(email, ''); }
  const ph = s.match(ROSTER_PHONE_RE); if (ph) { phone = ph[0]; s = s.replace(phone, ''); }
  const name = s.replace(/[,;|\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) return null;
  return { name, phone, email };
}
function parseRoster(text) {
  return String(text || '').split('\n').map(parseRosterLine).filter(Boolean);
}

export default function Contacts() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px' }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 8 }}>
        Contacts
      </h1>
      <p style={{ color: 'var(--slate)', fontSize: 14, marginBottom: 28, lineHeight: 1.5 }}>
        The people you coordinate with for rides — grandparents, carpool friends,
        coaches, and groups of them you can ask for help all at once.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        <RideContacts />
        <Teams />
      </div>
    </div>
  );
}

// ============================================================
// RideContacts — individuals with name/phone/email plus their
// SMS opt-in status (pending / confirmed / declined).
// ============================================================
function RideContacts() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [form, setForm]         = useState({ name: '', email: '', phone: '' });
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

  return (
    <div>
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

// ============================================================
// Teams and Groups — named groups of contacts. Used by the
// "Ask a group" flow on the event modal which opens a group
// iMessage with one tap-link per member to a SportsCal landing
// page where the first person to claim wins.
// ============================================================
function Teams() {
  const [teams, setTeams]       = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [adding, setAdding]     = useState(false);
  const [newName, setNewName]   = useState('');
  const [newMemberIds, setNewMemberIds] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [newMember, setNewMember] = useState({ teamId: null, name: '', email: '', phone: '' });
  const [creatingMember, setCreatingMember] = useState(false);
  const [bulkAdd, setBulkAdd] = useState({ teamId: null, input: '' });
  const [bulkSaving, setBulkSaving] = useState(false);

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
    const next = window.prompt('Rename group to:', team.name);
    if (!next || !next.trim() || next.trim() === team.name) return;
    try {
      await api.teams.update(team.id, { name: next.trim() });
      await load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDelete(team) {
    if (!confirm(`Delete the "${team.name}" group? Members stay in your contacts.`)) return;
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

  // Generate a self-signup invite link, then open iMessage prefilled
  // with the share message. Mac / iOS / Android open Messages
  // directly; Windows / Linux fall back to clipboard. Mirrors the
  // pattern used by "Share schedule" on the Family page.
  async function handleShareInvite(team) {
    try {
      const { url, team_name } = await api.teams.createInvite(team.id);
      const body =
        `Join my ${team_name} group on SportsCal so I can include you in ` +
        `ride coordination: ${url}`;
      const supportsSmsLink = /Mac|iPhone|iPad|iPod|Android/.test(navigator.userAgent);
      if (supportsSmsLink) {
        window.location.href = `sms:?body=${encodeURIComponent(body)}`;
      } else {
        try {
          await navigator.clipboard.writeText(url);
          alert(
            `Invite link copied. Send to anyone who should join the ${team_name} group:\n\n${url}`
          );
        } catch {
          window.prompt(`Invite link for ${team_name} — share with whoever should join:`, url);
        }
      }
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

  async function handleBulkAdd(team, e) {
    e.preventDefault();
    const parsed = parseRoster(bulkAdd.input);
    if (!parsed.length) return;
    setBulkSaving(true);
    try {
      await api.teams.addMembersBulk(team.id, parsed);
      setBulkAdd({ teamId: null, input: '' });
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBulkSaving(false);
    }
  }

  async function handleCreateAndAddMember(team, e) {
    e.preventDefault();
    if (!newMember.name?.trim()) return;
    if (newMember.teamId !== team.id) return;
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

  const expandedTeam = teams.find(t => t.id === expanded);
  const candidates = expandedTeam
    ? contacts.filter(c => !(expandedTeam.members || []).some(m => m.id === c.id))
    : [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 4 }}>Teams and Groups</h2>
          <p style={{ color: 'var(--slate)', fontSize: 14, lineHeight: 1.5 }}>
            Make a group of people you can ask for rides all at once — your kid's team,
            your family, the neighborhood carpool, anyone who could help.
          </p>
        </div>
        {!adding && (
          <button className="btn btn-primary" onClick={() => setAdding(true)} style={{ flexShrink: 0 }}>
            + Add group
          </button>
        )}
      </div>

      {error && <div className="error-msg" style={{ marginTop: 12 }}>{error}</div>}

      {adding && (
        <form onSubmit={handleCreate} className="card" style={{ padding: 20, marginTop: 16 }}>
          <div className="field">
            <label>Group name *</label>
            <input className="input" type="text" placeholder="e.g. Sam's soccer team, Family, Block carpool"
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
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Create group'}
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
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No groups yet</h3>
              <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 20, maxWidth: 360, margin: '0 auto 20px', lineHeight: 1.5 }}>
                A group is anyone you can ask for rides — Sam's soccer team, your family,
                the carpool down the block. Once you've made one, you can ask everyone in
                it at once from any event.
              </p>
              <button className="btn btn-primary" onClick={() => setAdding(true)}>Add first group</button>
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
                      <button className="btn btn-ghost btn-sm" onClick={() => handleShareInvite(team)}
                        title="Share a link anyone can tap to add their own info to this group">
                        📨 Share invite
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
                        ) : bulkAdd.teamId === team.id ? (() => {
                          const parsed = parseRoster(bulkAdd.input);
                          const preview = parsed.slice(0, 5).map(p => p.name).join(', ');
                          const more = parsed.length > 5 ? `, and ${parsed.length - 5} more` : '';
                          return (
                            <form onSubmit={(e) => handleBulkAdd(team, e)}
                              style={{
                                background: 'var(--off-white)', border: '1px solid var(--border)',
                                borderRadius: 8, padding: 12, display: 'flex',
                                flexDirection: 'column', gap: 8,
                              }}>
                              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--slate)' }}>
                                Paste a list — one per line. Forgiving format: name, phone, email in any order.
                              </div>
                              <textarea className="input"
                                value={bulkAdd.input}
                                onChange={(e) => setBulkAdd(b => ({ ...b, input: e.target.value }))}
                                placeholder={`Linda Smith, 503-555-0100\nMike Johnson 503-555-0123 mike@email.com\nAnna Lee, anna@email.com, (503) 555-0144`}
                                rows={6}
                                style={{ fontFamily: 'var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 13, lineHeight: 1.5, resize: 'vertical' }}
                                autoFocus
                              />
                              <div style={{ fontSize: 12, color: 'var(--slate)', minHeight: 18 }}>
                                {parsed.length === 0
                                  ? 'No rows parsed yet — paste your list above.'
                                  : `Will add ${parsed.length} ${parsed.length === 1 ? 'person' : 'people'}: ${preview}${more}`}
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button type="submit" className="btn btn-primary btn-sm"
                                  disabled={bulkSaving || !parsed.length}
                                  style={{ flex: 1, justifyContent: 'center' }}>
                                  {bulkSaving ? '…' : `Add ${parsed.length || ''} to group`.trim()}
                                </button>
                                <button type="button" className="btn btn-ghost btn-sm"
                                  onClick={() => setBulkAdd({ teamId: null, input: '' })}>
                                  Cancel
                                </button>
                              </div>
                            </form>
                          );
                        })() : (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button type="button"
                              onClick={() => setNewMember({ teamId: team.id, name: '', email: '', phone: '' })}
                              style={{
                                fontSize: 13, padding: '8px 12px', borderRadius: 8,
                                border: '1px dashed var(--border)', cursor: 'pointer',
                                background: 'transparent', color: 'var(--slate)',
                                flex: '1 1 200px', textAlign: 'center', fontWeight: 500,
                              }}>
                              + Add a new person
                            </button>
                            <button type="button"
                              onClick={() => setBulkAdd({ teamId: team.id, input: '' })}
                              style={{
                                fontSize: 13, padding: '8px 12px', borderRadius: 8,
                                border: '1px dashed var(--border)', cursor: 'pointer',
                                background: 'transparent', color: 'var(--slate)',
                                flex: '1 1 200px', textAlign: 'center', fontWeight: 500,
                              }}
                              title="Paste a roster you got from the coach, league registration, or a team email">
                              📋 Paste a list
                            </button>
                          </div>
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
