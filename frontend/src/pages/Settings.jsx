import { useState } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import { api } from '../lib/api.js';

const TIMEZONES = [
  'America/Los_Angeles','America/Denver','America/Chicago','America/New_York',
  'America/Phoenix','Pacific/Honolulu','America/Anchorage',
];

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export default function Settings() {
  const { user, updateUser } = useAuth();
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied]   = useState(false);

  const feedUrl = user ? `${window.location.origin}/feed/${user.feed_token}.ics` : '';

  const [form, setForm] = useState({
    name:                 user?.name || '',
    timezone:             user?.timezone || 'America/Los_Angeles',
    digest_enabled:       user?.digest_enabled ?? true,
    digest_day:           user?.digest_day ?? 0,
    digest_hour:          user?.digest_hour ?? 18,
    reminder_hours_before: user?.reminder_hours_before ?? 12,
  });

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { user: updated } = await api.auth.update(form);
      updateUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRotate() {
    if (!confirm('This will change your calendar feed URL. You\'ll need to re-subscribe in your calendar app. Continue?')) return;
    setRotating(true);
    try {
      const { feed_token } = await api.auth.rotateFeedToken();
      updateUser({ feed_token });
    } catch (err) {
      setError(err.message);
    } finally {
      setRotating(false);
    }
  }

  function copyFeed() {
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ padding: '40px', maxWidth: 580 }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 4 }}>Settings</h1>
      <p style={{ color: 'var(--slate)', fontSize: 15, marginBottom: 36 }}>
        Manage your account and notification preferences.
      </p>

      {error && <div className="error-msg" style={{ marginBottom: 20 }}>{error}</div>}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* Account */}
        <Section title="Account">
          <div className="field">
            <label>Name</label>
            <input className="input" value={form.name}
              onChange={e => setField('name', e.target.value)} />
          </div>
          <div className="field">
            <label>Email</label>
            <input className="input" value={user?.email} disabled
              style={{ opacity: 0.6, cursor: 'not-allowed' }} />
          </div>
          <div className="field">
            <label>Timezone</label>
            <select className="input" value={form.timezone}
              onChange={e => setField('timezone', e.target.value)}>
              {TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
        </Section>

        {/* Calendar feed */}
        <Section title="Calendar feed">
          <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 12, lineHeight: 1.6 }}>
            Subscribe to this URL in Apple Calendar, Google Calendar, or Outlook. It stays live and updates automatically.
          </p>
          <div style={{
            display: 'flex', gap: 8, alignItems: 'center',
            background: 'var(--off-white)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '10px 14px',
          }}>
            <code style={{ flex: 1, fontSize: 12, color: 'var(--navy)',
                           fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>
              {feedUrl}
            </code>
            <button type="button" onClick={copyFeed} className="btn btn-sm btn-ghost" style={{ flexShrink: 0 }}>
              {copied ? '✓' : 'Copy'}
            </button>
          </div>
          <div style={{ marginTop: 10 }}>
            <button type="button" onClick={handleRotate} className="btn btn-ghost btn-sm"
              disabled={rotating} style={{ color: 'var(--red)' }}>
              {rotating ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '↻ Rotate URL'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--slate)', marginLeft: 10 }}>
              Use if your URL was accidentally shared.
            </span>
          </div>
        </Section>

        {/* Email digest */}
        <Section title="Weekly digest">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Toggle
              checked={form.digest_enabled}
              onChange={v => setField('digest_enabled', v)}
            />
            <span style={{ fontSize: 14, color: 'var(--navy)' }}>
              Send me a weekly email digest
            </span>
            {user?.plan === 'free' && (
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 20,
                background: 'var(--amber-bg)', color: 'var(--amber)',
                border: '1px solid #fcd97a', fontWeight: 600,
              }}>
                PRO
              </span>
            )}
          </div>
          {form.digest_enabled && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 1, minWidth: 140 }}>
                <label>Day</label>
                <select className="input" value={form.digest_day}
                  onChange={e => setField('digest_day', Number(e.target.value))}>
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div className="field" style={{ flex: 1, minWidth: 140 }}>
                <label>Time</label>
                <select className="input" value={form.digest_hour}
                  onChange={e => setField('digest_hour', Number(e.target.value))}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {h === 0 ? '12:00 AM' : h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h-12}:00 PM`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </Section>

        {/* Reminders */}
        <Section title="Event reminders">
          <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 12 }}>
            Get an email before each event.
            {user?.plan === 'free' && <span style={{ color: 'var(--amber)', fontWeight: 500 }}> (Pro plan)</span>}
          </p>
          <div className="field">
            <label>Send reminder</label>
            <select className="input" value={form.reminder_hours_before}
              onChange={e => setField('reminder_hours_before', Number(e.target.value))}>
              {[1, 2, 3, 6, 12, 24, 48].map(h => (
                <option key={h} value={h}>{h} hour{h !== 1 ? 's' : ''} before</option>
              ))}
            </select>
          </div>
        </Section>

        {/* Plan */}
        <Section title="Plan">
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px', background: 'var(--navy)', borderRadius: 'var(--radius)',
          }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--white)',
                            textTransform: 'capitalize' }}>
                {user?.plan} plan
              </div>
              <div style={{ fontSize: 13, color: 'var(--slate)', marginTop: 2 }}>
                {user?.plan === 'free'
                  ? '2 members · 2 sources · no email digest'
                  : '8 members · 24 sources · digest + reminders'}
              </div>
            </div>
            {user?.plan === 'free' && (
              <button type="button" className="btn btn-primary btn-sm">
                Upgrade
              </button>
            )}
          </div>
        </Section>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving
              ? <span className="spinner" style={{ width: 14, height: 14 }} />
              : 'Save changes'}
          </button>
          {saved && (
            <span style={{ fontSize: 14, color: 'var(--accent-dim)', fontWeight: 500 }}>
              ✓ Saved
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--slate)',
                   textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
        {title}
      </h2>
      <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {children}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} style={{
      width: 40, height: 22, borderRadius: 11, flexShrink: 0,
      background: checked ? 'var(--accent)' : 'var(--border)',
      border: 'none', cursor: 'pointer', position: 'relative',
      transition: 'background 0.2s',
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: '50%', background: 'white',
        position: 'absolute', top: 3,
        left: checked ? 21 : 3,
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}
