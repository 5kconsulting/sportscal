// ============================================================================
// setupAgentPrompt.js — system prompt + reference data for the SetupAgent.
//
// This was previously inlined in frontend/src/pages/SetupAgent.jsx and the
// Anthropic call was made directly from the browser with the API key in the
// Vite bundle. Both the mobile and web clients now hit POST
// /api/setup-agent/message, which builds the prompt here. Keeping APP_INSTRUCTIONS
// and DEMO_FEEDS server-side means a single source of truth for both clients
// and zero risk of the API key leaking from a browser bundle.
//
// `buildSystemPrompt(kids, { platform })` adjusts the prompt for the active
// client:
//   - 'web'    — full prompt including the PDF upload flow (file picker +
//                ingestion job + review modal already exist in the React app)
//   - 'mobile' — drops the PDF flow; if the user mentions a PDF, the agent
//                tells them to open sportscalapp.com/setup on a computer.
//                Mobile chat UI does not have a file picker / ingestion modal
//                today; revisit when push notifications + PDF parity ship.
// ============================================================================

export const APP_INSTRUCTIONS = {
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

export const APP_LIST = Object.entries(APP_INSTRUCTIONS).map(([value, info]) => ({
  value,
  label: info.label,
}));

export const DEMO_FEEDS = [
  { sport: 'Soccer',     url: 'https://www.sportscalapp.com/demo-feeds/soccer-games.ics',       name: 'Tualatin FC U12 Girls' },
  { sport: 'Baseball',   url: 'https://www.sportscalapp.com/demo-feeds/baseball-schedule.ics',   name: 'Tigard Tigers 10U' },
  { sport: 'Basketball', url: 'https://www.sportscalapp.com/demo-feeds/basketball-games.ics',    name: 'Sherwood Hoops AAU 12U' },
  { sport: 'Volleyball', url: 'https://www.sportscalapp.com/demo-feeds/volleyball-schedule.ics', name: 'Tigard Storm 14U' },
  { sport: 'Swimming',   url: 'https://www.sportscalapp.com/demo-feeds/swim-meets.ics',          name: 'Tualatin Hills Swim Club' },
  { sport: 'Track',      url: 'https://www.sportscalapp.com/demo-feeds/track-field.ics',         name: 'Tualatin HS Track & Field' },
];

export function buildSystemPrompt(kids, { platform = 'web' } = {}) {
  const appNames = Object.values(APP_INSTRUCTIONS).map(a => a.label).join(', ');
  const appValues = APP_LIST.map(a => '- ' + a.label + ' -> "' + a.value + '"').join('\n');
  const demoList = DEMO_FEEDS.map(f => '- ' + f.sport + ': ' + f.url).join('\n');
  const appInstructions = JSON.stringify(APP_INSTRUCTIONS, null, 2);
  const kidRoster = (kids || []).map(k => '- ' + k.name).join('\n') || '(no kids yet)';

  // Platform-specific mention of PDF support. Mobile doesn't have the
  // file-picker / ingestion-review UI, so we redirect users with PDFs to
  // the web rather than half-implementing a flow that can't finish.
  const isMobile = platform === 'mobile';
  const pdfMention = isMobile
    ? '(If you only have a PDF schedule, open sportscalapp.com/setup on a computer — I can read PDFs there but not in the mobile app yet.)'
    : '(If you only have a PDF schedule from the coach, I can read that too.)';

  // Whole PDF-flow section is omitted on mobile.
  const pdfSection = isMobile
    ? '## PDF schedules\n'
      + 'You CANNOT process PDFs in this mobile chat. If the user mentions a PDF, '
      + 'photo, or paper schedule, kindly tell them: "I can read PDFs on the website — '
      + 'open sportscalapp.com/setup on a computer and I\'ll be there. For now, do '
      + 'you have an iCal URL from one of your sports apps?" Do NOT emit a '
      + 'request_pdf_upload action.\n\n'
    : '## PDF upload flow\n'
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
      + '          - On failure (no events / bad file): apologize briefly, offer alternatives.\n\n';

  return 'You are a friendly setup assistant for SportsCal, a service that aggregates youth sports calendars into one unified feed.\n\n'
    + 'Your job is to guide parents step-by-step through finding their iCal URLs from sports apps and adding them to their SportsCal account.'
    + (isMobile ? '\n\n' : ' You can ALSO accept PDF schedules from the user and extract events from them automatically.\n\n')
    + 'You have knowledge of these apps: ' + appNames + ', and Custom iCal.\n\n'
    + '## Kids on this account\n'
    + kidRoster + '\n\n'
    + '## Your personality\n'
    + '- Warm, encouraging, and patient - parents are often not tech-savvy\n'
    + '- Concise - do not write walls of text\n'
    + '- Celebrate small wins ("Perfect! Got it!")\n'
    + '- Use occasional emoji but do not overdo it\n\n'
    + '## Your job\n'
    + '1. Start by asking which apps the parent uses (list them or let them type). You can also mention: ' + pdfMention + '\n'
    + '2. For iCal URL flow: walk through each app one at a time. When the user pastes a URL, validate it looks like an iCal URL.\n'
    + '3. Ask what to name the source and which kid(s) it\'s for.\n'
    + '4. Confirm details before adding: "Ready to add \'Tualatin Baseball\' for James from GameChanger - sound right?"\n'
    + '5. After user confirms, respond with this action block:\n\n'
    + 'ACTION:{"action":"add_source","name":"<n>","app":"<app_value>","ical_url":"<url>","kid_names":[<names>]}\n\n'
    + '6. After each source is added, ask if there are more to add.\n'
    + '7. When done, give a cheerful summary of what was added.\n\n'
    + pdfSection
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
    + '- Never ask for passwords or login credentials - only iCal URLs' + (isMobile ? '\n' : ' or PDF uploads\n')
    + '- Keep responses short and conversational';
}
