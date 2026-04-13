import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.jsx';

function UpgradeBanner() {
  const [loading, setLoading] = useState(false);

  async function handleUpgrade() {
    setLoading(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('sc_token')}`,
        },
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: 'linear-gradient(135deg, var(--navy) 0%, #1a3050 100%)',
      borderRadius: 12, padding: '16px 20px', marginBottom: 28,
      border: '1px solid rgba(0,214,143,0.2)',
      flexWrap: 'wrap', gap: 12,
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--white)', marginBottom: 2 }}>
          ⚡ Upgrade to Premium
        </div>
        <div style={{ fontSize: 13, color: 'var(--slate)' }}>
          Get 8 family members and 24 sources for $5/month.
        </div>
      </div>
      <button onClick={handleUpgrade} disabled={loading}
        className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}>
        {loading ? '…' : 'Upgrade — $5/mo'}
      </button>
    </div>
  );
}

const APP_OPTIONS = [
  { value: 'teamsnap',      label: 'TeamSnap',      fetchType: 'ical' },
  { value: 'teamsnapone',   label: 'TeamSnap ONE',  fetchType: 'ical' },
  { value: 'gamechanger',   label: 'GameChanger',   fetchType: 'ical' },
  { value: 'playmetrics',   label: 'PlayMetrics',   fetchType: 'ical' },
  { value: 'teamsideline',  label: 'TeamSideline',  fetchType: 'ical' },
  { value: 'byga',          label: 'BYGA',          fetchType: 'ical' },
  { value: 'sportsengine',  label: 'SportsEngine',  fetchType: 'ical' },
  { value: 'teamreach',     label: 'TeamReach',     fetchType: 'ical' },
  { value: 'leagueapps',    label: 'LeagueApps',    fetchType: 'ical' },
  { value: 'demosphere',    label: 'Demosphere',    fetchType: 'ical' },
  { value: '360player',     label: '360Player',     fetchType: 'ical' },
  { value: 'sportsyou',     label: 'SportsYou',     fetchType: 'ical' },
  { value: 'band',          label: 'BAND',           fetchType: 'ical' },
  { value: 'rankone',       label: 'RankOne',        fetchType: 'ical' },
  { value: 'custom',        label: 'Custom iCal',   fetchType: 'ical' },
];

const APP_INSTRUCTIONS = {
  teamsnap: {
    label: 'TeamSnap',
    steps: [
      'Open the TeamSnap app on your phone or go to teamsnap.com.',
      'Tap the team you want to add.',
      'Tap the Calendar icon at the bottom of the screen.',
      'Tap the share/export icon (top right) → "Export Calendar".',
      'Tap "Copy Link" — this is your iCal URL.',
      'Paste it in the iCal URL field below.',
    ],
    note: 'You need to do this separately for each team. Each team has its own iCal URL.',
    webSteps: [
      'Go to teamsnap.com and sign in.',
      'Click on your team → Schedule tab.',
      'Click "Export" in the top right → "Export to iCal".',
      'Copy the URL from the dialog that appears.',
    ],
  },
  gamechanger: {
    label: 'GameChanger',
    steps: [
      'Open the GameChanger app on your phone.',
      'Tap on your team.',
      'Tap "Schedule" at the bottom.',
      'Tap the share icon (top right) → "Subscribe to Calendar".',
      'Tap "Copy Link" — this is your iCal URL.',
      'Paste it in the iCal URL field below.',
    ],
    note: 'If you manage multiple teams, repeat this for each team.',
    webSteps: [
      'Go to gc.com and sign in.',
      'Select your team → Schedule.',
      'Click the calendar icon → "Subscribe to Calendar" → copy the link.',
    ],
  },
  playmetrics: {
    label: 'PlayMetrics',
    steps: [
      'Open PlayMetrics and go to your team.',
      'Tap "Calendar" in the navigation.',
      'Tap the settings/gear icon.',
      'Select "Subscribe" or "Export Calendar".',
      'Copy the iCal link provided.',
      'Paste it in the iCal URL field below.',
    ],
    note: 'PlayMetrics iCal links include all events for that team.',
  },
  teamsideline: {
    label: 'TeamSideline',
    steps: [
      'Go to your TeamSideline team page in a browser.',
      'Click on "Schedule" in the navigation.',
      'Look for a calendar icon or "Subscribe to Calendar" link — usually at the top or bottom of the schedule.',
      'Right-click the calendar icon → "Copy Link Address".',
      'Paste it in the iCal URL field below.',
    ],
    note: 'TeamSideline URLs sometimes contain special characters — paste them exactly as copied.',
  },
  byga: {
    label: 'BYGA',
    steps: [
      'Go to your BYGA league or club website.',
      'Navigate to the team schedule page.',
      'Look for a calendar subscribe link or iCal export option — often shown as a calendar icon.',
      'Copy the iCal (.ics) link.',
      'Paste it in the iCal URL field below.',
    ],
    note: 'BYGA iCal links look like: http://yourclub.byga.net/cal/XXXXX.ics',
  },
  '360player': {
    label: '360Player',
    steps: [
      'Open the 360Player app on your phone.',
      'Tap the Calendar section at the bottom.',
      'Tap the three lines (menu icon) in the top right corner.',
      'Scroll down to find the calendar you want to share.',
      'Tap the subscribe link for that calendar — this is your iCal URL.',
      'Copy it and paste it in the iCal URL field below.',
    ],
    note: '360Player is popular for soccer, basketball, volleyball, and other club sports across Europe and the US.',
  },
  teamsnapone: {
    label: 'TeamSnap ONE',
    steps: [
      'Log in to your TeamSnap ONE account at go.teamsnap.com or in the app.',
      'Click on your team or organization.',
      'Go to the Schedule tab.',
      'Click Settings → Sync Calendar / Export.',
      'Copy the calendar link provided.',
      'Paste it in the iCal URL field below.',
    ],
    note: 'TeamSnap ONE is TeamSnap\'s club and league platform — the iCal export works the same way as standard TeamSnap.',
    webSteps: [
      'Go to go.teamsnap.com and sign in.',
      'Select your team → Schedule tab.',
      'Click Settings → Sync Calendar / Export.',
      'Copy the calendar link and paste it below.',
    ],
  },
  sportsyou: {
    label: 'SportsYou',
    steps: [
      'Open the SportsYou app on your phone.',
      'Tap Calendar in the bottom tray.',
      'Tap the subscribe icon in the top right corner.',
      'Tap the green "Copy Link" button.',
      'Paste the copied URL in the iCal URL field below.',
    ],
    note: 'SportsYou is a free team communication platform popular with school and rec league coaches.',
    webSteps: [
      'Log in to your SportsYou account on the web.',
      'In the left column, click the Calendar link.',
      'Click the arrow next to the calendar you want → Subscribe to Team Calendar.',
      'Copy the URL provided and paste it below.',
    ],
  },
  custom: {
    label: 'Custom iCal',
    steps: [
      'Any app that supports iCal export will have a "Subscribe to Calendar", "Export to iCal", or "iCal Feed" option.',
      'Find that option in your app\'s schedule or calendar section.',
      'Copy the URL — it usually starts with https:// or webcal://',
      'Paste it in the iCal URL field below.',
    ],
    note: 'Both https:// and webcal:// URLs work — SportsCal handles both formats automatically.',
  },
  sportsengine: {
    label: 'SportsEngine',
    steps: [
      'Go to your organization\'s SportsEngine website (e.g. yourleague.org).',
      'Navigate to your team\'s page or the main Calendar page.',
      'Scroll down below the calendar or event list.',
      'Look for the iCal Feed icon (calendar with a chain link) — tap "Subscribe to iCal Feed".',
      'A popup will appear with the feed URL — copy it.',
      'Paste it in the iCal URL field below.',
    ],
    note: '⚠️ Important: Use the iCal URL from your league\'s website — NOT from the SportsEngine mobile app\'s "Subscribe" button, which generates an authenticated URL that won\'t work. The correct URL will start with webcal://sportngin.com or webcal://[yourleague].com.',
    webSteps: [
      'Log in to your SportsEngine account at ngin.com or your org\'s website.',
      'Go to your team page → Schedule or Calendar tab.',
      'Click the iCal Feed icon below the schedule.',
      'Copy the URL from the popup that appears.',
    ],
  },
  teamreach: {
    label: 'TeamReach',
    steps: [
      'Open the TeamReach app on your phone.',
      'Tap on your team.',
      'Tap the Calendar tab at the bottom.',
      'Scroll all the way to the bottom of the calendar.',
      'Tap the "Subscribe" button.',
      'Copy the iCal link that appears.',
      'Paste it in the iCal URL field below.',
    ],
    note: 'The Subscribe button is at the very bottom of the calendar — you may need to scroll past all events to find it.',
  },
  leagueapps: {
    label: 'LeagueApps',
    steps: [
      'Log in to your organization\'s LeagueApps site or open the LeagueApps Play app.',
      'Go to My Schedule or your program\'s Schedule page.',
      'Tap "Subscribe to Calendar" at the top of the schedule.',
      'Select "Copy Link" from the options that appear.',
      'Paste the copied URL in the iCal URL field below.',
    ],
    note: 'In the LeagueApps Play app: tap your profile icon → Members tab → tap your name → Subscribe to Calendar.',
    webSteps: [
      'Log in to your organization\'s LeagueApps website.',
      'Go to your Dashboard → My Schedule from the sidebar.',
      'Click "Subscribe to Calendar" at the top.',
      'Click "Copy Link" to copy the iCal URL.',
    ],
  },
  demosphere: {
    label: 'Demosphere',
    steps: [
      'Open the Demosphere mobile app.',
      'Tap on your team.',
      'Tap the Calendar or Schedule section.',
      'Look for a "Subscribe" or "Sync Calendar" option.',
      'Tap it and copy the iCal link provided.',
      'Paste it in the iCal URL field below.',
    ],
    note: 'For org-wide feeds: your league\'s Demosphere site URL + /events.ics (e.g. yourleague.demosphere.net/events.ics) gives the full site calendar.',
    webSteps: [
      'Go to your league\'s Demosphere website.',
      'Navigate to the Calendar or Help/iCal page.',
      'The full feed URL is typically: https://[yourorg].demosphere.net/events.ics',
      'Copy that URL and paste it below.',
    ],
  },
  teamsnapone: {
    label: 'TeamSnap One',
    steps: [
      'Open the TeamSnap One app or go to go.teamsnap.com.',
      'Tap on your team.',
      'Tap the Schedule tab.',
      'Tap Settings → Sync Calendar / Export.',
      'Copy the calendar link provided.',
      'Paste it in the iCal URL field below.',
    ],
    note: 'TeamSnap One uses the same iCal export flow as TeamSnap. Each team has its own feed URL.',
    webSteps: [
      'Log in at go.teamsnap.com.',
      'Select your team → Schedule tab.',
      'Click Settings → Sync Calendar / Export.',
      'Copy the calendar link and paste it below.',
    ],
  },
  '360player': {
    label: '360Player',
    steps: [
      'Open the 360Player app on your phone.',
      'Go to the Calendar section.',
      'Tap the three lines (menu icon) in the top right corner.',
      'Scroll down to find the calendar you want to share.',
      'Copy the subscribe link provided for that calendar.',
      'Paste it in the iCal URL field below.',
    ],
    note: '360Player is popular for soccer academies and clubs. Each team calendar has its own subscribe link.',
  },
  sportsyou: {
    label: 'sportsYou',
    steps: [
      'Open the sportsYou app on your phone.',
      'Tap Calendar in the bottom navigation.',
      'Tap the subscribe icon in the top right corner.',
      'Tap the green Copy Link button.',
      'Paste it in the iCal URL field below.',
    ],
    note: 'sportsYou auto-syncs — any schedule changes in the app will update your SportsCal feed automatically.',
  },
  band: {
    label: 'BAND',
    steps: [
      'Go to www.band.us on your computer and open the Band you want to add.',
      'Click the Settings icon (gear) in the top right of the Band.',
      'Scroll down and click "Export Band Events".',
      'Copy the calendar URL provided.',
      'Paste it in the iCal URL field below.',
    ],
    note: 'The BAND calendar URL is unique to your group. Any events added or updated in BAND will automatically sync to your SportsCal feed.',
  },
  rankone: {
    label: 'RankOne',
    steps: [
      'Log in to your RankOne account at rankone.com.',
      'Navigate to your team or activity\'s schedule/calendar page.',
      'Look for a "Subscribe" or "iCal" or "Export Calendar" link below the schedule.',
      'Click it to get the calendar URL, or right-click and copy the link.',
      'Paste it in the iCal URL field below.',
    ],
    note: 'RankOne is used by many school athletic programs. The iCal URL is usually found on the team schedule page. If you can\'t find it, ask your athletic director.',
  },
};

function SourceHelpModal({ app, onClose }) {
  const info = APP_INSTRUCTIONS[app] || APP_INSTRUCTIONS.custom;
  const [view, setView] = useState('mobile');
  const [gcStep, setGcStep] = useState(0);

  const GC_STEPS = [
    { img: '/gc-step1.png', caption: 'Open GameChanger and tap your team' },
    { img: '/gc-step2.png', caption: 'Tap the ⚙️ Settings gear (top right)' },
    { img: '/gc-step3.png', caption: 'Tap Schedule Sync' },
    { img: '/gc-step4.png', caption: 'Tap "Sync Schedule to Your Calendar"' },
    { img: '/gc-step5.png', caption: '"Calendar link copied" — link is in your clipboard!' },
    { img: '/gc-step6.png', caption: 'Paste the link into SportsCal\'s iCal URL field' },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,22,41,0.65)',
      display: 'flex', alignItems: 'flex-end', zIndex: 200,
    }}>
      <style>{`
        @media (min-width: 641px) {
          .help-modal { border-radius: 16px !important; margin: auto !important; max-width: 520px !important; }
          .help-wrap { align-items: center !important; padding: 20px !important; }
        }
      `}</style>
      <div className="help-wrap" style={{ width: '100%', display: 'flex', alignItems: 'flex-end' }}>
        <div className="card help-modal" style={{
          width: '100%', padding: '28px',
          borderRadius: '16px 16px 0 0',
          maxHeight: '88vh', overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>
              How to find your {info.label} iCal URL
            </h3>
            <button onClick={onClose} style={{ fontSize: 22, color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>

          {/* Mobile/Web toggle */}
          {info.webSteps && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {['mobile', 'web'].map(v => (
                <button key={v} onClick={() => setView(v)} style={{
                  flex: 1, padding: '8px', borderRadius: 8, border: 'none',
                  cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  background: view === v ? 'var(--navy)' : 'var(--off-white)',
                  color: view === v ? 'var(--white)' : 'var(--slate)',
                }}>
                  {v === 'mobile' ? '📱 Mobile app' : '💻 Website'}
                </button>
              ))}
            </div>
          )}

          {/* GameChanger photo slideshow */}
          {app === 'gamechanger' && view === 'mobile' ? (
            <div>
              {/* Photo */}
              <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', marginBottom: 12, background: 'var(--off-white)' }}>
                <img
                  src={GC_STEPS[gcStep].img}
                  alt={`Step ${gcStep + 1}`}
                  style={{ width: '100%', display: 'block', maxHeight: 420, objectFit: 'contain' }}
                />
                {/* Prev / Next overlay buttons */}
                {gcStep > 0 && (
                  <button onClick={() => setGcStep(s => s - 1)} style={{
                    position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'rgba(15,22,41,0.7)', border: 'none', borderRadius: '50%',
                    width: 36, height: 36, color: 'white', fontSize: 18, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>‹</button>
                )}
                {gcStep < GC_STEPS.length - 1 && (
                  <button onClick={() => setGcStep(s => s + 1)} style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'rgba(15,22,41,0.7)', border: 'none', borderRadius: '50%',
                    width: 36, height: 36, color: 'white', fontSize: 18, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>›</button>
                )}
                {/* Step badge */}
                <div style={{
                  position: 'absolute', top: 10, left: 10,
                  background: 'var(--accent)', color: 'var(--navy)',
                  borderRadius: '50%', width: 28, height: 28,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700,
                }}>{gcStep + 1}</div>
              </div>

              {/* Caption */}
              <div style={{
                fontSize: 14, fontWeight: 500, color: 'var(--navy)',
                textAlign: 'center', marginBottom: 12, minHeight: 40,
                lineHeight: 1.5,
              }}>
                {GC_STEPS[gcStep].caption}
              </div>

              {/* Dot indicators */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
                {GC_STEPS.map((_, i) => (
                  <button key={i} onClick={() => setGcStep(i)} style={{
                    width: i === gcStep ? 20 : 8, height: 8, borderRadius: 4,
                    background: i === gcStep ? 'var(--accent)' : 'var(--border)',
                    border: 'none', cursor: 'pointer', padding: 0,
                    transition: 'all 0.2s',
                  }} />
                ))}
              </div>

              {/* Prev/Next buttons */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                {gcStep > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setGcStep(s => s - 1)} style={{ flex: 1 }}>
                    ← Previous
                  </button>
                )}
                {gcStep < GC_STEPS.length - 1 ? (
                  <button className="btn btn-primary btn-sm" onClick={() => setGcStep(s => s + 1)} style={{ flex: 1, justifyContent: 'center' }}>
                    Next step →
                  </button>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>
                    Got it — paste the URL ✓
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Standard steps */}
              <ol style={{ paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                {(view === 'web' && info.webSteps ? info.webSteps : info.steps).map((step, i) => (
                  <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--accent)', color: 'var(--navy)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, marginTop: 1,
                    }}>
                      {i + 1}
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--navy)', lineHeight: 1.6, paddingTop: 3 }}>
                      {step}
                    </div>
                  </li>
                ))}
              </ol>

              {info.note && (
                <div style={{
                  background: 'var(--off-white)', borderRadius: 8,
                  padding: '12px 14px', marginBottom: 20,
                  fontSize: 13, color: 'var(--slate)', lineHeight: 1.6,
                  borderLeft: '3px solid var(--accent)',
                }}>
                  💡 {info.note}
                </div>
              )}

              <button onClick={onClose} className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}>
                Got it — let me paste the URL
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Sources() {
  const { user } = useAuth();
  const [sources, setSources]     = useState([]);
  const [kids, setKids]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editingSource, setEditingSource] = useState(null);
  const [refreshing, setRefreshing] = useState({});
  const [error, setError]         = useState('');

  useEffect(() => {
    Promise.all([api.sources.list(), api.kids.list()])
      .then(([{ sources }, { kids }]) => { setSources(sources); setKids(kids); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleRefresh(id) {
    setRefreshing(r => ({ ...r, [id]: true }));
    try {
      await api.sources.refresh(id);
      // Poll for updated source data — worker is async so wait up to 15s
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const { sources: updated } = await api.sources.list();
          const fresh = updated.find(s => s.id === id);
          if (fresh) {
            setSources(updated.filter(s => s.name !== '__manual__'));
          }
        } catch {}
        if (attempts >= 10) {
          clearInterval(poll);
          setRefreshing(r => ({ ...r, [id]: false }));
        }
      }, 1500);
    } catch (err) {
      setError(err.message);
      setRefreshing(r => ({ ...r, [id]: false }));
    }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this source? All events from it will be deleted.')) return;
    try {
      await api.sources.delete(id);
      setSources(s => s.filter(s => s.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleToggle(source) {
    try {
      const { source: updated } = await api.sources.update(source.id, { enabled: !source.enabled });
      setSources(s => s.map(x => x.id === source.id ? updated : x));
    } catch (err) {
      setError(err.message);
    }
  }

  function handleEdit(source) {
    setEditingSource(source);
    setShowForm(true);
  }

  function handleCancelForm() {
    setShowForm(false);
    setEditingSource(null);
  }

  return (
    <div style={{ padding: '40px', maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 4 }}>Sources</h1>
          <p style={{ color: 'var(--slate)', fontSize: 15 }}>
            Connect your sports apps and assign kids to each one.
          </p>
        </div>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => { setEditingSource(null); setShowForm(true); }}>
            + Add source
          </button>
        )}
      </div>

      {error && <div className="error-msg" style={{ marginBottom: 20 }}>{error}</div>}

      {user?.plan === 'free' && <UpgradeBanner />}

      {showForm && (
        <SourceForm
          kids={kids}
          initial={editingSource}
          onSave={async (data) => {
            try {
              if (editingSource) {
                const { source } = await api.sources.update(editingSource.id, data);
                setSources(s => s.map(x => x.id === editingSource.id ? source : x));
              } else {
                const { source } = await api.sources.create(data);
                setSources(s => [...s, source]);
              }
              setShowForm(false);
              setEditingSource(null);
            } catch (err) {
              setError(err.message);
            }
          }}
          onCancel={handleCancelForm}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      ) : sources.filter(s => s.name !== '__manual__').length === 0 && !showForm ? (
        <div className="card" style={{ padding: '60px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔗</div>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No sources yet</h3>
          <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 24, maxWidth: 320, margin: '0 auto 24px' }}>
            Add a source to pull schedules from TeamSnap, GameChanger, PlayMetrics, and others.
          </p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>Add first source</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sources.filter(s => s.name !== '__manual__').map(source => (
            <SourceCard key={source.id}
              source={source}
              onRefresh={() => handleRefresh(source.id)}
              onDelete={() => handleDelete(source.id)}
              onToggle={() => handleToggle(source)}
              onEdit={() => handleEdit(source)}
              refreshing={refreshing[source.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SourceCard({ source, onRefresh, onDelete, onToggle, onEdit, refreshing }) {
  const appInfo = APP_OPTIONS.find(a => a.value === source.app);
  const hasError = source.last_fetch_status === 'error';

  return (
    <div className="card" style={{
      padding: '16px',
      opacity: source.enabled ? 1 : 0.6,
      transition: 'opacity 0.2s',
    }}>
      {/* Top row: badge + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          padding: '3px 8px',
          background: 'var(--navy)',
          color: 'var(--accent)',
          borderRadius: 6,
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          flexShrink: 0,
        }}>
          {appInfo?.label || source.app}
        </div>
        <div style={{ fontSize: 15, fontWeight: 500, flex: 1, minWidth: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {source.name}
        </div>
      </div>

      {/* Kids */}
      {source.kids?.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {source.kids.map(kid => (
            <span key={kid.id} style={{
              fontSize: 12, padding: '2px 8px', borderRadius: 20,
              background: kid.color + '20', color: kid.color,
              border: `1px solid ${kid.color}40`, fontWeight: 500,
            }}>
              {kid.name}
            </span>
          ))}
        </div>
      )}

      {/* Status */}
      <div style={{ fontSize: 12, color: hasError ? 'var(--red)' : 'var(--slate)', marginBottom: 12 }}>
        {hasError
          ? `⚠ ${source.last_fetch_error || 'Last fetch failed'}`
          : source.last_fetched_at
            ? `✓ Synced ${timeAgo(source.last_fetched_at)} · ${source.last_event_count || 0} events`
            : 'Not yet synced'}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={onRefresh}
          disabled={refreshing} style={{ minWidth: 64 }}>
          {refreshing ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '↻ Sync'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onEdit}>Edit</button>
        <button className="btn btn-ghost btn-sm" onClick={onToggle}>
          {source.enabled ? 'Pause' : 'Resume'}
        </button>
        <button className="btn btn-danger btn-sm" onClick={onDelete}>Remove</button>
      </div>
    </div>
  );
}

function SourceForm({ kids, initial, onSave, onCancel }) {
  const isEditing = !!initial;
  const initialApp = initial?.app || 'teamsnap';
  const appInfo = APP_OPTIONS.find(a => a.value === initialApp);

  const [app, setApp]         = useState(initialApp);
  const [name, setName]       = useState(initial?.name || '');
  const [icalUrl, setIcalUrl] = useState(initial?.ical_url || '');
  const [kidIds, setKidIds]   = useState(initial?.kids?.map(k => k.id) || []);
  const [saving, setSaving]   = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const currentAppInfo = APP_OPTIONS.find(a => a.value === app);

  function toggleKid(id) {
    setKidIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const appLabels = { teamsnap:'TeamSnap', teamsnapone:'TeamSnap ONE', gamechanger:'GameChanger', playmetrics:'PlayMetrics', teamsideline:'TeamSideline', byga:'BYGA', sportsengine:'SportsEngine', teamreach:'TeamReach', leagueapps:'LeagueApps', demosphere:'Demosphere', '360player':'360Player', sportsyou:'SportsYou', band:'BAND', rankone:'RankOne', custom:'Custom' };
    await onSave({
      name:       name || appLabels[app] || app,
      app,
      fetch_type: currentAppInfo?.fetchType || 'ical',
      ical_url:   icalUrl || null,
      kid_ids:    kidIds,
    });
    setSaving(false);
  }

  return (
    <div className="card fade-up" style={{ padding: '24px', marginBottom: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>
        {isEditing ? `Edit — ${initial.name}` : 'Add a source'}
      </h3>

      {showHelp && <SourceHelpModal app={app} onClose={() => setShowHelp(false)} />}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {!isEditing && (
          <div className="field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ marginBottom: 0 }}>App</label>
              <button type="button" onClick={() => setShowHelp(true)}
                style={{ fontSize: 13, color: 'var(--accent-dim)', background: 'none',
                         border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0 }}>
                Need help finding the URL? →
              </button>
            </div>
            <select className="input" value={app} onChange={e => setApp(e.target.value)}>
              {APP_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label>Label <span style={{ color: 'var(--slate-light)' }}>(optional)</span></label>
          <input className="input" type="text"
            placeholder={`e.g. ${currentAppInfo?.label} — Emma Soccer`}
            value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div className="field">
          <label>iCal URL</label>
          <input className="input" type="text"
            placeholder="https:// or webcal://..."
            value={icalUrl} onChange={e => setIcalUrl(e.target.value)} />
        </div>

        {kids.length > 0 && (
          <div className="field">
            <label>Assign to kids</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {kids.map(kid => (
                <button key={kid.id} type="button" onClick={() => toggleKid(kid.id)}
                  style={{
                    padding: '6px 14px', borderRadius: 20, fontSize: 14, fontWeight: 500,
                    border: `2px solid ${kidIds.includes(kid.id) ? kid.color : 'var(--border)'}`,
                    background: kidIds.includes(kid.id) ? kid.color + '15' : 'transparent',
                    color: kidIds.includes(kid.id) ? kid.color : 'var(--slate)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                  {kidIds.includes(kid.id) ? '✓ ' : ''}{kid.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving
              ? <span className="spinner" style={{ width: 14, height: 14 }} />
              : isEditing ? 'Save changes' : 'Add source'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function timeAgo(dateStr) {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 2)  return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
