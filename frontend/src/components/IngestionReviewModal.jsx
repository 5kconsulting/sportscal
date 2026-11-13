// ============================================================================
// IngestionReviewModal.jsx — full-screen review of extracted events.
// Inline styles to match the app's convention (no separate CSS file).
//
// Props:
//   ingestion   — the ingestion row (with extracted_events populated).
//                 If ingestion.replacing_source is present, the modal shifts
//                 into "replace mode" with a banner, confirm dialog, and
//                 different button copy.
//   kidName     — for header
//   onApprove(editedEvents, sourceName)
//   onCancel()
// ============================================================================

import { useState, useMemo, useEffect } from 'react';

const S = {
  scrim: {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(15, 23, 42, 0.55)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: '2rem 1rem', overflowY: 'auto',
  },
  panel: {
    position: 'relative',
    width: 'min(1100px, 100%)',
    maxHeight: 'calc(100vh - 4rem)',
    background: 'var(--card-bg, #ffffff)',
    borderRadius: 12,
    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.3)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)',
  },
  title: {
    margin: '0 0 0.25rem', fontSize: '1.15rem', fontWeight: 600,
    letterSpacing: '-0.01em', color: 'var(--navy)',
  },
  subtitle: { margin: 0, color: 'var(--slate)', fontSize: 13 },
  close: {
    background: 'transparent', border: 'none', fontSize: '1.5rem',
    lineHeight: 1, cursor: 'pointer', color: 'var(--slate)', padding: 4,
  },
  replaceBanner: {
    padding: '0.75rem 1.5rem',
    background: 'rgba(234, 179, 8, 0.12)',
    borderBottom: '1px solid rgba(234, 179, 8, 0.3)',
    fontSize: 13, color: 'var(--navy)',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  toolbar: {
    display: 'flex', gap: '1rem',
    padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)',
    alignItems: 'center', flexWrap: 'wrap',
  },
  toolbarInput: {
    flex: '1 1 260px',
    padding: '0.5rem 0.75rem',
    border: '1px solid var(--border)', borderRadius: 6,
    fontSize: 14, fontFamily: 'inherit', outline: 'none',
    background: 'var(--card-bg, #fff)', color: 'var(--navy)',
  },
  toolbarActions: { display: 'flex', gap: 8 },
  btnSecondary: {
    padding: '0.5rem 0.9rem', border: '1px solid var(--border)',
    background: 'var(--card-bg, #fff)', borderRadius: 6,
    cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: 'var(--navy)',
  },
  btnPrimary: {
    padding: '0.5rem 0.9rem', border: '1px solid var(--accent)',
    background: 'var(--accent)', borderRadius: 6,
    cursor: 'pointer', fontSize: 13, fontWeight: 500,
    fontFamily: 'inherit', color: 'var(--navy)',
  },
  btnDanger: {
    padding: '0.5rem 0.9rem', border: '1px solid #dc2626',
    background: '#dc2626', borderRadius: 6,
    cursor: 'pointer', fontSize: 13, fontWeight: 500,
    fontFamily: 'inherit', color: '#fff',
  },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  tableWrap: { flex: 1, overflow: 'auto', minHeight: 120 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: {
    position: 'sticky', top: 0, background: 'var(--card-bg, #fff)',
    fontWeight: 600, color: 'var(--slate)',
    fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
    padding: '0.6rem 0.8rem', textAlign: 'left',
    borderBottom: '1px solid var(--border)', zIndex: 1,
  },
  td: {
    padding: '0.6rem 0.8rem', textAlign: 'left',
    borderBottom: '1px solid var(--border)', color: 'var(--navy)',
  },
  rowAttention: { background: 'rgba(234, 179, 8, 0.08)' },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: 12,
    padding: '1rem 1.5rem', borderTop: '1px solid var(--border)',
    background: 'var(--card-bg, #fff)',
  },
  editRow: {
    cursor: 'pointer', textDecoration: 'underline',
    color: 'var(--accent-dim, #0891b2)', background: 'transparent',
    border: 'none', fontSize: 13, fontFamily: 'inherit', padding: 0,
  },
  drawer: {
    position: 'absolute', top: 0, right: 0, bottom: 0,
    width: 'min(420px, 90vw)', background: 'var(--card-bg, #fff)',
    borderLeft: '1px solid var(--border)', padding: '1.5rem',
    overflow: 'auto', boxShadow: '-12px 0 24px rgba(0, 0, 0, 0.08)',
    zIndex: 2,
  },
  drawerTitle: { marginTop: 0, fontSize: '1.1rem', color: 'var(--navy)' },
  drawerLabel: {
    display: 'block', marginBottom: '1rem', fontSize: 12,
    color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  drawerInput: {
    display: 'block', width: '100%', marginTop: 4,
    padding: '0.5rem 0.65rem', border: '1px solid var(--border)',
    borderRadius: 6, fontSize: 14, fontFamily: 'inherit', outline: 'none',
    background: 'var(--card-bg, #fff)', color: 'var(--navy)',
    textTransform: 'none', letterSpacing: 'normal',
  },
  drawerActions: {
    display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.5rem',
  },
  // Confirm dialog overlay (z-index above the drawer)
  confirmScrim: {
    position: 'absolute', inset: 0, zIndex: 3,
    background: 'rgba(15, 23, 42, 0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  confirmPanel: {
    maxWidth: 440, background: 'var(--card-bg, #fff)',
    borderRadius: 10, padding: '1.5rem',
    boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
  },
  confirmTitle: { margin: '0 0 0.5rem', fontSize: '1.05rem', color: 'var(--navy)', fontWeight: 600 },
  confirmBody:  { margin: '0 0 1.25rem', fontSize: 14, color: 'var(--slate)', lineHeight: 1.5 },
};

// Phone-width overrides. The desktop layout is a 7-column table; below
// 640px the columns crush (Type gets cut to "practic…"), so phones get a
// full-screen sheet with one card per event instead.
const P = {
  scrim:  { padding: 0, alignItems: 'stretch' },
  panel:  { width: '100%', height: '100dvh', maxHeight: 'none', borderRadius: 0, boxShadow: 'none' },
  header: { padding: '14px 8px 12px 16px', alignItems: 'center' },
  title:  { fontSize: 17 },
  close:  { width: 44, height: 44, fontSize: 28, flexShrink: 0 },
  replaceBanner: { padding: '10px 16px' },
  toolbar: { padding: '12px 16px', gap: 10 },
  // 16px keeps iOS Safari from zooming in when the field gets focus.
  toolbarInput: { flex: '1 1 100%', fontSize: 16, padding: '10px 12px' },
  toolbarActions: { width: '100%' },
  toolbarBtn: { flex: 1, padding: '10px 8px', fontSize: 14 },
  list: { flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', minHeight: 120 },
  card: {
    display: 'flex', alignItems: 'flex-start', gap: 12,
    padding: '14px 8px 14px 16px', borderBottom: '1px solid var(--border)',
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
  cardOff: { opacity: 0.45 },
  check: { width: 22, height: 22, margin: '1px 0 0', flexShrink: 0, accentColor: 'var(--accent)' },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--navy)', lineHeight: 1.35, overflowWrap: 'anywhere' },
  cardWhen:  { margin: '3px 0 0', fontSize: 14, color: 'var(--navy)' },
  cardMeta:  { margin: '3px 0 0', fontSize: 13, color: 'var(--slate)', lineHeight: 1.4, overflowWrap: 'anywhere' },
  chip: {
    display: 'inline-block', marginRight: 6, padding: '1px 8px', borderRadius: 999,
    background: 'var(--off-white, #f1f5f9)', border: '1px solid var(--border)',
    fontSize: 12, color: 'var(--navy)', textTransform: 'capitalize', verticalAlign: 1,
  },
  attention: { margin: '6px 0 0', fontSize: 13, color: '#92400e' },
  edit: {
    flexShrink: 0, minWidth: 44, minHeight: 44, padding: '0 10px',
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: 'var(--accent-dim, #0891b2)', fontSize: 14, fontWeight: 500, fontFamily: 'inherit',
  },
  footer: { padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', gap: 10 },
  footerBtn: { padding: '12px 14px', fontSize: 15 },
  drawer: { width: '100%', borderLeft: 'none', padding: '20px 16px calc(20px + env(safe-area-inset-bottom))' },
  drawerInput: { fontSize: 16, padding: '10px 12px' },
  confirmPanel: { margin: 16 },
};

const NARROW_QUERY = '(max-width: 640px)';

function useNarrow() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = (e) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

// Merge the phone override onto the base style only when narrow.
function pick(narrow, base, phone) {
  return narrow && phone ? { ...base, ...phone } : base;
}

function formatDateTime(iso, allDay) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (allDay) {
    return d.toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// Card version: "Sat, Nov 15 · 9:00 AM". The weekday matters more than
// the year when you're scanning a season on a phone.
function formatWhen(iso, allDay) {
  if (!iso) return 'No date';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  if (allDay) return day + ' · All day';
  return day + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const FIELD_LABELS = {
  starts_at: 'time', ends_at: 'end time', all_day: 'time', location: 'location',
  opponent: 'opponent', home_away: 'home/away', event_type: 'type',
  display_title: 'title', raw_title: 'title',
};

function attentionNote(event) {
  const fields = [...new Set((event.ambiguous_fields || []).map((f) => FIELD_LABELS[f] || f))];
  return fields.length ? 'Double-check the ' + fields.join(', ') : 'Double-check this one';
}

function needsAttention(event) {
  return (event.ambiguous_fields && event.ambiguous_fields.length > 0) ||
    (event.confidence ?? 1) < 0.7;
}

function EventCard({ index, event, selected, onToggle, onEdit }) {
  const flagged = needsAttention(event);
  const meta = [event.location].filter(Boolean);
  return (
    <div
      style={{ ...P.card, ...(flagged ? S.rowAttention : null) }}
      onClick={() => onToggle(index)}
    >
      <input type="checkbox" style={P.check} checked={selected}
        aria-label={'Include ' + (event.display_title || event.raw_title || 'event')}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggle(index)} />
      <div style={{ ...P.cardBody, ...(selected ? null : P.cardOff) }}>
        <p style={P.cardTitle}>{event.display_title || event.raw_title || 'Untitled event'}</p>
        <p style={P.cardWhen}>{formatWhen(event.starts_at, event.all_day)}</p>
        {(event.event_type || meta.length > 0) && (
          <p style={P.cardMeta}>
            {event.event_type && <span style={P.chip}>{event.event_type}</span>}
            {meta.join(' · ')}
          </p>
        )}
        {flagged && <p style={P.attention}>⚠️ {attentionNote(event)}</p>}
      </div>
      <button type="button" style={P.edit}
        onClick={(e) => { e.stopPropagation(); onEdit(index); }}>
        Edit
      </button>
    </div>
  );
}

function EventRow({ index, event, selected, onToggle, onEdit }) {
  const flagged = needsAttention(event);

  return (
    <tr style={flagged ? { ...S.rowAttention } : undefined}>
      <td style={S.td}>
        <input type="checkbox" checked={selected} onChange={() => onToggle(index)} />
      </td>
      <td style={{ ...S.td, width: 24 }}>{flagged ? '⚠️' : ''}</td>
      <td style={S.td}>{formatDateTime(event.starts_at, event.all_day)}</td>
      <td style={S.td}>{event.display_title || event.raw_title}</td>
      <td style={S.td}>{event.location || '—'}</td>
      <td style={S.td}>{event.event_type || '—'}</td>
      <td style={S.td}>
        <button type="button" style={S.editRow} onClick={() => onEdit(index)}>Edit</button>
      </td>
    </tr>
  );
}

function isoToDateParts(iso) {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
    time: pad(d.getHours()) + ':' + pad(d.getMinutes()),
  };
}

function datePartsToIso(date, time, allDay) {
  if (!date) return null;
  if (allDay) return new Date(date + 'T00:00:00').toISOString();
  if (!time) return null;
  return new Date(date + 'T' + time + ':00').toISOString();
}

function EditDrawer({ event, onSave, onClose, narrow }) {
  const [local, setLocal] = useState(event);
  useEffect(() => setLocal(event), [event]);
  if (!event) return null;

  const inputStyle = pick(narrow, S.drawerInput, P.drawerInput);
  const btn = (base) => pick(narrow, base, P.footerBtn);

  const update = (k, v) => setLocal((prev) => ({ ...prev, [k]: v }));

  const startParts = isoToDateParts(local.starts_at);
  const endParts = isoToDateParts(local.ends_at);

  const onStartDate = (val) => {
    const iso = datePartsToIso(val, startParts.time || '00:00', local.all_day);
    update('starts_at', iso);
  };
  const onStartTime = (val) => {
    const iso = datePartsToIso(startParts.date, val, false);
    update('starts_at', iso);
  };
  const onEndDate = (val) => {
    if (!val) { update('ends_at', null); return; }
    const iso = datePartsToIso(val, endParts.time || startParts.time || '00:00', local.all_day);
    update('ends_at', iso);
  };
  const onEndTime = (val) => {
    if (!val) { update('ends_at', null); return; }
    const iso = datePartsToIso(endParts.date || startParts.date, val, false);
    update('ends_at', iso);
  };
  const onAllDayToggle = (checked) => {
    update('all_day', checked);
    if (checked && startParts.date) {
      update('starts_at', datePartsToIso(startParts.date, '00:00', true));
      if (endParts.date) update('ends_at', datePartsToIso(endParts.date, '00:00', true));
    }
  };

  return (
    <div style={pick(narrow, S.drawer, P.drawer)}>
      <h3 style={S.drawerTitle}>Edit event</h3>

      <label style={S.drawerLabel}>
        Title
        <input type="text" style={inputStyle}
          value={local.display_title || ''}
          onChange={(e) => update('display_title', e.target.value)} />
      </label>

      <label style={S.drawerLabel}>
        Start date
        <input type="date" style={inputStyle}
          value={startParts.date}
          onChange={(e) => onStartDate(e.target.value)} />
      </label>

      {!local.all_day && (
        <label style={S.drawerLabel}>
          Start time
          <input type="time" style={inputStyle}
            value={startParts.time}
            onChange={(e) => onStartTime(e.target.value)} />
        </label>
      )}

      <label style={S.drawerLabel}>
        End date (optional)
        <input type="date" style={inputStyle}
          value={endParts.date}
          onChange={(e) => onEndDate(e.target.value)} />
      </label>

      {!local.all_day && (
        <label style={S.drawerLabel}>
          End time (optional)
          <input type="time" style={inputStyle}
            value={endParts.time}
            onChange={(e) => onEndTime(e.target.value)} />
        </label>
      )}

      <label style={S.drawerLabel}>
        Location
        <input type="text" style={inputStyle}
          value={local.location || ''}
          onChange={(e) => update('location', e.target.value)} />
      </label>

      <label style={{ ...S.drawerLabel, textTransform: 'none', letterSpacing: 'normal', fontSize: 13, color: 'var(--navy)' }}>
        <input type="checkbox"
          checked={!!local.all_day}
          onChange={(e) => onAllDayToggle(e.target.checked)}
          style={{ marginRight: 8 }} />
        All-day event
      </label>

      <div style={S.drawerActions}>
        <button type="button" style={btn(S.btnSecondary)} onClick={onClose}>Cancel</button>
        <button type="button" style={narrow ? { ...btn(S.btnPrimary), flex: 1 } : S.btnPrimary}
          onClick={() => onSave(local)}>Save</button>
      </div>
    </div>
  );
}

export default function IngestionReviewModal({ ingestion, kidName, onApprove, onCancel }) {
  const initialEvents = useMemo(() => ingestion?.extracted_events || [], [ingestion]);

  const [events, setEvents] = useState(initialEvents);
  const [selected, setSelected] = useState(
    () => new Set(initialEvents.map((_, i) => i)),
  );
  const [editingIndex, setEditingIndex] = useState(null);
  const [sourceName, setSourceName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Replace-mode detection: the API surfaces ingestion.replacing_source
  // when this ingestion is linked to an existing source pre-approval.
  const replacingSource = ingestion?.replacing_source || null;
  const isReplace = !!replacingSource;

  useEffect(() => {
    setEvents(initialEvents);
    setSelected(new Set(initialEvents.map((_, i) => i)));
  }, [initialEvents]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const narrow = useNarrow();

  const attentionCount = useMemo(() => events.filter(needsAttention).length, [events]);

  const toggleRow = (i) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(events.map((_, i) => i)));

  const deselectLow = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      events.forEach((e, i) => {
        if (needsAttention(e)) next.delete(i);
      });
      return next;
    });
  };

  const saveEdit = (edited) => {
    setEvents((prev) => {
      const next = [...prev];
      next[editingIndex] = edited;
      return next;
    });
    setEditingIndex(null);
  };

  const doApprove = async () => {
    const toSend = events.filter((_, i) => selected.has(i));
    if (toSend.length === 0) return;
    setShowConfirm(false);
    setSubmitting(true);
    try {
      await onApprove(toSend, sourceName || null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveClick = () => {
    if (isReplace) {
      // Destructive: require a second tap.
      setShowConfirm(true);
    } else {
      doApprove();
    }
  };

  const approveDisabled = submitting || selected.size === 0;

  // Button copy differs between create and replace modes.
  const approveLabel = submitting
    ? (isReplace ? 'Replacing…' : 'Adding…')
    : isReplace
      ? 'Replace events'
      : 'Add ' + selected.size + ' event' + (selected.size === 1 ? '' : 's') + ' to calendar';

  const approveBase = isReplace ? S.btnDanger : S.btnPrimary;
  const approveStyle = {
    ...pick(narrow, approveBase, P.footerBtn),
    ...(narrow ? { flex: 1 } : null),
    ...(approveDisabled ? S.btnDisabled : null),
  };
  const toolbarBtn = (base) => pick(narrow, base, P.toolbarBtn);

  return (
    <div style={pick(narrow, S.scrim, P.scrim)} role="dialog" aria-modal="true" onClick={onCancel}>
      <div style={pick(narrow, S.panel, P.panel)} onClick={(e) => e.stopPropagation()}>
        <header style={pick(narrow, S.header, P.header)}>
          <div style={{ minWidth: 0 }}>
            <h2 style={pick(narrow, S.title, P.title)}>
              {isReplace
                ? `Replacing schedule for ${kidName || 'your kid'}`
                : `Review events for ${kidName || 'your kid'}`}
            </h2>
            <p style={S.subtitle}>
              {events.length} event{events.length === 1 ? '' : 's'} found
              {attentionCount > 0 ? ' • ' + attentionCount + ' need attention' : ''}
            </p>
          </div>
          <button type="button" style={pick(narrow, S.close, P.close)} onClick={onCancel} aria-label="Close">×</button>
        </header>

        {isReplace && (
          <div style={pick(narrow, S.replaceBanner, P.replaceBanner)}>
            <span>🔄</span>
            <span>
              This will replace existing events for{' '}
              <strong>{replacingSource.name}</strong>. Any ride assignments
              on the removed events will be lost.
            </span>
          </div>
        )}

        <div style={pick(narrow, S.toolbar, P.toolbar)}>
          <input type="text" style={pick(narrow, S.toolbarInput, P.toolbarInput)}
            placeholder={isReplace
              ? (narrow ? 'Rename (optional)' : `Rename to (optional) — currently "${replacingSource.name}"`)
              : (narrow ? 'Name this schedule (optional)' : 'Name this schedule (e.g. Chess Club Spring 2026)')}
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)} />
          <div style={pick(narrow, S.toolbarActions, P.toolbarActions)}>
            <button type="button" style={toolbarBtn(S.btnSecondary)} onClick={selectAll}>Select all</button>
            {/* Only worth showing when something is actually flagged. */}
            {(!narrow || attentionCount > 0) && (
              <button type="button" style={toolbarBtn(S.btnSecondary)} onClick={deselectLow}>Deselect flagged</button>
            )}
          </div>
        </div>

        {narrow ? (
          <div style={P.list}>
            {events.length === 0 && (
              <p style={{ ...P.cardMeta, padding: '24px 16px', textAlign: 'center' }}>
                No events found in this file.
              </p>
            )}
            {events.map((ev, i) => (
              <EventCard key={i} index={i} event={ev}
                selected={selected.has(i)}
                onToggle={toggleRow}
                onEdit={setEditingIndex} />
            ))}
          </div>
        ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, width: 36 }} />
                <th style={{ ...S.th, width: 28 }} />
                <th style={S.th}>When</th>
                <th style={S.th}>Title</th>
                <th style={S.th}>Location</th>
                <th style={S.th}>Type</th>
                <th style={{ ...S.th, width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {events.map((ev, i) => (
                <EventRow key={i} index={i} event={ev}
                  selected={selected.has(i)}
                  onToggle={toggleRow}
                  onEdit={setEditingIndex} />
              ))}
            </tbody>
          </table>
        </div>
        )}

        <footer style={pick(narrow, S.footer, P.footer)}>
          <button type="button" style={pick(narrow, S.btnSecondary, P.footerBtn)}
            onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="button"
            style={approveStyle}
            onClick={handleApproveClick}
            disabled={approveDisabled}>
            {approveLabel}
          </button>
        </footer>

        {editingIndex !== null && (
          <EditDrawer event={events[editingIndex]}
            narrow={narrow}
            onSave={saveEdit}
            onClose={() => setEditingIndex(null)} />
        )}

        {showConfirm && (
          <div style={S.confirmScrim} onClick={() => setShowConfirm(false)}>
            <div style={pick(narrow, S.confirmPanel, P.confirmPanel)} onClick={(e) => e.stopPropagation()}>
              <h3 style={S.confirmTitle}>Replace existing events?</h3>
              <p style={S.confirmBody}>
                All events currently on <strong>{replacingSource.name}</strong> will
                be deleted and replaced with the {selected.size} event
                {selected.size === 1 ? '' : 's'} you've selected. Any ride
                assignments on the removed events will be lost. This action
                cannot be undone.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" style={S.btnSecondary} onClick={() => setShowConfirm(false)}>
                  Cancel
                </button>
                <button type="button" style={S.btnDanger} onClick={doApprove}>
                  Yes, replace
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
