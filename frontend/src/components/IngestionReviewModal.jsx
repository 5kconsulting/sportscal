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

function EventRow({ index, event, selected, onToggle, onEdit }) {
  const needsAttention =
    (event.ambiguous_fields && event.ambiguous_fields.length > 0) ||
    (event.confidence ?? 1) < 0.7;

  return (
    <tr style={needsAttention ? { ...S.rowAttention } : undefined}>
      <td style={S.td}>
        <input type="checkbox" checked={selected} onChange={() => onToggle(index)} />
      </td>
      <td style={{ ...S.td, width: 24 }}>{needsAttention ? '⚠️' : ''}</td>
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

function EditDrawer({ event, onSave, onClose }) {
  const [local, setLocal] = useState(event);
  useEffect(() => setLocal(event), [event]);
  if (!event) return null;

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
    <div style={S.drawer}>
      <h3 style={S.drawerTitle}>Edit event</h3>

      <label style={S.drawerLabel}>
        Title
        <input type="text" style={S.drawerInput}
          value={local.display_title || ''}
          onChange={(e) => update('display_title', e.target.value)} />
      </label>

      <label style={S.drawerLabel}>
        Start date
        <input type="date" style={S.drawerInput}
          value={startParts.date}
          onChange={(e) => onStartDate(e.target.value)} />
      </label>

      {!local.all_day && (
        <label style={S.drawerLabel}>
          Start time
          <input type="time" style={S.drawerInput}
            value={startParts.time}
            onChange={(e) => onStartTime(e.target.value)} />
        </label>
      )}

      <label style={S.drawerLabel}>
        End date (optional)
        <input type="date" style={S.drawerInput}
          value={endParts.date}
          onChange={(e) => onEndDate(e.target.value)} />
      </label>

      {!local.all_day && (
        <label style={S.drawerLabel}>
          End time (optional)
          <input type="time" style={S.drawerInput}
            value={endParts.time}
            onChange={(e) => onEndTime(e.target.value)} />
        </label>
      )}

      <label style={S.drawerLabel}>
        Location
        <input type="text" style={S.drawerInput}
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
        <button type="button" style={S.btnSecondary} onClick={onClose}>Cancel</button>
        <button type="button" style={S.btnPrimary} onClick={() => onSave(local)}>Save</button>
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

  const attentionCount = useMemo(() => {
    return events.filter(
      (e) => (e.ambiguous_fields && e.ambiguous_fields.length > 0) ||
             (e.confidence ?? 1) < 0.7,
    ).length;
  }, [events]);

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
        const low = (e.confidence ?? 1) < 0.7 ||
                    (e.ambiguous_fields?.length ?? 0) > 0;
        if (low) next.delete(i);
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

  return (
    <div style={S.scrim} role="dialog" aria-modal="true" onClick={onCancel}>
      <div style={S.panel} onClick={(e) => e.stopPropagation()}>
        <header style={S.header}>
          <div>
            <h2 style={S.title}>
              {isReplace
                ? `Replacing schedule for ${kidName || 'your kid'}`
                : `Review events for ${kidName || 'your kid'}`}
            </h2>
            <p style={S.subtitle}>
              {events.length} event{events.length === 1 ? '' : 's'} found
              {attentionCount > 0 ? ' • ' + attentionCount + ' need attention' : ''}
            </p>
          </div>
          <button type="button" style={S.close} onClick={onCancel} aria-label="Close">×</button>
        </header>

        {isReplace && (
          <div style={S.replaceBanner}>
            <span>🔄</span>
            <span>
              This will replace existing events for{' '}
              <strong>{replacingSource.name}</strong>. Any ride assignments
              on the removed events will be lost.
            </span>
          </div>
        )}

        <div style={S.toolbar}>
          <input type="text" style={S.toolbarInput}
            placeholder={isReplace
              ? `Rename to (optional) — currently "${replacingSource.name}"`
              : 'Name this schedule (e.g. Chess Club Spring 2026)'}
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)} />
          <div style={S.toolbarActions}>
            <button type="button" style={S.btnSecondary} onClick={selectAll}>Select all</button>
            <button type="button" style={S.btnSecondary} onClick={deselectLow}>Deselect flagged</button>
          </div>
        </div>

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

        <footer style={S.footer}>
          <button type="button" style={S.btnSecondary}
            onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="button"
            style={approveDisabled
              ? { ...(isReplace ? S.btnDanger : S.btnPrimary), ...S.btnDisabled }
              : (isReplace ? S.btnDanger : S.btnPrimary)}
            onClick={handleApproveClick}
            disabled={approveDisabled}>
            {approveLabel}
          </button>
        </footer>

        {editingIndex !== null && (
          <EditDrawer event={events[editingIndex]}
            onSave={saveEdit}
            onClose={() => setEditingIndex(null)} />
        )}

        {showConfirm && (
          <div style={S.confirmScrim} onClick={() => setShowConfirm(false)}>
            <div style={S.confirmPanel} onClick={(e) => e.stopPropagation()}>
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
