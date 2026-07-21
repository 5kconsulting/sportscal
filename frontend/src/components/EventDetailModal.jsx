import { createPortal } from 'react-dom';

// Small local copies (kept in sync with Dashboard's) so this modal is a
// self-contained component with no circular import back into the page.
const SPORTS = [
  { re: /soccer|f[úu]tbol/i, label: 'Soccer', color: '#16a34a' },
  { re: /swim|dive|aquatic/i, label: 'Swim', color: '#0891b2' },
  { re: /volley/i, label: 'Volleyball', color: '#db2777' },
  { re: /basketball|hoops/i, label: 'Basketball', color: '#ea580c' },
  { re: /baseball|softball|t-?ball/i, label: 'Baseball', color: '#ca8a04' },
  { re: /hockey/i, label: 'Hockey', color: '#0ea5e9' },
  { re: /football/i, label: 'Football', color: '#7c3aed' },
  { re: /lacrosse|lax/i, label: 'Lacrosse', color: '#059669' },
  { re: /tennis/i, label: 'Tennis', color: '#65a30d' },
  { re: /golf/i, label: 'Golf', color: '#15803d' },
  { re: /track|cross.?country|\bxc\b/i, label: 'Track', color: '#dc2626' },
  { re: /gymnastic/i, label: 'Gymnastics', color: '#c026d3' },
  { re: /dance|ballet/i, label: 'Dance', color: '#e11d48' },
  { re: /wrestl/i, label: 'Wrestling', color: '#9333ea' },
];
function inferSport(title = '') {
  for (const sp of SPORTS) if (sp.re.test(title)) return sp;
  return null;
}
function textOn(hex) {
  const h = String(hex).replace('#', '');
  if (h.length !== 6) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#0f172a' : '#ffffff';
}
function countdownLabel(start) {
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const days = Math.round((b - a) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1) return `In ${days} days`;
  return `${-days} days ago`;
}
const fmt = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function RideSlot({ label, row, fg }) {
  const status = row?.status;
  const color =
    status === 'confirmed' ? 'var(--accent)'
    : status === 'declined' ? 'var(--red, #ef4444)'
    : status === 'requested' ? '#f59e0b'
    : 'var(--slate)';
  const statusLabel =
    status === 'confirmed' ? 'Confirmed'
    : status === 'declined' ? 'Declined'
    : status === 'requested' ? 'Awaiting reply'
    : 'Assigned';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px',
      borderStyle: row ? 'solid' : 'dashed',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: row ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--off-white)',
        color: row ? 'var(--accent)' : 'var(--slate)', fontSize: 16,
      }}>🚗</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--slate)' }}>{label}</div>
        {row ? (
          <>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>{row.contact_name}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color }}>{statusLabel}</div>
          </>
        ) : (
          <div style={{ fontSize: 14, color: 'var(--slate)' }}>Not assigned</div>
        )}
      </div>
    </div>
  );
}

export function EventDetailModal({
  event, overrides = {}, onToggleKid, dropoff, pickup,
  onManageRides, onEdit, onDelete, isManual, onClose,
}) {
  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : null;
  const kids = Array.isArray(event.kids) ? event.kids : [];
  const title = event.display_title || event.raw_title;
  const sport = inferSport(title);
  const heroColor = sport?.color || kids[0]?.color || '#2563EB';
  const fg = textOn(heroColor);
  const scrim = fg === '#ffffff' ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.10)';
  const dateLabel = start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const timeLabel = event.all_day ? 'All day' : (end ? `${fmt(start)} – ${fmt(end)}` : fmt(start));

  return createPortal(
    <div onClick={onClose} className="fade-up" style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(15,22,41,0.55)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--white)', borderRadius: 18, overflow: 'hidden',
        boxShadow: 'var(--shadow-lg)',
      }}>
        {/* HERO */}
        <div style={{ position: 'relative', overflow: 'hidden', background: heroColor, color: fg, padding: '20px 22px 22px' }}>
          <svg viewBox="0 0 24 24" width="190" height="190" fill="none" stroke={fg} strokeWidth="1.4"
            style={{ position: 'absolute', right: -30, bottom: -46, opacity: 0.16, transform: 'rotate(-8deg)' }}>
            <circle cx="12" cy="12" r="10" /><path d="M12 6l3.5 2.6-1.3 4.2h-4.4L8.5 8.6z" fill={fg} stroke="none" /><path d="M12 2v4M22 12h-4M12 22v-4M2 12h4" />
          </svg>
          <button onClick={onClose} aria-label="Close" style={{
            position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: '50%',
            border: 'none', cursor: 'pointer', color: fg, background: scrim, fontSize: 15, lineHeight: 1,
          }}>✕</button>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: scrim, borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700 }}>
            ⏱ {countdownLabel(start)}
          </span>
          <h2 style={{ position: 'relative', margin: '14px 0 4px', fontSize: 25, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.12, maxWidth: '86%' }}>{title}</h2>
          <div style={{ position: 'relative', fontSize: 14, fontWeight: 600 }}>{dateLabel} · {timeLabel}</div>
          {kids.length > 0 && (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
              {kids.slice(0, 4).map(k => (
                <div key={k.id} style={{
                  width: 32, height: 32, borderRadius: '50%', border: `2px solid ${fg}`,
                  background: k.color || '#2563EB', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                }}>{k.name[0]}</div>
              ))}
              <span style={{ fontSize: 13, fontWeight: 600 }}>{kids.map(k => k.name).join(', ')}{event.source_app ? `  ·  ${event.source_app}` : ''}</span>
            </div>
          )}
        </div>

        {/* BODY */}
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Location */}
          {event.location && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{
                height: 84, position: 'relative',
                background: `
                  linear-gradient(0deg, transparent 23px, ${heroColor}14 24px) 0 0/100% 24px,
                  linear-gradient(90deg, transparent 23px, ${heroColor}14 24px) 0 0/24px 100%,
                  ${heroColor}0a`,
              }}>
                <div style={{ position: 'absolute', left: '-10px', right: '32%', top: 40, height: 6, borderRadius: 3, background: `${heroColor}44`, transform: 'rotate(-6deg)' }} />
                <div style={{ position: 'absolute', width: 6, top: -8, bottom: 18, left: '62%', borderRadius: 3, background: `${heroColor}44`, transform: 'rotate(9deg)' }} />
                <svg viewBox="0 0 24 24" width="26" height="26" fill={heroColor} style={{ position: 'absolute', left: '58%', top: 24 }}>
                  <path d="M12 22s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z" /><circle cx="12" cy="10" r="2.6" fill="#fff" />
                </svg>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.location}</div>
                </div>
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.location)}`}
                  target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">Directions →</a>
              </div>
            </div>
          )}

          {/* Who's going */}
          {kids.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--slate)', marginBottom: 10 }}>Who's going</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {kids.map(k => {
                  const attending = overrides[k.id] !== false;
                  return (
                    <button key={k.id} onClick={() => onToggleKid(k.id, !attending)} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: '4px 12px 4px 4px', borderRadius: 999, cursor: 'pointer',
                      border: '1px solid var(--border)', background: 'var(--off-white)',
                      opacity: attending ? 1 : 0.55,
                    }}>
                      <span style={{ width: 26, height: 26, borderRadius: '50%', background: k.color || '#2563EB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{k.name[0]}</span>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--navy)', textDecoration: attending ? 'none' : 'line-through' }}>{k.name}</span>
                      <span style={{ color: attending ? 'var(--accent)' : 'var(--slate-light)', fontWeight: 700 }}>{attending ? '✓' : '○'}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 10 }}>Tap a kid to toggle whether this shows in their calendar feed.</div>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--slate)', marginBottom: 8 }}>Details</div>
              <div style={{ fontSize: 14, color: 'var(--navy)', lineHeight: 1.5 }}>{event.description}</div>
            </div>
          )}

          {/* Ride coordination */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--slate)' }}>Ride coordination</div>
              <button onClick={onManageRides} className="btn btn-ghost btn-sm">Manage</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <RideSlot label="Pick-up" row={pickup} fg={fg} />
              <RideSlot label="Drop-off" row={dropoff} fg={fg} />
            </div>
          </div>

          {/* Edit / Remove (manual events) */}
          {(onEdit || onDelete) && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              {onEdit && <button onClick={onEdit} className="btn btn-ghost btn-sm">Edit</button>}
              {onDelete && <button onClick={onDelete} className="btn btn-danger btn-sm">Delete</button>}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
