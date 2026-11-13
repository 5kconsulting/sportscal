// HiddenEventsSection — Settings → "Hidden events".
//
// Lists synced events the user removed with "Remove from SportsCal" (event
// details on the dashboard, or the iPhone app) and lets them restore each
// one. The server snapshots title + start time when an event is hidden, so
// rows still render even if the team's feed has since dropped the event.
//
// Renders nothing until there's something to restore: the section shows
// up the first time someone removes an event, which is the only time
// they'd come looking for it.

import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function HiddenEventsSection() {
  const [hidden, setHidden] = useState([]);
  const [restoringId, setRestoringId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.events.hidden()
      .then(({ hidden }) => { if (!cancelled) setHidden(hidden || []); })
      .catch(() => { /* non-critical: leave the section hidden */ });
    return () => { cancelled = true; };
  }, []);

  async function restore(item) {
    setError('');
    setRestoringId(item.id);
    try {
      await api.events.unhide(item.id);
      setHidden(h => h.filter(x => x.id !== item.id));
    } catch (err) {
      setError(err.message || 'Could not restore that event. Try again.');
    } finally {
      setRestoringId(null);
    }
  }

  if (hidden.length === 0) return null;

  return (
    <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--slate)',
                   textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        Hidden events
      </h2>
      <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 16, lineHeight: 1.6 }}>
        Events you removed from SportsCal. Restore one to put it back on your calendar.
      </p>
      {error && (
        <p style={{ fontSize: 13, color: '#dc2626', marginBottom: 12 }}>{error}</p>
      )}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {hidden.map((item, i) => (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
            borderTop: i === 0 ? 'none' : '1px solid var(--border)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 500, overflowWrap: 'anywhere' }}>
                {item.hidden_title || 'Untitled event'}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 2 }}>
                {item.source_name}
                {item.hidden_starts_at
                  ? ' · ' + new Date(item.hidden_starts_at).toLocaleDateString(undefined,
                      { weekday: 'short', month: 'short', day: 'numeric' })
                  : ''}
              </div>
            </div>
            <button type="button" className="btn btn-ghost btn-sm"
              style={{ flexShrink: 0 }}
              disabled={restoringId === item.id}
              onClick={() => restore(item)}>
              {restoringId === item.id ? 'Restoring…' : 'Restore'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
