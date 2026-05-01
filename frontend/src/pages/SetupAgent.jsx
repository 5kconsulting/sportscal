import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useIngestion } from '../hooks/useIngestion.js';
import IngestionReviewModal from '../components/IngestionReviewModal.jsx';

// DEPRECATED — moved to backend/src/lib/setupAgentPrompt.js as part of the
// 2026-05-01 web SetupAgent → backend proxy migration. The constants and
// buildSystemPrompt() below are no longer called from this file (sendMessage
// hits POST /api/setup-agent/message which builds the prompt server-side).
// Kept here as dead code only because deleting them is unrelated to the
// proxy migration and could regress if anything still imports from this
// file. Safe to delete in a follow-up commit once a grep confirms no
// external references.
const APP_INSTRUCTIONS = {
  teamsnap: {
    label: 'TeamSnap',
    steps: ['Open the TeamSnap app on your phone or go to teamsnap.com.','Tap the team you want to add.','Tap the Calendar icon at the bottom of the screen.','Tap the share/export icon (top right) → "Export Calendar".','Tap "Copy Link" — this is your iCal URL.','Paste it in the chat below.'],
    note: 'Each team has its own iCal URL. Repeat for each team.',
  },
  gamechanger: {
    label: 'GameChanger',
    steps: ['Open the GameChanger app.','Tap on your team.','Tap "Schedule" at the bottom.','Tap the share icon (top right) → "Subscribe to Calendar".','Tap "Copy Link" — this is your iCal URL.','Paste it in the chat below.'],
    note: 'If you manage multiple teams, repeat for each.',
  },
  playmetrics: {
    label: 'PlayMetrics',
    steps: ['Open PlayMetrics and go to your team.','Tap "Calendar" in the navigation.','Tap the settings/gear icon.','Select "Subscribe" or "Export Calendar".','Copy the iCal link.','Paste it in the chat below.'],
  },
  teamsideline: {
    label: 'TeamSideline',
    steps: ['Go to your TeamSideline team page in a browser.','Click on "Schedule" in the navigation.','Look for a calendar icon or "Subscribe to Calendar" link.','Right-click the calendar icon → "Copy Link Address".','Paste it in the chat below.'],
  },
  byga: {
    label: 'BYGA',
    steps: ['Go to your BYGA league or club website.','Navigate to the team schedule page.','Look for a calendar subscribe link or iCal export option.','Copy the iCal (.ics) link.','Paste it in the chat below.'],
  },
  sportsengine: {
    label: 'SportsEngine',
    steps: ['Go to your organization\'s SportsEngine website.','Navigate to your team\'s page or the main Calendar page.','Scroll below the calendar and look for the iCal Feed icon.','Tap "Subscribe to iCal Feed" — a popup appears with the URL.','Copy it and paste it in the chat below.'],
    note: 'Use the URL from the league website, not the mobile app.',
  },
  teamreach: {
    label: 'TeamReach',
    steps: ['Open the TeamReach app.','Tap on your team.','Tap the Calendar tab.','Scroll to the very bottom.','Tap the "Subscribe" button.','Copy the iCal link and paste it in the chat below.'],
  },
  leagueapps: {
    label: 'LeagueApps',
    steps: ['Log in to your organization\'s LeagueApps site.','Go to My Schedule or your program\'s Schedule page.','Tap "Subscribe to Calendar" at the top.','Select "Copy Link".','Paste it in the chat below.'],
  },
  demosphere: {
    label: 'Demosphere',
    steps: ['Open the Demosphere mobile app.','Tap on your team.','Tap Calendar or Schedule.','Look for a "Subscribe" or "Sync Calendar" option.','Copy the iCal link and paste it in the chat below.'],
  },
  '360player': {
    label: '360Player',
    steps: ['Open the 360Player app.','Go to the Calendar section.','Tap the three lines (menu) in the top right.','Scroll to find your calendar.','Copy the subscribe link and paste it in the chat below.'],
  },
  sportsyou: {
    label: 'SportsYou',
    steps: ['Open the SportsYou app.','Tap Calendar in the bottom navigation.','Tap the subscribe icon in the top right.','Tap the green "Copy Link" button.','Paste it in the chat below.'],
  },
  band: {
    label: 'BAND',
    steps: ['Go to www.band.us on your computer.','Open the Band you want to add.','Click the Settings gear (top right).','Scroll down and click "Export Band Events".','Copy the calendar URL and paste it in the chat below.'],
  },
  rankone: {
    label: 'RankOne',
    steps: ['Log in to your RankOne account at rankone.com.','Navigate to your team\'s schedule/calendar page.','Look for a "Subscribe" or "iCal" or "Export Calendar" link.','Copy the URL and paste it in the chat below.'],
    note: 'If you can\'t find it, ask your athletic director.',
  },
  teamsnapone: {
    label: 'TeamSnap ONE',
    steps: ['Log in at go.teamsnap.com or in the app.','Click on your team.','Go to the Schedule tab.','Click Settings → Sync Calendar / Export.','Copy the calendar link and paste it in the chat below.'],
  },
  google_classroom: {
    label: 'Google Classroom',
    steps: [
      'Open Google Calendar at calendar.google.com on a computer (signed in to your child\'s school Google account).',
      'In the left sidebar under "My calendars," find the class — usually named after the course.',
      'Hover over the class name and click the three dots → "Settings and sharing".',
      'Scroll to "Integrate calendar".',
      'Copy the "Secret address in iCal format" — the long URL ending in .ics.',
      'Paste it in the chat below.',
    ],
    note: 'Each class has its own calendar — repeat for each class. Use the SECRET address; the public one only shows free/busy, not assignment titles.',
  },
  custom: {
    label: 'Custom iCal',
    steps: ['Find the "Subscribe to Calendar", "Export to iCal", or "iCal Feed" option in your app.','Copy the URL — it starts with https:// or webcal://','Paste it in the chat below.'],
    note: 'Both https:// and webcal:// URLs work.',
  },
};

const APP_LIST = Object.entries(APP_INSTRUCTIONS).map(([value, info]) => ({
  value,
  label: info.label,
}));

const DEMO_FEEDS = [
  { sport: 'Soccer',     url: 'https://www.sportscalapp.com/demo-feeds/soccer-games.ics',       name: 'Tualatin FC U12 Girls' },
  { sport: 'Baseball',   url: 'https://www.sportscalapp.com/demo-feeds/baseball-schedule.ics',   name: 'Tigard Tigers 10U' },
  { sport: 'Basketball', url: 'https://www.sportscalapp.com/demo-feeds/basketball-games.ics',    name: 'Sherwood Hoops AAU 12U' },
  { sport: 'Volleyball', url: 'https://www.sportscalapp.com/demo-feeds/volleyball-schedule.ics', name: 'Tigard Storm 14U' },
  { sport: 'Swimming',   url: 'https://www.sportscalapp.com/demo-feeds/swim-meets.ics',          name: 'Tualatin Hills Swim Club' },
  { sport: 'Track',      url: 'https://www.sportscalapp.com/demo-feeds/track-field.ics',         name: 'Tualatin HS Track & Field' },
];

function buildSystemPrompt(kids) {
  const appNames = Object.values(APP_INSTRUCTIONS).map(a => a.label).join(', ');
  const appValues = APP_LIST.map(a => '- ' + a.label + ' -> "' + a.value + '"').join('\n');
  const demoList = DEMO_FEEDS.map(f => '- ' + f.sport + ': ' + f.url).join('\n');
  const appInstructions = JSON.stringify(APP_INSTRUCTIONS, null, 2);
  const kidRoster = (kids || []).map(k => '- ' + k.name).join('\n') || '(no kids yet)';

  return 'You are a friendly setup assistant for SportsCal, a service that aggregates youth sports calendars into one unified feed.\n\n'
    + 'Your job is to guide parents step-by-step through finding their iCal URLs from sports apps and adding them to their SportsCal account. You can ALSO accept PDF schedules from the user and extract events from them automatically.\n\n'
    + 'You have knowledge of these apps: ' + appNames + ', and Custom iCal.\n\n'
    + '## Kids on this account\n'
    + kidRoster + '\n\n'
    + '## Your personality\n'
    + '- Warm, encouraging, and patient - parents are often not tech-savvy\n'
    + '- Concise - do not write walls of text\n'
    + '- Celebrate small wins ("Perfect! Got it!")\n'
    + '- Use occasional emoji but do not overdo it\n\n'
    + '## Your job\n'
    + '1. Start by asking which apps the parent uses (list them or let them type). You can also mention: "If you only have a PDF schedule from the coach, I can read that too."\n'
    + '2. For iCal URL flow: walk through each app one at a time. When the user pastes a URL, validate it looks like an iCal URL.\n'
    + '3. Ask what to name the source and which kid(s) it\'s for.\n'
    + '4. Confirm details before adding: "Ready to add \'Tualatin Baseball\' for James from GameChanger - sound right?"\n'
    + '5. After user confirms, respond with this action block:\n\n'
    + 'ACTION:{"action":"add_source","name":"<n>","app":"<app_value>","ical_url":"<url>","kid_names":[<names>]}\n\n'
    + '6. After each source is added, ask if there are more to add.\n'
    + '7. When done, give a cheerful summary of what was added.\n\n'
    + '## PDF upload flow\n'
    + 'If the user says they have a PDF of their schedule (or a photo, which we will treat like a PDF for now):\n\n'
    + '  Step 1 — Ask which kid it is for. You MUST know the kid before the upload.\n'
    + '          If there is only one kid, confirm it. If multiple, ask.\n'
    + '  Step 2 — Once you know the kid, tell the user to tap the 📎 paperclip\n'
    + '          at the bottom of the chat to upload, and emit this action:\n\n'
    + 'ACTION:{"action":"request_pdf_upload","kid_name":"<exact name from roster>"}\n\n'
    + '          Use the kid name EXACTLY as it appears in the roster above.\n'
    + '          The frontend resolves the name to an ID — do NOT make up a UUID.\n'
    + '  Step 3 — The system will show live progress messages (Reading... Parsing...).\n'
    + '          Do NOT narrate progress yourself.\n'
    + '  Step 4 — When extraction finishes, a review modal opens automatically.\n'
    + '          Do NOT emit any action — the frontend handles it.\n'
    + '  Step 5 — After the user reviews + approves (or cancels), you will receive\n'
    + '          a system message telling you what happened. React conversationally:\n'
    + '          - On success: celebrate and ask if there are more schedules.\n'
    + '          - On cancel: offer to try a different file or switch to iCal URL flow.\n'
    + '          - On failure (no events / bad file): apologize briefly, offer alternatives.\n\n'
    + '## Demo mode\n'
    + 'If the user has no sources yet OR says they want to "try it" or "see how it works", offer the demo feeds:\n\n'
    + '"Want to try it with some sample sports data first? I have pre-made feeds for soccer, baseball, basketball, volleyball, swimming, and track - all realistic schedules from the Portland area. You can swap them out for your real feeds any time."\n\n'
    + 'If they say yes, walk them through adding whichever sports they want using these URLs:\n'
    + demoList + '\n\n'
    + 'Use app value "custom" for all demo feeds. Ask which kid(s) to assign each one to, then add them normally.\n\n'
    + '## App instructions reference\n'
    + appInstructions + '\n\n'
    + '## App values (use these exact values in the action JSON)\n'
    + appValues + '\n\n'
    + '## Important rules\n'
    + '- Only emit an ACTION: block when the user has explicitly confirmed / you need the UI to do something\n'
    + '- One ACTION block per message\n'
    + '- If a URL does not look valid, ask the user to double-check it\n'
    + '- If you are unsure which app a URL is from, make your best guess based on the domain\n'
    + '- Never ask for passwords or login credentials - only iCal URLs or PDF uploads\n'
    + '- Keep responses short and conversational';
}

function extractAction(text) {
  const match = text.match(/ACTION:(\{.*?\})/s);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

function stripAction(text) {
  return text.replace(/ACTION:\{.*?\}/s, '').trim();
}

function isIcalUrl(url) {
  return /^(https?|webcal):\/\/.+/i.test(url.trim());
}

function statusToBubble(ing) {
  if (!ing) return null;
  const detail = ing.status_detail || ing.status;
  switch (ing.status) {
    case 'pending':
    case 'uploading':
      return '📄 Uploading your PDF...';
    case 'reading':
      return '🔍 ' + detail;
    case 'parsing':
      return '✨ ' + detail;
    case 'ready_for_review':
      return '✅ ' + detail;
    case 'approving':
      return '📥 Adding events to your calendar...';
    case 'approved':
      return '✅ ' + detail;
    case 'failed':
      return '⚠️ ' + (ing.extraction_error || detail || 'Something went wrong reading that PDF');
    case 'rejected':
      return null;
    default:
      return '📄 ' + detail;
  }
}

export default function SetupAgent({ onSourceAdded }) {
  // Magic-link PDF review path: when a parent forwards a PDF schedule to
  // their inbound mail address, we email them back a link that drops them
  // here with ?ingestion=<magic_link_token>. The flow is "pick a kid ->
  // we extract events -> review and approve" without ever needing them
  // to upload anything. See routes/inbound.js processPdfAttachments + the
  // /api/ingestions/by-link/* endpoints.
  // URL is stable per page load; cheap enough to read every render.
  const magicLinkToken = new URLSearchParams(window.location.search).get('ingestion');
  if (magicLinkToken) {
    return <MagicLinkPdfReview token={magicLinkToken} />;
  }

  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [kids, setKids] = useState([]);
  const [addedSources, setAddedSources] = useState([]);
  const [started, setStarted] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const { ingestion, uploading, error: ingestionError, uploadPdf, approve, reject, reset: resetIngestion } = useIngestion();
  const [pendingKid, setPendingKid] = useState(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const statusMsgIdxRef = useRef(null);

  useEffect(() => {
    api.kids.list().then(({ kids }) => setKids(kids)).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (!ingestion) {
      statusMsgIdxRef.current = null;
      return;
    }
    const bubble = statusToBubble(ingestion);
    if (!bubble) return;

    setMessages(prev => {
      const next = [...prev];
      const idx = statusMsgIdxRef.current;
      if (idx != null && next[idx] && next[idx].role === 'system') {
        next[idx] = { ...next[idx], content: bubble, error: ingestion.status === 'failed' };
      } else {
        next.push({ role: 'system', content: bubble, error: ingestion.status === 'failed' });
        statusMsgIdxRef.current = next.length - 1;
      }
      return next;
    });

    if (ingestion.status === 'ready_for_review') {
      setShowReviewModal(true);
    }
  }, [ingestion?.status, ingestion?.status_detail, ingestion?.extraction_error]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startSetup() {
    setStarted(true);
    setLoading(true);

    let existingSources = [];
    try {
      const { sources } = await api.sources.list();
      existingSources = sources.filter(s => s.name !== '__manual__');
    } catch {}

    const kidNames = kids.map(k => k.name).join(', ');
    const isNew = existingSources.length === 0;

    const intro = isNew
      ? 'Hi' + (kids.length > 0 ? ', I can see you have ' + (kids.length > 1 ? kids.length + ' kids' : '1 kid') + ': ' + kidNames : '') + '! Want to jump right in with your real sports apps, or would you like to try SportsCal first with some sample schedules? I have demo feeds for soccer, baseball, basketball, volleyball, swimming, and track ready to go. (If you only have a PDF from the coach, I can read that too — just say "I have a PDF".)'
      : 'Hi' + (kids.length > 0 ? ' - I see you already have ' + existingSources.length + ' source' + (existingSources.length !== 1 ? 's' : '') + ' set up' : '') + '! Want to add more? Which apps do you use? (I can also read PDF schedules if you have one.)';

    setMessages([{ role: 'assistant', content: intro }]);
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function sendMessage(text) {
    if (!text.trim() || loading) return;
    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const apiMessages = newMessages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }));

      // Route through the backend proxy (POST /api/setup-agent/message).
      // The system prompt, kid roster lookup, rate limit, and chat
      // persistence all live server-side now — see backend/src/routes/
      // setupAgent.js + lib/setupAgentPrompt.js. The Anthropic key
      // never ships in the bundle.
      const data = await api.setupAgent.message({
        messages: apiMessages,
        platform: 'web',
      });
      const rawContent = data.content || 'Sorry, something went wrong. Please try again.';
      const action = extractAction(rawContent);
      const displayContent = stripAction(rawContent);

      setMessages(prev => [...prev, { role: 'assistant', content: rawContent, display: displayContent }]);

      if (action) {
        await handleAction(action);
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I hit an error. Please try again.',
        display: 'Sorry, I hit an error. Please try again.',
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  async function handleAction(action) {
    if (action.action === 'add_source') {
      return executeAddSource(action);
    }
    if (action.action === 'request_pdf_upload') {
      // Resolve kid by name against the real roster — never trust the model
      // to produce a valid UUID. Same pattern as executeAddSource.
      const kidName = (action.kid_name || '').trim();
      const matched = kids.find(
        k => k.name.toLowerCase() === kidName.toLowerCase(),
      );
      if (!matched) {
        setMessages(prev => [...prev, {
          role: 'system',
          content: kidName
            ? 'I couldn\'t find a kid named "' + kidName + '" on your account. Which kid should I use?'
            : 'Which kid is this schedule for?',
          error: true,
        }]);
        return;
      }
      setPendingKid({ id: matched.id, name: matched.name });
      setTimeout(() => fileInputRef.current?.click(), 100);
      return;
    }
  }

  async function executeAddSource(action) {
    try {
      const kidIds = (action.kid_names || [])
        .map(name => kids.find(k => k.name.toLowerCase() === name.toLowerCase()))
        .filter(Boolean)
        .map(k => k.id);

      const { source } = await api.sources.create({
        name: action.name,
        app: action.app,
        fetch_type: 'ical',
        ical_url: action.ical_url,
        kid_ids: kidIds,
      });

      setAddedSources(prev => [...prev, source]);
      if (onSourceAdded) onSourceAdded(source);
      setMessages(prev => [...prev, { role: 'system', content: 'Added "' + action.name + '"' }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'system',
        content: 'Could not add "' + action.name + '": ' + err.message,
        error: true,
      }]);
    }
  }

  function openFilePicker() {
    if (!pendingKid && kids.length === 1) {
      setPendingKid({ id: kids[0].id, name: kids[0].name });
    }
    fileInputRef.current?.click();
  }

  async function onFileChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!pendingKid) {
      if (kids.length === 1) {
        setPendingKid({ id: kids[0].id, name: kids[0].name });
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Which kid is this schedule for? Tell me their name and I\'ll upload the PDF.',
          display: 'Which kid is this schedule for? Tell me their name and I\'ll upload the PDF.',
        }]);
        return;
      }
    }

    const targetKid = pendingKid || { id: kids[0].id, name: kids[0].name };
    statusMsgIdxRef.current = null;

    try {
      await uploadPdf(file, targetKid.id);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'system',
        content: 'Upload failed: ' + err.message,
        error: true,
      }]);
    }
  }

  async function handleApprove(editedEvents, sourceName) {
    try {
      const result = await approve(editedEvents, sourceName);
      setShowReviewModal(false);

      if (onSourceAdded) {
        onSourceAdded({ id: result.sourceId, name: sourceName, app: 'pdf_upload' });
      }

      const kidName = pendingKid?.name || 'your kid';
      const followup = '✅ Added ' + result.eventsInserted + ' events for ' + kidName + '! Want to add another schedule?';

      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: followup, display: followup },
      ]);

      setPendingKid(null);
      statusMsgIdxRef.current = null;
      resetIngestion();
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'system',
        content: 'Could not add events: ' + err.message,
        error: true,
      }]);
    }
  }

  async function handleReject() {
    setShowReviewModal(false);
    try { await reject(); } catch {}
    const msg = 'No worries — I tossed that file. Want to try a different PDF, or would an iCal URL work instead?';
    setMessages(prev => [...prev, { role: 'assistant', content: msg, display: msg }]);
    setPendingKid(null);
    statusMsgIdxRef.current = null;
    resetIngestion();
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const QUICK_APPS = ['TeamSnap', 'GameChanger', 'PlayMetrics', 'SportsEngine', 'TeamSideline', 'BYGA'];

  if (!started) {
    return (
      <div style={{ padding: '40px', maxWidth: 640 }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 8 }}>
            Set up my calendars
          </h1>
          <p style={{ color: 'var(--slate)', fontSize: 15, lineHeight: 1.6 }}>
            I'll walk you through finding your iCal URLs from each sports app — or read a PDF schedule from the coach — and add everything to your account automatically.
          </p>
        </div>

        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ marginBottom: 16 }}>
            <img src="/robot.svg" alt="SportsCal assistant" style={{ width: 120, height: 120, marginBottom: 16 }} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, letterSpacing: '-0.01em' }}>
            Your calendar setup assistant
          </h2>
          <p style={{ color: 'var(--slate)', fontSize: 14, marginBottom: 28, lineHeight: 1.6, maxWidth: 380, margin: '0 auto 28px' }}>
            Tell me which apps you use — TeamSnap, GameChanger, PlayMetrics, and more — or drop in a PDF schedule and I'll read it for you.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 28 }}>
            {QUICK_APPS.map(app => (
              <span key={app} style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                background: 'var(--navy)', color: 'var(--accent)',
                border: '1px solid rgba(0,214,143,0.2)',
              }}>{app}</span>
            ))}
            <span style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
              background: 'var(--off-white)', color: 'var(--slate)',
            }}>+ 8 more</span>
            <span style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
              background: 'var(--off-white)', color: 'var(--slate)',
            }}>📄 PDF</span>
          </div>

          <button className="btn btn-primary" onClick={startSetup} style={{ fontSize: 15, padding: '12px 32px' }}>
            Let's set up my calendars →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '40px', maxWidth: 640, height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 20, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 2 }}>
              Calendar setup
            </h1>
            {addedSources.length > 0 && (
              <p style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 500 }}>
                {addedSources.length} source{addedSources.length !== 1 ? 's' : ''} added
              </p>
            )}
          </div>
          {addedSources.length > 0 && (
            <a href="/sources" style={{ fontSize: 13, color: 'var(--accent-dim)', fontWeight: 500, textDecoration: 'none' }}>
              View sources →
            </a>
          )}
        </div>
      </div>

      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
        gap: 12, marginBottom: 16,
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--border) transparent',
      }}>
        {messages.map((msg, i) => {
          if (msg.role === 'system') {
            return (
              <div key={i} style={{
                textAlign: 'center', fontSize: 13, fontWeight: 500,
                color: msg.error ? '#ef4444' : 'var(--accent)',
                padding: '6px 12px',
                background: msg.error ? 'rgba(239,68,68,0.08)' : 'rgba(0,214,143,0.08)',
                borderRadius: 8,
                border: '1px solid ' + (msg.error ? 'rgba(239,68,68,0.2)' : 'rgba(0,214,143,0.2)'),
              }}>
                {msg.content}
              </div>
            );
          }

          const isUser = msg.role === 'user';
          const displayText = msg.display != null ? msg.display : msg.content;

          return (
            <div key={i} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
              {!isUser && (
                <div style={{
                  width: 56, height: 56, borderRadius: 8, flexShrink: 0,
                  background: 'var(--navy)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', marginRight: 8, marginTop: 2,
                }}>
                  <img src="/robot-head.svg" alt="" style={{ width: 48, height: 48 }} />
                </div>
              )}
              <div style={{
                maxWidth: '78%',
                padding: '10px 14px',
                borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: isUser ? 'var(--accent)' : 'var(--card-bg, #fff)',
                color: 'var(--navy)',
                fontSize: 14,
                lineHeight: 1.6,
                fontWeight: isUser ? 500 : 400,
                border: isUser ? 'none' : '1px solid var(--border)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {isIcalUrl(displayText)
                  ? <span style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>{displayText}</span>
                  : displayText}
              </div>
            </div>
          );
        })}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 8, flexShrink: 0,
              background: 'var(--navy)', display: 'flex', alignItems: 'center',
              justifyContent: 'center',
            }}>
              <img src="/robot-head.svg" alt="" style={{ width: 48, height: 48 }} />
            </div>
            <div style={{
              padding: '10px 14px', borderRadius: '16px 16px 16px 4px',
              border: '1px solid var(--border)', background: 'var(--card-bg, #fff)',
            }}>
              <TypingDots />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={onFileChosen}
      />

      <div style={{
        flexShrink: 0,
        display: 'flex', gap: 8, alignItems: 'flex-end',
        background: 'var(--card-bg, #fff)',
        border: '1px solid var(--border)',
        borderRadius: 12, padding: '8px 8px 8px 14px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <button
          type="button"
          onClick={openFilePicker}
          disabled={uploading}
          title="Upload a PDF schedule"
          style={{
            width: 32, height: 32, borderRadius: 8, border: 'none',
            background: 'transparent',
            color: 'var(--slate)',
            cursor: uploading ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, flexShrink: 0,
            opacity: uploading ? 0.4 : 1,
          }}
        >
          📎
        </button>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message, paste a URL, or tap 📎 to upload a PDF..."
          rows={1}
          style={{
            flex: 1, border: 'none', outline: 'none', resize: 'none',
            fontSize: 14, lineHeight: 1.5, background: 'transparent',
            color: 'var(--navy)', fontFamily: 'inherit',
            maxHeight: 120, overflowY: 'auto',
          }}
          onInput={e => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          style={{
            width: 36, height: 36, borderRadius: 8, border: 'none',
            background: input.trim() && !loading ? 'var(--accent)' : 'var(--border)',
            color: input.trim() && !loading ? 'var(--navy)' : 'var(--slate)',
            cursor: input.trim() && !loading ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, flexShrink: 0, transition: 'all 0.15s',
          }}
        >
          ↑
        </button>
      </div>

      <p style={{ fontSize: 11, color: 'var(--slate)', textAlign: 'center', marginTop: 8 }}>
        Press Enter to send · Shift+Enter for new line · 📎 for PDF
      </p>

      {showReviewModal && ingestion?.status === 'ready_for_review' && (
        <IngestionReviewModal
          ingestion={ingestion}
          kidName={pendingKid?.name}
          onApprove={handleApprove}
          onCancel={handleReject}
        />
      )}
    </div>
  );
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 16 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--slate)',
          animation: 'typingBounce 1.2s ease-in-out infinite',
          animationDelay: i * 0.2 + 's',
        }} />
      ))}
      <style>{`
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// MagicLinkPdfReview — render path for /setup?ingestion=<magic_link_token>
//
// The user got here from the confirmation email after forwarding a PDF
// to add+<token>@inbox.sportscalapp.com. The ingestion already exists
// in pending_kid status with the PDF on disk. We:
//   1. Fetch ingestion + kids list publicly via /api/ingestions/by-link/:token
//   2. If pending_kid, show a kid picker as the primary action
//   3. After kid pick, POST /by-link/assign-kid (worker enqueues there)
//   4. Poll status as it moves through reading -> parsing
//   5. When ready_for_review, open the existing IngestionReviewModal —
//      that modal calls /api/ingestions/:id/approve which still requires
//      auth (security checkpoint at the moment of inserting events). If
//      the user isn't signed in, the modal's submit will 401 and we
//      surface a "please sign in" message with a link.
// ============================================================================

const MAGIC_LINK_TERMINAL = new Set(['ready_for_review', 'approved', 'rejected', 'failed']);
const MAGIC_LINK_POLL_MS  = 1500;

function MagicLinkPdfReview({ token }) {
  const { user } = useAuth();
  const [data, setData]       = useState(null);   // { ingestion, user, kids }
  const [loadError, setLoadError] = useState(null);
  const [chosenKidId, setChosenKidId] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const pollRef = useRef(null);

  const fetchIngestion = useCallback(async () => {
    const res = await fetch('/api/ingestions/by-link/' + encodeURIComponent(token));
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Link expired or invalid');
    }
    return res.json();
  }, [token]);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    fetchIngestion()
      .then(d => { if (!cancelled) setData(d); })
      .catch(err => { if (!cancelled) setLoadError(err.message); });
    return () => { cancelled = true; };
  }, [fetchIngestion]);

  // Polling loop. Runs whenever we have a non-terminal ingestion.
  useEffect(() => {
    const status = data?.ingestion?.status;
    if (!status || MAGIC_LINK_TERMINAL.has(status) || status === 'pending_kid') {
      // Don't poll while waiting on the user to pick a kid.
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const next = await fetchIngestion();
        setData(next);
      } catch {
        // transient network errors are fine; the next tick retries
      }
    }, MAGIC_LINK_POLL_MS);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [data?.ingestion?.status, fetchIngestion]);

  // Open review modal when extraction is done.
  useEffect(() => {
    if (data?.ingestion?.status === 'ready_for_review') setShowReview(true);
  }, [data?.ingestion?.status]);

  async function assignKid(kidId) {
    setAssigning(true);
    try {
      const res = await fetch('/api/ingestions/by-link/assign-kid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, kidId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Assign failed');
      // Refresh local state to reflect kid_id + new status; polling takes over.
      const next = await fetchIngestion();
      setData(next);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setAssigning(false);
    }
  }

  async function handleApprove(events, sourceName) {
    // Approve still requires auth — uses the same /:id/approve as the
    // logged-in flow. If the user isn't signed in we'll get a 401 here
    // and surface a sign-in prompt.
    const auth = localStorage.getItem('sc_token');
    if (!auth) {
      setLoadError('Please sign in to save these events to your calendar.');
      return;
    }
    const res = await fetch('/api/ingestions/' + data.ingestion.id + '/approve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + auth,
      },
      body: JSON.stringify({ events, sourceName }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Approve failed');
    }
    setShowReview(false);
    // Refresh — status will be 'approved'.
    const next = await fetchIngestion().catch(() => null);
    if (next) setData(next);
  }

  async function handleReject() {
    const auth = localStorage.getItem('sc_token');
    if (!auth) { setShowReview(false); return; }
    await fetch('/api/ingestions/' + data.ingestion.id + '/reject', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + auth },
    }).catch(() => {});
    setShowReview(false);
  }

  // ----- render branches -------------------------------------------------

  if (loadError) {
    return (
      <CenteredCard title="Link expired">
        <p style={{ fontSize: 14, color: 'var(--slate)', lineHeight: 1.6 }}>
          {loadError}
        </p>
        <p style={{ fontSize: 14, color: 'var(--slate)', marginTop: 12, lineHeight: 1.6 }}>
          You can forward the PDF again to your inbox address — we'll send a fresh link.
        </p>
      </CenteredCard>
    );
  }

  if (!data) {
    return <CenteredCard title="Loading…"><span className="spinner" style={{ width: 16, height: 16 }} /></CenteredCard>;
  }

  const ing = data.ingestion;
  const kid = data.kids.find(k => k.id === ing.kid_id);

  if (ing.status === 'approved') {
    return (
      <CenteredCard title={`Added ${ing.approved_count || ing.event_count || 0} events`}>
        <p style={{ fontSize: 14, color: 'var(--slate)', lineHeight: 1.6 }}>
          {kid?.name ? `${kid.name}'s` : 'The'} schedule is up to date.
        </p>
        <a href="/dashboard" className="btn btn-primary btn-sm" style={{ marginTop: 16 }}>
          Open SportsCal
        </a>
      </CenteredCard>
    );
  }

  if (ing.status === 'rejected') {
    return <CenteredCard title="Discarded"><p style={{ fontSize: 14, color: 'var(--slate)' }}>This PDF was thrown away. Forward it again any time.</p></CenteredCard>;
  }

  if (ing.status === 'failed') {
    return (
      <CenteredCard title="Couldn't read that PDF">
        <p style={{ fontSize: 14, color: 'var(--slate)', lineHeight: 1.6 }}>
          {ing.extraction_error || 'The schedule wasn\'t in a format we could parse. Try a clearer scan or paste the iCal URL into the setup helper.'}
        </p>
      </CenteredCard>
    );
  }

  if (ing.status === 'pending_kid') {
    return (
      <CenteredCard title={`Found '${ing.original_filename}'`}>
        <p style={{ fontSize: 14, color: 'var(--slate)', lineHeight: 1.6, marginBottom: 16 }}>
          Hi {data.user.name?.split(' ')[0] || 'there'} — which kid is this schedule for?
        </p>
        {data.kids.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--slate)', padding: 12,
                        background: 'var(--off-white)', borderRadius: 8 }}>
            You don't have any kids on your account yet.
            {' '}<a href="/kids">Add one in the Kids page</a> first, then come back to this link.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.kids.map(k => (
              <button key={k.id}
                onClick={() => assignKid(k.id)}
                disabled={assigning}
                className="card"
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', textAlign: 'left',
                  cursor: assigning ? 'wait' : 'pointer',
                  opacity: assigning && chosenKidId !== k.id ? 0.5 : 1,
                  border: '1px solid var(--border)',
                  background: 'white',
                }}
                onMouseDown={() => setChosenKidId(k.id)}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: k.color || '#6366f1',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 700, fontSize: 13,
                }}>
                  {(k.name || '?')[0].toUpperCase()}
                </div>
                <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--navy)', flex: 1 }}>
                  {k.name}
                </span>
                {assigning && chosenKidId === k.id && <span className="spinner" style={{ width: 14, height: 14 }} />}
              </button>
            ))}
          </div>
        )}
      </CenteredCard>
    );
  }

  // Worker is processing.
  return (
    <>
      <CenteredCard title="Reading your schedule…">
        <p style={{ fontSize: 14, color: 'var(--slate)', lineHeight: 1.6 }}>
          {kid?.name ? `Pulling events for ${kid.name}.` : 'Extracting events.'}
          {' '}This usually takes 5–15 seconds.
        </p>
        <div style={{ marginTop: 16, fontSize: 13, color: 'var(--slate)' }}>
          {ing.status_detail || ing.status}
        </div>
        <div style={{ marginTop: 12 }}><span className="spinner" style={{ width: 16, height: 16 }} /></div>
      </CenteredCard>
      {showReview && ing.status === 'ready_for_review' && (
        <IngestionReviewModal
          ingestion={ing}
          kidName={kid?.name}
          onApprove={handleApprove}
          onCancel={handleReject}
        />
      )}
    </>
  );
}

function CenteredCard({ title, children }) {
  return (
    <div style={{
      maxWidth: 480, margin: '60px auto', padding: '32px',
      background: 'white', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', boxShadow: '0 4px 12px rgba(15,22,41,0.05)',
    }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16, letterSpacing: '-0.01em' }}>
        {title}
      </h1>
      {children}
    </div>
  );
}
