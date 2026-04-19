// ============================================================================
// IngestionReviewModal.jsx — full-screen review of extracted events.
//
// Props:
//   ingestion   — the ingestion row (with extracted_events populated)
//   kidName     — for header
//   onApprove(editedEvents, sourceName)
//   onCancel()
// ============================================================================

import { useState, useMemo, useEffect } from 'react';

function formatDateTime(iso, allDay) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (allDay) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function EventRow({ index, event, selected, onToggle, onEdit }) {
  const needsAttention =
    (event.ambiguous_fields && event.ambiguous_fields.length > 0) ||
    (event.confidence ?? 1) < 0.7;

  return (
    <tr className={needsAttention ? 'attention' : ''}>
      <td>
        <input type="checkbox" checked={selected} onChange={() => onToggle(index)} />
      </td>
      <td>{needsAttention ? '⚠️' : ''}</td>
      <td>{formatDateTime(event.starts_at, event.all_day)}</td>
      <td>{event.display_title || event.raw_title}</td>
      <td>{event.location || '—'}</td>
      <td>{event.event_type || '—'}</td>
      <td>
        <button type="button" onClick={() => onEdit(index)}>Edit</button>
      </td>
    </tr>
  );
}

function EditDrawer({ event, onSave, onClose }) {
  const [local, setLocal] = useState(event);

  useEffect(() => setLocal(event), [event]);

  if (!event) return null;

  const update = (k, v) => setLocal((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="edit-drawer">
      <h3>Edit event</h3>
      <label>
        Title
        <input
          type="text"
          value={local.display_title || ''}
          onChange={(e) => update('display_title', e.target.value)}
        />
      </label>
      <label>
        Starts at (ISO)
        <input
          type="text"
          value={local.starts_at || ''}
          onChange={(e) => update('starts_at', e.target.value)}
        />
      </label>
      <label>
        Ends at (ISO, optional)
        <input
          type="text"
          value={local.ends_at || ''}
          onChange={(e) => update('ends_at', e.target.value || null)}
        />
      </label>
      <label>
        Location
        <input
          type="text"
          value={local.location || ''}
          onChange={(e) => update('location', e.target.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={!!local.all_day}
          onChange={(e) => update('all_day', e.target.checked)}
        />
        All-day event
      </label>
      <div className="edit-drawer-actions">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" onClick={() => onSave(local)}>Save</button>
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

  useEffect(() => {
    setEvents(initialEvents);
    setSelected(new Set(initialEvents.map((_, i) => i)));
  }, [initialEvents]);

  const attentionCount = useMemo(() => {
    return events.filter(
      (e) => (e.ambiguous_fields && e.ambiguous_fields.length > 0) || (e.confidence ?? 1) < 0.7,
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
        const low = (e.confidence ?? 1) < 0.7 || (e.ambiguous_fields?.length ?? 0) > 0;
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

  const handleApprove = async () => {
    const toSend = events.filter((_, i) => selected.has(i));
    if (toSend.length === 0) return;
    setSubmitting(true);
    try {
      await onApprove(toSend, sourceName || null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ingestion-review-modal" role="dialog" aria-modal="true">
      <div className="modal-scrim" onClick={onCancel} />
      <div className="modal-panel">
        <header>
          <div>
            <h2>Review events for {kidName || 'your kid'}</h2>
            <p>
              {events.length} events found
              {attentionCount > 0 ? ' • ' + attentionCount + ' need attention' : ''}
            </p>
          </div>
          <button type="button" className="close" onClick={onCancel}>×</button>
        </header>

        <div className="toolbar">
          <input
            type="text"
            placeholder="Name this schedule (e.g. JV Volleyball Fall 2026)"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
          />
          <div className="toolbar-actions">
            <button type="button" onClick={selectAll}>Select all</button>
            <button type="button" onClick={deselectLow}>Deselect flagged</button>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th></th>
                <th>When</th>
                <th>Title</th>
                <th>Location</th>
                <th>Type</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev, i) => (
                <EventRow
                  key={i}
                  index={i}
                  event={ev}
                  selected={selected.has(i)}
                  onToggle={toggleRow}
                  onEdit={setEditingIndex}
                />
              ))}
            </tbody>
          </table>
        </div>

        <footer>
          <button type="button" onClick={onCancel} disabled={submitting}>Cancel</button>
          <button
            type="button"
            className="primary"
            onClick={handleApprove}
            disabled={submitting || selected.size === 0}
          >
            {submitting ? 'Adding…' : 'Add ' + selected.size + ' events to calendar'}
          </button>
        </footer>

        {editingIndex !== null && (
          <EditDrawer
            event={events[editingIndex]}
            onSave={saveEdit}
            onClose={() => setEditingIndex(null)}
          />
        )}
      </div>
    </div>
  );
}
