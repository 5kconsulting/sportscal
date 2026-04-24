// Manual event creation / edit modal.
// Extracted from pages/Dashboard.jsx so it can be reused from pages/Sources.jsx.
// Behaviour is unchanged from the inline version; only the location moved.

import { useState } from 'react';
import { api } from '../lib/api.js';

export function AddEventModal({ kids, event: existingEvent, onSave, onCancel }) {
  const isEditing = !!existingEvent;

  function toLocalDatetime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    // Use local time components so the datetime-local input shows correct local time
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const [form, setForm] = useState({
    title:       existingEvent?.title || existingEvent?.raw_title || '',
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
