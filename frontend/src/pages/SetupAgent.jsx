import { useState, useRef, useEffect } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.jsx';

// ── App instructions corpus fed to the agent ─────────────────────────────────
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

const SYSTEM_PROMPT = `You are a friendly setup assistant for SportsCal, a service that aggregates youth sports calendars into one unified feed.

Your job is to guide parents step-by-step through finding their iCal URLs from sports apps and adding them to their SportsCal account.

You have knowledge of these apps: ${Object.values(APP_INSTRUCTIONS).map(a => a.label).join(', ')}, and Custom iCal.

## Your personality
- Warm, encouraging, and patient — parents are often not tech-savvy
- Concise — don't write walls of text
- Celebrate small wins ("Perfect! Got it!")
- Use occasional emoji but don't overdo it

## Your job
1. Start by asking which apps the parent uses (list them or let them type)
2. Walk through each app one at a time
3. When the user pastes a URL, validate it looks like an iCal URL (starts with https:// or webcal://, ideally contains .ics or known domain patterns)
4. Ask what to name the source and which kid(s) it's for
5. Confirm details before adding: "Ready to add 'Tualatin Baseball' for James from GameChanger — sound right?"
6. After user confirms, respond with a special JSON action block (this triggers the actual API call):

ACTION:{"action":"add_source","name":"<name>","app":"<app_value>","ical_url":"<url>","kid_names":[<names>]}

7. After each source is added, ask if there are more to add
8. When done, give a cheerful summary of what was added

## App instructions reference
${JSON.stringify(APP_INSTRUCTIONS, null, 2)}

## App values (use these exact values in the action JSON)
${APP_LIST.map(a => `- ${a.label} → "${a.value}"`).join('\n')}

## Important rules
- Only emit the ACTION: block when the user has explicitly confirmed they want to add the source
- One ACTION block per message
- If a URL doesn't look valid, ask the user to double-check it
- If you're unsure which app a URL is from, make your best guess based on the domain
- Never ask for passwords or login credentials — only iCal URLs
- Keep responses short and conversational`;

// ── Utility ───────────────────────────────────────────────────────────────────
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

// ── Component ─────────────────────────────────────────────────────────────────
export default function SetupAgent({ onSourceAdded }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [kids, setKids] = useState([]);
  const [addedSources, setAddedSources] = useState([]);
  const [started, setStarted] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    api.kids.list().then(({ kids }) => setKids(kids)).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function startSetup() {
    setStarted(true);
    setLoading(true);
    const kidNames = kids.map(k => k.name).join(', ');
    const intro = kids.length > 0
      ? `Hi! I'm here to help you set up your sports calendars. I can see you have ${kids.length > 1 ? `${kids.length} kids` : '1 kid'} in your family: ${kidNames}. Which sports apps do you use? For example: TeamSnap, GameChanger, PlayMetrics — or just tell me what apps you've got!`
      : `Hi! I'm here to help you set up your sports calendars. Which sports apps do you use? For example: TeamSnap, GameChanger, PlayMetrics — or just tell me what you've got!`;

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
      // Build conversation for API
      const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: apiMessages,
        }),
      });

      const data = await res.json();
      const rawContent = data.content?.[0]?.text || "Sorry, something went wrong. Please try again.";
      const action = extractAction(rawContent);
      const displayContent = stripAction(rawContent);

      const assistantMsg = { role: 'assistant', content: rawContent, display: displayContent };
      setMessages(prev => [...prev, assistantMsg]);

      // Execute action if present
      if (action?.action === 'add_source') {
        await executeAddSource(action);
      }

    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Sorry, I hit an error. Please try again.",
        display: "Sorry, I hit an error. Please try again.",
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  async function executeAddSource(action) {
    try {
      // Match kid names to IDs
      const kidIds = action.kid_names
        ?.map(name => kids.find(k => k.name.toLowerCase() === name.toLowerCase())?.id)
        .filter(Boolean) || [];

      const { source } = await api.sources.create({
        name: action.name,
        app: action.app,
        fetch_type: 'ical',
        ical_url: action.ical_url,
        kid_ids: kidIds,
      });

      setAddedSources(prev => [...prev, source]);
      onSourceAdded?.(source);

      // Inject a system note into the chat
      setMessages(prev => [...prev, {
        role: 'system',
        content: `✓ Added "${action.name}"`,
      }]);

    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'system',
        content: `⚠ Couldn't add "${action.name}": ${err.message}`,
        error: true,
      }]);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  // ── Quick reply chips ───────────────────────────────────────────────────────
  const QUICK_APPS = ['TeamSnap', 'GameChanger', 'PlayMetrics', 'SportsEngine', 'TeamSideline', 'BYGA'];

  if (!started) {
    return (
      <div style={{ padding: '40px', maxWidth: 640 }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 8 }}>
            Set up my calendars
          </h1>
          <p style={{ color: 'var(--slate)', fontSize: 15, lineHeight: 1.6 }}>
            I'll walk you through finding your iCal URLs from each sports app and add them to your account automatically.
          </p>
        </div>

        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ marginBottom: 16 }}>
            <img src="/robot.svg" alt="SportsCal" style={{ width: 120, height: 120, marginBottom: 16 }} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, letterSpacing: '-0.01em' }}>
            Your calendar setup assistant
          </h2>
          <p style={{ color: 'var(--slate)', fontSize: 14, marginBottom: 28, lineHeight: 1.6, maxWidth: 380, margin: '0 auto 28px' }}>
            Tell me which apps you use — TeamSnap, GameChanger, PlayMetrics, and more — and I'll guide you through getting each URL step by step.
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
      {/* Header */}
      <div style={{ marginBottom: 20, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 2 }}>
              Calendar setup
            </h1>
            {addedSources.length > 0 && (
              <p style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 500 }}>
                ✓ {addedSources.length} source{addedSources.length !== 1 ? 's' : ''} added
              </p>
            )}
          </div>
          {addedSources.length > 0 && (
            <a href="/dashboard/sources" style={{
              fontSize: 13, color: 'var(--accent-dim)', fontWeight: 500,
              textDecoration: 'none',
            }}>
              View sources →
            </a>
          )}
        </div>
      </div>

      {/* Chat window */}
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
                border: `1px solid ${msg.error ? 'rgba(239,68,68,0.2)' : 'rgba(0,214,143,0.2)'}`,
              }}>
                {msg.content}
              </div>
            );
          }

          const isUser = msg.role === 'user';
          const displayText = msg.display ?? msg.content;

          return (
            <div key={i} style={{
              display: 'flex',
              justifyContent: isUser ? 'flex-end' : 'flex-start',
            }}>
              {!isUser && (
               <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: 'var(--navy)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', marginRight: 8, marginTop: 2,
            }}>
              <img src="/robot-head.svg" alt="" style={{ width: 24, height: 24 }} />
                </div>
              )}
              <div style={{
                maxWidth: '78%',
                padding: '10px 14px',
                borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: isUser ? 'var(--accent)' : 'var(--card-bg, #fff)',
                color: isUser ? 'var(--navy)' : 'var(--navy)',
                fontSize: 14,
                lineHeight: 1.6,
                fontWeight: isUser ? 500 : 400,
                border: isUser ? 'none' : '1px solid var(--border)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {/* Detect pasted URLs and highlight them */}
                {isIcalUrl(displayText) ? (
                  <span style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
                    {displayText}
                  </span>
                ) : displayText}
              </div>
            </div>
          );
        })}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              background: 'var(--navy)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', marginRight: 8, marginTop: 2,
            }}>
             <img src="/robot-head.svg" alt="" style={{ width: 24, height: 24 }} />
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

      {/* Input area */}
      <div style={{
        flexShrink: 0,
        display: 'flex', gap: 8, alignItems: 'flex-end',
        background: 'var(--card-bg, #fff)',
        border: '1px solid var(--border)',
        borderRadius: 12, padding: '8px 8px 8px 14px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message or paste a URL..."
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
        Press Enter to send · Shift+Enter for new line
      </p>
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
          animationDelay: `${i * 0.2}s`,
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
