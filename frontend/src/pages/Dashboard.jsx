import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.jsx';

export default function Dashboard() {
  const { user, updateUser }  = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays]       = useState(14);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [kids, setKids]       = useState([]);
  const [sources, setSources] = useState([]);
  const [onboardingDismissed, setOnboardingDismissed] = useState(
    () => localStorage.getItem('sc_onboarding_done') === '1'
  );
  const [verifiedFlash, setVerifiedFlash] = useState(searchParams.get('verified') === '1');

  useEffect(() => {
    if (verifiedFlash) {
      updateUser({ email_verified: true });
      setSearchParams({});
      setTimeout(() => setVerifiedFlash(false), 4000);
    }
  }, []);

  const [allOverrides, setAllOverrides] = useState({});

  useEffect(() => {
    Promise.all([
      api.events.list({ days }),
      api.kids.list(),
      api.sources.list(),
      api.overrides.getAll(),
    ])
      .then(([{ events }, { kids }, { sources }, { overrides }]) => {
        setEvents(events);
        setKids(kids);
        setSources(sources);
        // Build map: eventId -> { kidId -> attending }
        const map = {};
        (overrides || []).forEach(o => {
          if (!map[o.event_id]) map[o.event_id] = {};
          map[o.event_id][o.kid_id] = o.attending;
        });
        setAllOverrides(map);
      })
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

  function handleEventDeleted(id, recurrenceId, deleteSeries) {
    if (deleteSeries && recurrenceId) {
      setEvents(prev => prev.filter(e => e.recurrence_id !== recurrenceId));
    } else {
      setEvents(prev => prev.filter(e => e.id !== id));
    }
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

      {/* Verified flash */}
      {verifiedFlash && (
        <div style={{
          background: '#d1fae5', border: '1px solid #6ee7b7',
          borderRadius: 8, padding: '12px 16px', marginBottom: 20,
          fontSize: 14, color: '#065f46', fontWeight: 500,
        }}>
          ✅ Your email has been verified. Thanks!
        </div>
      )}

      {/* Onboarding wizard */}
      {!onboardingDismissed && !loading && !(kids.length > 0 && sources.filter(s => s.name !== '__manual__').length > 0) && (
        <OnboardingBanner
          hasKids={kids.length > 0}
          hasSources={sources.filter(s => s.name !== '__manual__').length > 0}
          onDismiss={() => {
            localStorage.setItem('sc_onboarding_done', '1');
            setOnboardingDismissed(true);
          }}
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
              onEdit={setEditingEvent} onDelete={handleEventDeleted}
              eventOverrides={allOverrides} />
          ))}
        </div>
      )}
    </div>
  );
}

function OnboardingBanner({ hasKids, hasSources, onDismiss }) {
  const allDone = hasKids && hasSources;

  const steps = [
    {
      num: 1,
      title: 'Add a family member',
      desc: 'Create a profile for each kid — their name appears on every event.',
      done: hasKids,
      action: <Link to="/kids" className="btn btn-sm btn-primary" style={{ textDecoration: 'none' }}>Add member →</Link>,
    },
    {
      num: 2,
      title: 'Connect a sports app',
      desc: 'Paste an iCal link from TeamSnap, GameChanger, PlayMetrics, or any other app.',
      done: hasSources,
      action: <Link to="/sources" className="btn btn-sm btn-primary" style={{ textDecoration: 'none' }}>Add source →</Link>,
    },
    {
      num: 3,
      title: 'Subscribe to your calendar',
      desc: 'Copy your feed URL and add it to Apple Calendar, Google Calendar, or Outlook.',
      done: false,
      action: hasKids && hasSources
        ? <span style={{ fontSize: 12, color: 'var(--accent-dim)', fontWeight: 500 }}>↓ Use the feed URL card below</span>
        : null,
    },
  ];

  const completedCount = [hasKids, hasSources].filter(Boolean).length;

  return (
    <div style={{
      background: 'var(--navy)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px 24px',
      marginBottom: 24,
      border: '1px solid rgba(0,214,143,0.15)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Getting started
          </div>
          <div style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 20,
            background: 'rgba(0,214,143,0.15)', color: 'var(--accent)',
            fontWeight: 600,
          }}>
            {completedCount}/3 done
          </div>
        </div>
        <button onClick={onDismiss} style={{
          fontSize: 12, color: 'var(--slate)', background: 'none',
          border: 'none', cursor: 'pointer', padding: 0,
        }}>
          Dismiss
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: 'var(--navy-mid)', borderRadius: 2, marginBottom: 20, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${(completedCount / 3) * 100}%`,
          background: 'var(--accent)',
          borderRadius: 2,
          transition: 'width 0.5s ease',
        }} />
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {steps.map((step) => (
          <div key={step.num} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            opacity: step.done ? 0.5 : 1,
            transition: 'opacity 0.3s',
          }}>
            {/* Step indicator */}
            <div style={{
              width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
              background: step.done ? 'var(--accent)' : 'var(--navy-mid)',
              border: step.done ? 'none' : '1px solid rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700,
              color: step.done ? 'var(--navy)' : 'var(--slate)',
              marginTop: 1,
            }}>
              {step.done ? '✓' : step.num}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: step.done ? 'var(--slate)' : 'var(--white)' }}>
                  {step.title}
                </div>
                {!step.done && step.action && step.action}
              </div>
              <div style={{ fontSize: 13, color: 'var(--slate)', marginTop: 2, lineHeight: 1.5 }}>
                {step.desc}
              </div>
            </div>
          </div>
        ))}
      </div>

      {allDone && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 500 }}>
            ✓ You're all set! Subscribe to your calendar feed above.
          </div>
          <button onClick={onDismiss} className="btn btn-sm" style={{
            background: 'var(--accent)', color: 'var(--navy)', border: 'none',
          }}>
            Got it
          </button>
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
    { text: 'Tap the button below — iOS will immediately ask if you want to subscribe.', action: 'webcal' },
    { text: 'Tap "Subscribe" in the prompt that appears.' },
    { text: 'Give it a name like "SportsCal" and tap "Add Account".' },
    { text: 'Your events will now appear in Apple Calendar and update automatically.' },
  ],
  google: [
    { text: 'Tap the button above to open Google Calendar.' },
    { text: 'Tap "Add calendar" in the confirmation dialog.' },
    { text: 'On Android: if the app opens instead of a browser, copy the feed URL and open Chrome → go to calendar.google.com → tap ☰ → Other calendars → + → From URL → paste and add.' },
    { text: 'Events sync every few hours. Adding subscriptions must be done in a browser — not the Google Calendar app.', note: true },
  ],
  outlook: [
    { text: 'Click the button below to open Outlook Calendar.' },
    { text: 'Click "Add calendar" → "Subscribe from web" → paste your feed URL → click Import.' },
    { text: 'On iPhone/Android with the Outlook app: tap the menu → Settings → Add Account → Other → Add Subscribed Calendar → paste your URL.' },
    { text: 'Your events will appear and update automatically.' },
  ],
};

function detectDevice() {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'apple';
  if (/Android/.test(ua)) return 'google';
  return 'apple'; // default for desktop (Mac users most common)
}

function SubscribeGuide({ feedUrl, onClose }) {
  const [active, setActive] = useState(detectDevice);
  const [copied, setCopied] = useState(false);

  const webcalUrl = feedUrl.replace(/^https?:\/\//, 'webcal://');
  const googleUrl = 'https://www.google.com/calendar/render?cid=' + encodeURIComponent(feedUrl.replace(/^https?:\/\//, 'webcal://'));
  const outlookUrl = 'https://outlook.live.com/calendar/0/addfromweb?url=' + encodeURIComponent(feedUrl);

  function copy() {
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const actionButton = {
    apple: { label: '🍎 Open in Apple Calendar', href: webcalUrl },
    google: { label: '📅 Add to Google Calendar', href: googleUrl },
    outlook: { label: '📧 Open Outlook Calendar', href: outlookUrl },
  }[active];

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
                  cursor: 'pointer', fontSize: 12, fontWeight: 500,
                  background: active === app.id ? 'var(--navy)' : 'var(--off-white)',
                  color: active === app.id ? 'var(--white)' : 'var(--slate)',
                  transition: 'all 0.15s',
                }}>
                {app.emoji} {app.label}
              </button>
            ))}
          </div>

          {/* Action button */}
          <a href={actionButton.href}
            target={active === 'apple' ? '_self' : '_blank'}
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '100%', padding: '12px',
              background: 'var(--accent)', color: 'var(--navy)',
              borderRadius: 10, fontWeight: 600, fontSize: 15,
              textDecoration: 'none', marginBottom: 20,
              transition: 'background 0.15s',
            }}>
            {actionButton.label}
          </a>

          {/* Steps */}
          <ol style={{ paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {STEPS[active].map((step, i) => (
              <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                  background: step.note ? 'var(--off-white)' : 'var(--accent)',
                  color: step.note ? 'var(--slate)' : 'var(--navy)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700,
                }}>
                  {step.note ? 'ℹ' : i + 1}
                </div>
                <div style={{
                  fontSize: 14, lineHeight: 1.6, paddingTop: 3,
                  color: step.note ? 'var(--slate)' : 'var(--navy)',
                }}>
                  {step.action === 'webcal'
                    ? <><strong>Tap the button above</strong> — iOS will immediately ask if you want to subscribe.</>
                    : step.text}
                </div>
              </li>
            ))}
          </ol>

          {/* Download option */}
          <div style={{
            marginTop: 20, paddingTop: 20,
            borderTop: '1px solid var(--border)',
          }}>
            <p style={{ fontSize: 12, color: 'var(--slate)', marginBottom: 10, textAlign: 'center' }}>
              Prefer to add events to an existing calendar?
            </p>
            <a href={feedUrl}
              download="sportscal.ics"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '10px',
                background: 'var(--off-white)', color: 'var(--slate)',
                borderRadius: 8, fontWeight: 500, fontSize: 13,
                textDecoration: 'none', border: '1px solid var(--border)',
              }}>
              ⬇ Download .ics file
            </a>
            <p style={{ fontSize: 11, color: 'var(--slate-light)', marginTop: 8, textAlign: 'center', lineHeight: 1.5 }}>
              One-time import — events won't update automatically if schedules change.
            </p>
          </div>

          <button onClick={onClose} className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'center', marginTop: 20 }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function DayGroup({ day, events, onEdit, onDelete, eventOverrides = {} }) {
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
        {events.map(event => <EventCard key={event.id} event={event} onEdit={onEdit} onDelete={onDelete} eventOverrides={eventOverrides?.[event.id] || {}} />)}
      </div>
    </div>
  );
}

function EventCard({ event, onEdit, onDelete, eventOverrides = {} }) {
  const kidColor = event.kids?.[0]?.color || '#6366f1';
  const startsAt = new Date(event.starts_at);
  const endsAt   = event.ends_at ? new Date(event.ends_at) : null;
  const isManual = event.source_app === 'custom' && event.source_name === '__manual__';
  const [deleting, setDeleting] = useState(false);
  const [showLogistics, setShowLogistics] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  const [logistics, setLogistics] = useState([]);
  const [overrides, setOverrides] = useState(eventOverrides);

  // Sync overrides when the parent loads them asynchronously
  useEffect(() => {
    setOverrides(eventOverrides);
  }, [eventOverrides]);

  // Compute attendance status from overrides
  const notGoingKids = event.kids?.filter(k => overrides[k.id] === false) || [];
  const allNotGoing = event.kids?.length > 0 && notGoingKids.length === event.kids.length;
  const someNotGoing = notGoingKids.length > 0 && !allNotGoing;

  async function handleDelete() {
    const deleteSeries = event.recurrence_id
      ? confirm('This is a recurring event. Delete ALL events in this series?\n\nClick OK to delete all, Cancel to delete only this one.')
      : false;
    if (!deleteSeries && !confirm('Delete this event?')) return;
    setDeleting(true);
    try {
      await api.manual.delete(event.id, deleteSeries);
      onDelete(event.id, event.recurrence_id, deleteSeries);
    } catch (err) {
      alert(err.message);
      setDeleting(false);
    }
  }

  async function openLogistics() {
    try {
      const { logistics } = await api.logistics.get(event.id);
      setLogistics(logistics || []);
    } catch { setLogistics([]); }
    setShowLogistics(true);
  }

  async function toggleAttendance() {
    if (!showAttendance && event.kids?.length > 0) {
      try {
        const { overrides: rows } = await api.overrides.get(event.id);
        const map = {};
        // Default all kids to attending (true), only override if explicitly set to false
        event.kids.forEach(k => { map[k.id] = true; });
        rows.forEach(r => { map[r.kid_id] = r.attending; });
        setOverrides(map);
      } catch {
        // Default all to attending
        const map = {};
        event.kids.forEach(k => { map[k.id] = true; });
        setOverrides(map);
      }
    }
    setShowAttendance(s => !s);
  }

  async function setKidAttendance(kidId, attending) {
    setOverrides(prev => ({ ...prev, [kidId]: attending }));
    try {
      if (attending) {
        await api.overrides.remove(event.id, kidId);
      } else {
        await api.overrides.set(event.id, { kid_id: kidId, attending: false });
      }
    } catch (err) {
      setOverrides(prev => ({ ...prev, [kidId]: !attending }));
    }
  }

  const dropoff = logistics.find(l => l.role === 'dropoff');
  const pickup  = logistics.find(l => l.role === 'pickup');

  const statusIcon = (s) => ({ assigned: '📋', requested: '⏳', confirmed: '✅', declined: '❌' }[s] || '📋');

  return (
    <div className="card" style={{
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 14,
      borderLeft: `3px solid ${allNotGoing ? '#94a3b8' : kidColor}`,
      borderRadius: '0 var(--radius) var(--radius) 0',
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
      opacity: allNotGoing ? 0.5 : 1,
      transition: 'opacity 0.2s',
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
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      textDecoration: allNotGoing ? 'line-through' : 'none',
                      color: allNotGoing ? 'var(--slate)' : 'var(--navy)' }}>
          {event.display_title}
        </div>
        {allNotGoing && (
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 4,
                        textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            ✕ Not attending — hidden from calendar feed
          </div>
        )}
        {someNotGoing && (
          <div style={{ fontSize: 11, color: 'var(--slate)', marginBottom: 4 }}>
            ✕ Not going: {notGoingKids.map(k => k.name).join(', ')}
          </div>
        )}
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

        {/* Logistics summary */}
        {(dropoff || pickup) && (
          <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
            {dropoff && (
              <span style={{ fontSize: 11, color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: 3 }}>
                🚗 Drop-off: {statusIcon(dropoff.status)} {dropoff.contact_name}
              </span>
            )}
            {pickup && (
              <span style={{ fontSize: 11, color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: 3 }}>
                🏠 Pick-up: {statusIcon(pickup.status)} {pickup.contact_name}
              </span>
            )}
          </div>
        )}

        {/* Attendance override UI */}
        {showAttendance && event.kids?.length > 0 && (
          <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--off-white)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Who's going?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {event.kids.map(kid => {
                const attending = overrides[kid.id] !== false;
                return (
                  <label key={kid.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={attending}
                      onChange={e => setKidAttendance(kid.id, e.target.checked)}
                      style={{ accentColor: kid.color, width: 14, height: 14 }} />
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: kid.color, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 700, color: 'white',
                    }}>{kid.name[0]}</div>
                    <span style={{ fontSize: 13, color: attending ? 'var(--navy)' : 'var(--slate)',
                                   textDecoration: attending ? 'none' : 'line-through' }}>
                      {kid.name}
                    </span>
                    {!attending && <span style={{ fontSize: 11, color: 'var(--slate)' }}>— not going</span>}
                  </label>
                );
              })}
            </div>
            <p style={{ fontSize: 11, color: 'var(--slate-light)', marginTop: 8, lineHeight: 1.5 }}>
              Unchecked kids are removed from this event in your calendar feed.
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
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
        <div style={{ display: 'flex', gap: 4 }}>
          {event.kids?.length > 0 && (
            <button onClick={toggleAttendance} className="btn btn-ghost btn-sm"
              style={{ padding: '2px 8px', fontSize: 11,
                       background: showAttendance ? 'var(--navy)' : 'transparent',
                       color: showAttendance ? 'var(--white)' : 'var(--slate)' }}
              title="Who's going?">
              {showAttendance ? '✓ Going ▲' : '✓ Going ▼'}
            </button>
          )}
          <button onClick={openLogistics} className="btn btn-ghost btn-sm"
            style={{ padding: '2px 8px', fontSize: 11 }}
            title="Manage drop-off & pick-up">
            🚗
          </button>
          {isManual && (
            <>
              <button onClick={() => onEdit(event)} className="btn btn-ghost btn-sm"
                style={{ padding: '2px 8px', fontSize: 11 }}>
                Edit
              </button>
              <button onClick={handleDelete} className="btn btn-ghost btn-sm"
                disabled={deleting}
                style={{ padding: '2px 8px', fontSize: 11, color: 'var(--red, #ef4444)' }}>
                {deleting ? '…' : 'Delete'}
              </button>
            </>
          )}
        </div>
      </div>

      {showLogistics && (
        <LogisticsModal
          event={event}
          logistics={logistics}
          onClose={() => setShowLogistics(false)}
          onUpdate={setLogistics}
        />
      )}
    </div>
  );
}

function LogisticsModal({ event, logistics, onClose, onUpdate }) {
  const { user } = useAuth();
  const isPremium = user?.plan === 'premium';
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [saving, setSaving] = useState('');
  const [form, setForm] = useState({ role: 'dropoff', contact_id: '', send_request: false, notify: 'none', note: '' });

  const dropoff = logistics.find(l => l.role === 'dropoff');
  const pickup  = logistics.find(l => l.role === 'pickup');

  useEffect(() => {
    api.contacts.list()
      .then(({ contacts }) => setContacts(contacts))
      .finally(() => setLoadingContacts(false));
  }, []);

  async function handleAssign(e) {
    e.preventDefault();
    if (!form.contact_id) return;
    setSaving('assign');
    try {
      const { logistics: updated } = await api.logistics.assign(event.id, { ...form, notify: form.notify });
      onUpdate(prev => {
        const filtered = prev.filter(l => l.role !== form.role);
        return [...filtered, updated];
      });
      setForm(f => ({ ...f, contact_id: '', note: '', send_request: false, notify: 'none' }));
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving('');
    }
  }

  async function handleRemove(role) {
    setSaving(role);
    try {
      await api.logistics.remove(event.id, role);
      onUpdate(prev => prev.filter(l => l.role !== role));
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving('');
    }
  }

  const statusLabel = { assigned: 'Assigned', requested: 'Requested ⏳', confirmed: 'Confirmed ✅', declined: 'Declined ❌' };
  const eventDate = new Date(event.starts_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const eventTime = new Date(event.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,22,41,0.65)',
      display: 'flex', alignItems: 'flex-end', zIndex: 200,
    }}>
      <style>{`@media (min-width: 641px) { .logistics-modal { border-radius: 16px !important; margin: auto !important; max-width: 480px !important; } .logistics-wrap { align-items: center !important; padding: 20px !important; } }`}</style>
      <div className="logistics-wrap" style={{ width: '100%', display: 'flex', alignItems: 'flex-end' }}>
        <div className="card logistics-modal" style={{ width: '100%', padding: 28, borderRadius: '16px 16px 0 0', maxHeight: '88vh', overflowY: 'auto' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 2 }}>🚗 Ride logistics</h3>
              <p style={{ fontSize: 13, color: 'var(--slate)' }}>{eventDate} at {eventTime}</p>
            </div>
            <button onClick={onClose} style={{ fontSize: 22, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', lineHeight: 1 }}>×</button>
          </div>

          {/* Current assignments */}
          {(dropoff || pickup) && (
            <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[dropoff, pickup].filter(Boolean).map(l => (
                <div key={l.role} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', background: 'var(--off-white)', borderRadius: 8,
                  borderLeft: `3px solid ${l.status === 'confirmed' ? 'var(--accent)' : l.status === 'declined' ? '#ef4444' : 'var(--slate-light)'}`,
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>
                      {l.role === 'dropoff' ? '🚗 Drop-off' : '🏠 Pick-up'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--navy)', marginTop: 1 }}>
                      {l.contact_name} · <span style={{ color: 'var(--slate)' }}>{statusLabel[l.status]}</span>
                    </div>
                    {l.note && <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 2, fontStyle: 'italic' }}>"{l.note}"</div>}
                  </div>
                  <button onClick={() => handleRemove(l.role)} disabled={saving === l.role}
                    style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
                    {saving === l.role ? '…' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Assign form */}
          <div style={{ borderTop: logistics.length > 0 ? '1px solid var(--border)' : 'none', paddingTop: logistics.length > 0 ? 16 : 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--navy)' }}>
              {logistics.length > 0 ? 'Add another' : 'Assign someone'}
            </p>

            {loadingContacts ? (
              <div className="spinner" style={{ width: 16, height: 16 }} />
            ) : contacts.length === 0 ? (
              <div style={{ fontSize: 14, color: 'var(--slate)', background: 'var(--off-white)', borderRadius: 8, padding: 16 }}>
                No contacts yet. Add family and carpool contacts in <strong>Settings → Ride contacts</strong>.
              </div>
            ) : (
              <form onSubmit={handleAssign} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={{ flex: 1 }}>
                    <option value="dropoff">🚗 Drop-off</option>
                    <option value="pickup">🏠 Pick-up</option>
                  </select>
                  <select className="input" value={form.contact_id} onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))} style={{ flex: 1 }}>
                    <option value="">Select contact…</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <input className="input" type="text" placeholder="Note (optional) — e.g. pick up at side entrance"
                  value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />

                {form.contact_id && (() => {
                  const c = contacts.find(x => x.id === form.contact_id);
                  const hasEmail = !!c?.email;
                  const hasPhone = !!c?.phone;
                  if (!hasEmail && !hasPhone) return null;

                  if (!isPremium) return (
                    <div style={{
                      background: 'rgba(0,214,143,0.08)', borderRadius: 8,
                      padding: '10px 14px', fontSize: 13, color: 'var(--slate)',
                      border: '1px solid rgba(0,214,143,0.2)',
                    }}>
                      ⚡ <strong style={{ color: 'var(--accent-dim)' }}>Premium</strong> — upgrade to send email or text confirmation requests to contacts.
                    </div>
                  );
                  return (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 8 }}>
                        Send a confirmation request to {c.name}?
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                          fontSize: 13, padding: '6px 12px', borderRadius: 8,
                          background: form.notify === 'none' ? 'var(--navy)' : 'var(--off-white)',
                          color: form.notify === 'none' ? 'var(--white)' : 'var(--slate)',
                          border: '1px solid var(--border)', transition: 'all 0.15s' }}>
                          <input type="radio" name="notify" value="none"
                            checked={form.notify === 'none'}
                            onChange={() => setForm(f => ({ ...f, notify: 'none', send_request: false }))}
                            style={{ display: 'none' }} />
                          Just assign
                        </label>
                        {hasEmail && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                            fontSize: 13, padding: '6px 12px', borderRadius: 8,
                            background: form.notify === 'email' ? 'var(--navy)' : 'var(--off-white)',
                            color: form.notify === 'email' ? 'var(--white)' : 'var(--slate)',
                            border: '1px solid var(--border)', transition: 'all 0.15s' }}>
                            <input type="radio" name="notify" value="email"
                              checked={form.notify === 'email'}
                              onChange={() => setForm(f => ({ ...f, notify: 'email', send_request: true }))}
                              style={{ display: 'none' }} />
                            📧 Email
                          </label>
                        )}
                        {hasPhone && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                            fontSize: 13, padding: '6px 12px', borderRadius: 8,
                            background: form.notify === 'sms' ? 'var(--navy)' : 'var(--off-white)',
                            color: form.notify === 'sms' ? 'var(--white)' : 'var(--slate)',
                            border: '1px solid var(--border)', transition: 'all 0.15s' }}>
                            <input type="radio" name="notify" value="sms"
                              checked={form.notify === 'sms'}
                              onChange={() => setForm(f => ({ ...f, notify: 'sms', send_request: true }))}
                              style={{ display: 'none' }} />
                            💬 Text
                          </label>
                        )}
                        {hasEmail && hasPhone && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                            fontSize: 13, padding: '6px 12px', borderRadius: 8,
                            background: form.notify === 'both' ? 'var(--navy)' : 'var(--off-white)',
                            color: form.notify === 'both' ? 'var(--white)' : 'var(--slate)',
                            border: '1px solid var(--border)', transition: 'all 0.15s' }}>
                            <input type="radio" name="notify" value="both"
                              checked={form.notify === 'both'}
                              onChange={() => setForm(f => ({ ...f, notify: 'both', send_request: true }))}
                              style={{ display: 'none' }} />
                            📧 + 💬 Both
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="submit" className="btn btn-primary" disabled={!form.contact_id || saving === 'assign'}
                    style={{ flex: 1, justifyContent: 'center' }}>
                    {saving === 'assign' ? <span className="spinner" style={{ width: 14, height: 14 }} /> :
                      form.notify === 'none' ? 'Assign' :
                      form.notify === 'email' ? 'Assign & email' :
                      form.notify === 'sms' ? 'Assign & text' :
                      'Assign & notify'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={onClose}>Done</button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  , document.body);
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
    // Use local time components so the datetime-local input shows correct local time
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
    recurrence:        'none',
    recurrence_days:   [],
    recurrence_until:  '',
  });

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function toggleRecurrenceDay(day) {
    setForm(f => ({
      ...f,
      recurrence_days: f.recurrence_days.includes(day)
        ? f.recurrence_days.filter(d => d !== day)
        : [...f.recurrence_days, day],
    }));
  }
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
      // Convert datetime-local values to proper ISO strings with local timezone offset
      function localToISO(val) {
        if (!val) return null;
        // datetime-local gives "2026-04-11T18:00" — treat as local time
        const d = new Date(val);
        return d.toISOString();
      }

      const payload = {
        ...form,
        starts_at: localToISO(form.starts_at),
        ends_at: form.ends_at ? localToISO(form.ends_at) : null,
        location: form.location || null,
        description: form.description || null,
        recurrence_until: form.recurrence_until || null,
      };
      if (isEditing) {
        const { event } = await api.manual.update(existingEvent.id, payload);
        onSave(event, 1);
      } else {
        const { event, count } = await api.manual.create(payload);
        onSave(event, count);
      }
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

          {!isEditing && (
            <div className="field">
              <label>Repeats</label>
              <select className="input" value={form.recurrence} onChange={e => setField('recurrence', e.target.value)}>
                <option value="none">Does not repeat</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          )}

          {!isEditing && form.recurrence !== 'none' && (
            <>
              {(form.recurrence === 'weekly' || form.recurrence === 'biweekly') && (
                <div className="field">
                  <label>Repeat on</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {DAY_LABELS.map((label, i) => (
                      <button key={i} type="button" onClick={() => toggleRecurrenceDay(i)}
                        style={{
                          width: 40, height: 36, borderRadius: 8, fontSize: 12, fontWeight: 600,
                          border: `2px solid ${form.recurrence_days.includes(i) ? 'var(--accent)' : 'var(--border)'}`,
                          background: form.recurrence_days.includes(i) ? 'rgba(0,214,143,0.15)' : 'transparent',
                          color: form.recurrence_days.includes(i) ? 'var(--accent-dim)' : 'var(--slate)',
                          cursor: 'pointer',
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="field">
                <label>Repeat until</label>
                <input className="input" type="date"
                  value={form.recurrence_until}
                  onChange={e => setField('recurrence_until', e.target.value)}
                  required />
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving
                ? <span className="spinner" style={{ width: 14, height: 14 }} />
                : isEditing ? 'Save changes' : form.recurrence !== 'none' ? 'Add recurring events' : 'Add to calendar'}
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
