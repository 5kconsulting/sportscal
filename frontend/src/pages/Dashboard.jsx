import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.jsx';

export default function Dashboard() {
  const { user }              = useAuth();
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays]       = useState(14);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [kids, setKids]       = useState([]);

  useEffect(() => {
    Promise.all([
      api.events.list({ days }),
      api.kids.list(),
    ])
      .then(([{ events }, { kids }]) => { setEvents(events); setKids(kids); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  const [editingEvent, setEditingEvent] = useState(null);

  function handleEventAdded(event) {
    setEvents(prev => [...prev, event].sort((a, b) =>
      new Date(a.starts_at) - new Date(b.starts_at)
    ));
    setShowAddEvent(false);
  }

  function handleEventUpdated(updated) {
    setEvents(prev => prev.map(e => e.id === updated.id ? updated : e)
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)));
    setEditingEvent(null);
  }

  function handleEventDeleted(id) {
    setEvents(prev => prev.filter(e => e.id !== id));
  }

  useEffect(() => {
    setLoading(true);
    api.events.list({ days })
      .then(({ events }) => setEvents(events))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  const grouped = groupByDay(events);
  const hasEvents = Object.keys(grouped).length > 0;

  return (
    <div className="page-pad" style={{ padding: '40px', maxWidth: 720 }}>
      <style>{`
        @media (max-width: 768px) {
          .page-pad { padding: 20px 16px !important; }
          .dash-header { flex-direction: column !important; gap: 12px; }
          .dash-header h1 { font-size: 22px !important; }
          .dash-add-btn { width: 100%; justify-content: center; }
          .feed-card { flex-direction: column !important; }
          .feed-card button { width: 100%; justify-content: center; }
          .event-time { min-width: 48px !important; }
        }
      `}</style>

      {/* Header */}
      <div className="dash-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 4 }}>
            Good {greeting()}, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p style={{ color: 'var(--slate)', fontSize: 15 }}>
            Here's what's coming up for your family.
          </p>
        </div>
        <button className="btn btn-primary dash-add-btn" onClick={() => setShowAddEvent(true)}>
          + Add event
        </button>
      </div>

      {showAddEvent && (
        <AddEventModal
          kids={kids}
          onSave={handleEventAdded}
          onCancel={() => setShowAddEvent(false)}
        />
      )}

      {editingEvent && (
        <AddEventModal
          kids={kids}
          event={editingEvent}
          onSave={handleEventUpdated}
          onCancel={() => setEditingEvent(null)}
        />
      )}

      {/* Feed URL card */}
      <FeedUrlCard user={user} />

      {/* Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 20px' }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--slate)' }}>Show</span>
        {[7, 14, 30].map(d => (
          <button key={d} onClick={() => setDays(d)}
            className="btn btn-sm"
            style={{
              background: days === d ? 'var(--navy)' : 'var(--white)',
              color:      days === d ? 'var(--white)' : 'var(--slate)',
              border:     `1px solid ${days === d ? 'var(--navy)' : 'var(--border)'}`,
            }}>
            {d} days
          </button>
        ))}
      </div>

      {/* Events */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      ) : !hasEvents ? (
        <EmptyState />
      ) : (
        <div className="fade-up">
          {Object.entries(grouped).map(([day, dayEvents]) => (
            <DayGroup key={day} day={day} events={dayEvents}
              onEdit={setEditingEvent} onDelete={handleEventDeleted} />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedUrlCard({ user }) {
  const [copied, setCopied]       = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const feedUrl = user ? `${window.location.origin}/feed/${user.feed_token}.ics` : '';

  function copy() {
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <div style={{
        background: 'var(--navy)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600,
                        textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Your calendar feed URL
          </div>
          <button onClick={() => setShowGuide(true)}
            style={{ fontSize: 12, color: 'var(--accent-dim)', background: 'none',
                     border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0 }}>
            How to subscribe →
          </button>
        </div>
        <div style={{
          fontSize: 12, color: 'var(--slate-light)',
          fontFamily: 'var(--mono)',
          wordBreak: 'break-all',
          lineHeight: 1.5,
        }}>
          {feedUrl}
        </div>
        <button onClick={copy} className="btn btn-sm" style={{
          background: copied ? 'var(--accent)' : 'var(--navy-mid)',
          color: copied ? 'var(--navy)' : 'var(--slate-light)',
          border: 'none',
          alignSelf: 'flex-start',
        }}>
          {copied ? '✓ Copied' : 'Copy URL'}
        </button>
      </div>

      {showGuide && <SubscribeGuide feedUrl={feedUrl} onClose={() => setShowGuide(false)} />}
    </>
  );
}

const APPS = [
  { id: 'apple', label: 'Apple Calendar', emoji: '🍎' },
  { id: 'google', label: 'Google Calendar', emoji: '📅' },
  { id: 'outlook', label: 'Outlook', emoji: '📧' },
];

const STEPS = {
  apple: [
    'Copy your feed URL above.',
    'Open the Calendar app on your iPhone, iPad, or Mac.',
    'On iPhone/iPad: tap Calendars at the bottom → Add Calendar → Add Subscription Calendar.',
    'On Mac: go to File → New Calendar Subscription.',
    'Paste your feed URL and tap Subscribe.',
    'Give it a name like "SportsCal" and tap Add Account.',
    'Your events will now appear in Apple Calendar and update automatically.',
  ],
  google: [
    'Copy your feed URL above.',
    'Open Google Calendar on your computer at calendar.google.com.',
    'On the left sidebar, click the + next to "Other calendars".',
    'Select "From URL" from the menu.',
    'Paste your feed URL and click "Add calendar".',
    'Your events will appear within a few minutes and sync every few hours.',
    'Note: Google Calendar does not support adding subscriptions from the mobile app — use a browser on desktop.',
  ],
  outlook: [
    'Copy your feed URL above.',
    'Open Outlook on your computer or go to outlook.com.',
    'Click the Calendar icon in the sidebar.',
    'Click "Add calendar" → "Subscribe from web".',
    'Paste your feed URL, give it a name like "SportsCal", and click Import.',
    'Your events will appear in Outlook and update automatically.',
    'On iPhone/iPad with Outlook: go to Settings → Add Account → Other → Add Subscribed Calendar, then paste the URL.',
  ],
};

function SubscribeGuide({ feedUrl, onClose }) {
  const [active, setActive] = useState('apple');
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,22,41,0.7)',
      display: 'flex', alignItems: 'flex-end', zIndex: 200,
    }}>
      <style>{`
        @media (min-width: 641px) {
          .guide-modal { border-radius: 16px !important; margin: auto !important; max-width: 540px !important; }
          .guide-wrap { align-items: center !important; padding: 20px !important; }
        }
      `}</style>
      <div className="guide-wrap" style={{ width: '100%', display: 'flex', alignItems: 'flex-end' }}>
        <div className="card guide-modal" style={{
          width: '100%', padding: '28px',
          borderRadius: '16px 16px 0 0',
          maxHeight: '88vh', overflowY: 'auto',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>
              Add to your calendar
            </h3>
            <button onClick={onClose} style={{ fontSize: 22, color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>

          {/* Feed URL */}
          <div style={{
            background: 'var(--off-white)', borderRadius: 8,
            padding: '10px 14px', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ flex: 1, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--slate)',
                          wordBreak: 'break-all', lineHeight: 1.5 }}>
              {feedUrl}
            </div>
            <button onClick={copy} className="btn btn-sm" style={{
              background: copied ? 'var(--accent)' : 'var(--navy)',
              color: copied ? 'var(--navy)' : 'var(--white)',
              border: 'none', flexShrink: 0, fontSize: 12,
            }}>
              {copied ? '✓' : 'Copy'}
            </button>
          </div>

          {/* App tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {APPS.map(app => (
              <button key={app.id} onClick={() => setActive(app.id)}
                style={{
                  flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none',
                  cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  background: active === app.id ? 'var(--navy)' : 'var(--off-white)',
                  color: active === app.id ? 'var(--white)' : 'var(--slate)',
                  transition: 'all 0.15s',
                }}>
                {app.emoji} {app.label}
              </button>
            ))}
          </div>

          {/* Steps */}
          <ol style={{ paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {STEPS[active].map((step, i) => (
              <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--accent)', color: 'var(--navy)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700,
                }}>
                  {i + 1}
                </div>
                <div style={{ fontSize: 14, color: 'var(--navy)', lineHeight: 1.6, paddingTop: 3 }}>
                  {step}
                </div>
              </li>
            ))}
          </ol>

          <button onClick={onClose} className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'center', marginTop: 24 }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function DayGroup({ day, events, onEdit, onDelete }) {
  const isToday = day === formatDay(new Date());

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
      }}>
        <span style={{
          fontSize: 13, fontWeight: 600,
          color: isToday ? 'var(--accent-dim)' : 'var(--slate)',
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {isToday ? 'Today' : day}
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: 12, color: 'var(--slate-light)' }}>
          {events.length} event{events.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {events.map(event => <EventCard key={event.id} event={event} onEdit={onEdit} onDelete={onDelete} />)}
      </div>
    </div>
  );
}

function EventCard({ event, onEdit, onDelete }) {
  const kidColor = event.kids?.[0]?.color || '#6366f1';
  const startsAt = new Date(event.starts_at);
  const endsAt   = event.ends_at ? new Date(event.ends_at) : null;
  const isManual = event.source_app === 'custom' && event.source_name === '__manual__';
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm('Delete this event?')) return;
    setDeleting(true);
    try {
      await api.manual.delete(event.id);
      onDelete(event.id);
    } catch (err) {
      alert(err.message);
      setDeleting(false);
    }
  }

  return (
    <div className="card" style={{
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 14,
      borderLeft: `3px solid ${kidColor}`,
      borderRadius: '0 var(--radius) var(--radius) 0',
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
    }}>
      {/* Time column */}
      <div style={{ minWidth: 56, textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', fontFamily: 'var(--mono)' }}>
          {event.all_day ? 'All day' : formatTime(startsAt)}
        </div>
        {endsAt && !event.all_day && (
          <div style={{ fontSize: 11, color: 'var(--slate)', fontFamily: 'var(--mono)' }}>
            {formatTime(endsAt)}
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch', flexShrink: 0 }} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--navy)', marginBottom: 3,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {event.display_title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {event.location && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.location)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 13, color: 'var(--slate)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}
              onMouseOver={e => e.currentTarget.style.color = 'var(--accent-dim)'}
              onMouseOut={e => e.currentTarget.style.color = 'var(--slate)'}
            >
              📍 {event.location}
            </a>
          )}
          <span style={{ fontSize: 12, color: 'var(--slate-light)',
                         background: 'var(--off-white)', padding: '2px 8px',
                         borderRadius: 20, border: '1px solid var(--border)' }}>
            {event.source_app}
          </span>
        </div>
      </div>

      {/* Kid avatars + manual actions */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
        {event.kids?.length > 0 && (
          <div style={{ display: 'flex' }}>
            {event.kids.map((kid, i) => (
              <div key={kid.id} style={{
                width: 24, height: 24, borderRadius: '50%',
                background: kid.color, border: '2px solid var(--white)',
                marginLeft: i > 0 ? -6 : 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: 'var(--white)',
                zIndex: event.kids.length - i,
              }}>
                {kid.name[0]}
              </div>
            ))}
          </div>
        )}
        {isManual && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => onEdit(event)} className="btn btn-ghost btn-sm"
              style={{ padding: '2px 8px', fontSize: 11 }}>
              Edit
            </button>
            <button onClick={handleDelete} className="btn btn-ghost btn-sm"
              disabled={deleting}
              style={{ padding: '2px 8px', fontSize: 11, color: 'var(--red, #ef4444)' }}>
              {deleting ? '…' : 'Delete'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card" style={{ padding: '60px 40px', textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🏆</div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No events yet</h3>
      <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 24 }}>
        Add your kids and connect your sports apps to get started.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <Link to="/kids" className="btn btn-primary">Add a member</Link>
        <Link to="/sources" className="btn btn-ghost">Add a source</Link>
      </div>
    </div>
  );
}

function AddEventModal({ kids, event: existingEvent, onSave, onCancel }) {
  const isEditing = !!existingEvent;

  function toLocalDatetime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const [form, setForm] = useState({
    title:       existingEvent?.title || '',
    starts_at:   toLocalDatetime(existingEvent?.starts_at) || '',
    ends_at:     toLocalDatetime(existingEvent?.ends_at) || '',
    location:    existingEvent?.location || '',
    description: existingEvent?.description || '',
    all_day:     existingEvent?.all_day || false,
    kid_ids:     existingEvent?.kids?.map(k => k.id) || [],
  });
  const [saving, setSaving]  = useState(false);
  const [error, setError]    = useState('');

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function toggleKid(id) {
    setForm(f => ({
      ...f,
      kid_ids: f.kid_ids.includes(id)
        ? f.kid_ids.filter(x => x !== id)
        : [...f.kid_ids, id],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        ...form,
        ends_at: form.ends_at || null,
        location: form.location || null,
        description: form.description || null,
      };
      const { event } = isEditing
        ? await api.manual.update(existingEvent.id, payload)
        : await api.manual.create(payload);
      onSave(event);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,22,41,0.6)',
      display: 'flex', alignItems: 'flex-end',
      zIndex: 100, padding: 0,
    }}>
      <style>{`
        @media (min-width: 641px) {
          .add-event-modal {
            margin: auto !important;
            border-radius: var(--border-radius-lg) !important;
            max-width: 560px !important;
          }
          .add-event-overlay {
            align-items: center !important;
            padding: 20px !important;
          }
        }
      `}</style>
      <div className="add-event-overlay" style={{ display: 'contents' }}>
        <div className="card add-event-modal fade-up" style={{
          width: '100%', padding: '28px',
          borderRadius: '16px 16px 0 0',
          maxHeight: '92vh', overflowY: 'auto',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>{isEditing ? 'Edit event' : 'Add an event'}</h3>
          <button onClick={onCancel} style={{ fontSize: 20, color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {error && <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label>Title</label>
            <input className="input" type="text" placeholder="e.g. Doctor appointment"
              value={form.title} onChange={e => setField('title', e.target.value)} required autoFocus />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field">
              <label>Start</label>
              <input className="input" type="datetime-local"
                value={form.starts_at} onChange={e => setField('starts_at', e.target.value)} required />
            </div>
            <div className="field">
              <label>End <span style={{ color: 'var(--slate-light)' }}>(optional)</span></label>
              <input className="input" type="datetime-local"
                value={form.ends_at} onChange={e => setField('ends_at', e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Location <span style={{ color: 'var(--slate-light)' }}>(optional)</span></label>
            <input className="input" type="text" placeholder="e.g. Portland Children's Hospital"
              value={form.location} onChange={e => setField('location', e.target.value)} />
          </div>

          <div className="field">
            <label>Notes <span style={{ color: 'var(--slate-light)' }}>(optional)</span></label>
            <textarea className="input" placeholder="Any extra details..."
              value={form.description} onChange={e => setField('description', e.target.value)}
              rows={2} style={{ resize: 'vertical' }} />
          </div>

          {kids.length > 0 && (
            <div className="field">
              <label>For <span style={{ color: 'var(--slate-light)' }}>(optional)</span></label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {kids.map(kid => (
                  <button key={kid.id} type="button" onClick={() => toggleKid(kid.id)}
                    style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 13, fontWeight: 500,
                      border: `2px solid ${form.kid_ids.includes(kid.id) ? kid.color : 'var(--border)'}`,
                      background: form.kid_ids.includes(kid.id) ? kid.color + '15' : 'transparent',
                      color: form.kid_ids.includes(kid.id) ? kid.color : 'var(--slate)',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}>
                    {form.kid_ids.includes(kid.id) ? '✓ ' : ''}{kid.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving
                ? <span className="spinner" style={{ width: 14, height: 14 }} />
                : isEditing ? 'Save changes' : 'Add to calendar'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}

// ---- Helpers ----
function groupByDay(events) {
  const groups = {};
  for (const e of events) {
    const day = formatDay(new Date(e.starts_at));
    if (!groups[day]) groups[day] = [];
    groups[day].push(e);
  }
  return groups;
}

function formatDay(date) {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
