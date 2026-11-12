// ============================================================
// Welcome series — one feature email each morning after signup.
//
// Day 0 is the existing welcomeEmail() sent at signup. Then, starting
// the next morning at 9 AM in the user's timezone, one email a day in
// this order, skipping any that don't apply:
//
//   forward    Their private add+<token>@inbox address. Flags it when
//              they have no kids yet (forwarded links arrive with no
//              kid name, forwarded PDFs wait for one).
//   coparent   Invite a co-parent.        Skipped: household of 2+, or
//                                         an invite already pending.
//   rides      Ask a group for a ride.    Skipped: free plan (ride
//                                         requests are Premium).
//   nightly    The 8 PM push.             Skipped: already receiving it.
//   calendars  Add the rest of the teams. Skipped: at the plan's calendar
//                                         limit. Copy adapts to 0 vs N.
//
// No email pitches Premium: like inbound.js's replies, these get read in
// iPhone Mail, so free accounts just skip the Premium-only steps.
//
// Each animated preview is a GIF made from the app's welcome-carousel
// clip (mobile/assets/tutorials/welcome-*.mp4), served by the web app
// from frontend/public/email/. GIFs play in Gmail and Apple Mail;
// Outlook shows the first frame. Every preview links to its /how page.
//
// Enrollment: users.welcome_series = '{}' at signup (createUser), NULL
// for accounts that predate the series. Progress is the array of keys
// sent or skipped. Footer + List-Unsubscribe headers turn off tips only.
// ============================================================

import { layout, styles, escapeHtml } from './templates.js';

const BASE_URL = process.env.FRONTEND_URL || 'https://sportscalapp.com';
const APP_STORE_URL = 'https://apps.apple.com/us/app/id6765724702';
const SEND_HOUR = 9; // local time

export const WELCOME_STEPS = ['forward', 'coparent', 'rides', 'nightly', 'calendars'];

// Display name on the From line. The series (and the signup email, Day 0)
// is written in the founder's voice, so it comes from him by name.
export const WELCOME_FROM_NAME = 'John from SportsCal';

// ------------------------------------------------------------
// Scheduling
// ------------------------------------------------------------

function localParts(date, timeZone) {
  const tz = timeZone || 'America/Los_Angeles';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', hourCycle: 'h23',
  }).formatToParts(date).map(p => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

// Due at 9 AM local, starting the day after signup, at most one a day.
export function isWelcomeDue(user, now = new Date()) {
  if (!Array.isArray(user.welcome_series)) return false;
  if (WELCOME_STEPS.every(k => user.welcome_series.includes(k))) return false;
  const today = localParts(now, user.timezone);
  if (today.hour !== SEND_HOUR) return false;
  if (localParts(new Date(user.created_at), user.timezone).day >= today.day) return false;
  if (user.welcome_series_sent_at &&
      localParts(new Date(user.welcome_series_sent_at), user.timezone).day >= today.day) return false;
  return true;
}

export function localDay(now, timeZone) {
  return localParts(now, timeZone).day;
}

// Why a step doesn't apply to this user right now, or null if it does.
function skipReason(key, user, ctx) {
  if (key === 'coparent' && (ctx.householdSize > 1 || ctx.pendingInvite)) return 'household already shared';
  if (key === 'rides' && !ctx.isPremium) return 'ride requests are Premium';
  if (key === 'nightly' && ctx.hasApp && user.push_enabled && !user.push_opted_out) return 'already receiving it';
  if (key === 'calendars' && ctx.atCalendarLimit) return 'at the calendar limit';
  return null;
}

// The next step to send plus any skipped on the way to it. null when the
// series is finished (everything left was skipped too: `skipped` is then
// still worth recording so the user drops out of the candidate scan).
export function pickWelcomeStep(user, ctx) {
  const done = new Set(user.welcome_series || []);
  const skipped = [];
  for (const key of WELCOME_STEPS) {
    if (done.has(key)) continue;
    if (skipReason(key, user, ctx)) { skipped.push(key); continue; }
    return { key, skipped };
  }
  return { key: null, skipped };
}

// ------------------------------------------------------------
// Building blocks
// ------------------------------------------------------------

const firstNameOf = (user) => escapeHtml((user.name || 'there').split(' ')[0] || 'there');

const button = (href, label) =>
  `<p style="margin:24px 0 8px;"><a href="${href}" style="${styles.btn}">${label}</a></p>`;

const textLink = (href, label) =>
  `<a href="${href}" style="color:#2563EB;text-decoration:none;font-weight:600;">${label}</a>`;

function preview(clip, href, alt) {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:8px 0 20px;">
      <tr><td align="center" style="background:#F1F5F9;border-radius:12px;padding:20px 0 14px;">
        <a href="${href}" style="text-decoration:none;">
          <img src="${BASE_URL}/email/welcome-${clip}.gif" width="260" alt="${alt}"
               style="display:block;width:260px;max-width:100%;height:auto;border:0;border-radius:14px;box-shadow:0 2px 10px rgba(15,23,42,0.12);" />
        </a>
        <p style="margin:12px 0 0;font-size:12.5px;color:#64748B;">
          Quick demo · ${textLink(href, 'step-by-step guide →')}
        </p>
      </td></tr>
    </table>`;
}

function callout(tone, title, body, action = '') {
  const c = tone === 'warn'
    ? { bg: '#FFFBEB', border: '#FDE68A', title: '#92400E' }
    : { bg: '#EFF6FF', border: '#DBEAFE', title: '#1D4ED8' };
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:4px 0 22px;">
      <tr><td style="background:${c.bg};border:1px solid ${c.border};border-radius:10px;padding:16px 18px;">
        <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:${c.title};">${title}</p>
        <p style="margin:0;font-size:14px;color:#334155;line-height:1.55;">${body}</p>
        ${action}
      </td></tr>
    </table>`;
}

function addressCard(address) {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:4px 0 20px;">
      <tr><td align="center" style="background:#0F172A;border-radius:12px;padding:22px 16px;">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#93C5FD;text-transform:uppercase;letter-spacing:0.1em;">Your SportsCal address</p>
        <p style="margin:0;font-size:18px;font-weight:600;color:#FFFFFF;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;">
          <a href="mailto:${address}" style="color:#FFFFFF;text-decoration:none;">${address}</a>
        </p>
        <p style="margin:10px 0 0;font-size:12.5px;color:#CBD5E1;">Save it as a contact named “SportsCal” so it’s one tap from any email.</p>
      </td></tr>
    </table>`;
}

function featureRow(emoji, title, body) {
  return `
    <tr>
      <td width="36" style="vertical-align:top;padding:10px 0;font-size:22px;line-height:1.2;">${emoji}</td>
      <td style="vertical-align:top;padding:10px 0 10px 8px;">
        <p style="margin:0 0 3px;font-size:15px;font-weight:600;color:#0F172A;">${title}</p>
        <p style="margin:0;font-size:14px;color:#64748B;line-height:1.55;">${body}</p>
      </td>
    </tr>`;
}

function footer(unsubscribeUrl) {
  return `<p style="${styles.muted}">
    You're getting this because you joined SportsCal. One short email a day for your first week.
    <a href="${unsubscribeUrl}" style="color:#64748B;">Stop these tips</a>
    (account emails and replies to things you forward still come).
  </p>`;
}

// "Bobby", "Bobby and Evie", "Bobby, Evie and Levi"
function joinNames(names) {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// ------------------------------------------------------------
// The emails. Each returns { subject, preheader, body, text }.
// ------------------------------------------------------------

function forwardEmail({ user, ctx, inboundAddress }) {
  const first = firstNameOf(user);
  const kids = ctx.kidNames.map(escapeHtml);
  const addKidsUrl = `${BASE_URL}/kids`;

  let kidNote;
  let kidText;
  if (kids.length === 0) {
    kidNote = callout('warn', 'One thing first: add your kids',
      'SportsCal files every forwarded schedule under a kid. You haven’t added one yet, so a forwarded '
      + 'team calendar would show up with no name on it, and a forwarded PDF waits until you add one. '
      + 'It takes about 30 seconds.',
      `<p style="margin:12px 0 0;">${textLink(addKidsUrl, 'Add your kids →')}</p>`);
    kidText = `One thing first: add your kids (${addKidsUrl}). Until you do, a forwarded team calendar shows up with no name on it and a forwarded PDF waits.`;
  } else if (kids.length === 1) {
    kidNote = callout('info', `Everything you forward goes on ${kids[0]}’s calendar`,
      'You have one kid on SportsCal, so there’s nothing to sort. Add a sibling later and we’ll ask whose schedule it is.');
    kidText = `Everything you forward goes on ${ctx.kidNames[0]}'s calendar.`;
  } else {
    kidNote = callout('info', `You’ll pick whose schedule it is`,
      `With ${joinNames(kids)} on SportsCal, our reply tells you how to put each forward on the right kid.`);
    kidText = `With ${joinNames(ctx.kidNames)} on SportsCal, our reply tells you how to put each forward on the right kid.`;
  }

  const body = `
    <h2 style="${styles.h2}">Forward schedules straight to your SportsCal</h2>
    <p style="${styles.p}">
      Hi ${first}, this is the feature I use most. Your SportsCal has its own private email address.
      Forward a schedule to it and it lands on your family calendar.
    </p>
    ${addressCard(inboundAddress)}
    ${kidNote}
    <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#0F172A;text-transform:uppercase;letter-spacing:0.06em;">What you can send it</p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      ${featureRow('📅', 'Team emails with a calendar link',
        'TeamSnap, GameChanger, PlayMetrics, BYGA… if the email has a “subscribe to calendar” link, forward it. '
        + 'We add the whole season and keep it in sync.')}
      ${featureRow('📄', 'A PDF schedule',
        'The season schedule from the coach, a tournament bracket, the school calendar. We read it and you pick which events to keep.')}
      ${featureRow('✉️', 'Calendar invites',
        'In Google, Apple or Outlook Calendar, add your SportsCal address as a guest. The event shows up for the whole family.')}
    </table>
    <p style="${styles.p};margin-top:12px;">You'll get a reply right away telling you what we added.</p>
    ${button(`${BASE_URL}/how/forward-by-email`, 'See how it works →')}
  `;

  return {
    subject: 'Your SportsCal has its own email address',
    preheader: 'Forward a schedule, a PDF or a calendar invite and it lands on your family calendar.',
    body,
    text: [
      `Hi ${(user.name || 'there').split(' ')[0]},`,
      '',
      'Your SportsCal has its own private email address. Forward a schedule to it and it lands on your family calendar:',
      '',
      `  ${inboundAddress}`,
      '',
      kidText,
      '',
      'What you can send it:',
      '  * Team emails with a "subscribe to calendar" link (TeamSnap, GameChanger, PlayMetrics, BYGA...)',
      '  * A PDF schedule. We read it and you pick which events to keep.',
      '  * Calendar invites. Add your SportsCal address as a guest in Google, Apple or Outlook Calendar.',
      '',
      "You'll get a reply right away telling you what we added.",
      `How it works: ${BASE_URL}/how/forward-by-email`,
    ].join('\n'),
  };
}

function coparentEmail({ user }) {
  const first = firstNameOf(user);
  const guide = `${BASE_URL}/how/add-a-co-parent`;
  const body = `
    <h2 style="${styles.h2}">Both parents, one calendar</h2>
    <p style="${styles.p}">
      Hi ${first}, the quickest way to end the “wait, what time is pickup?” texts: invite whoever else drives.
      They get the same kids, the same calendars, and every change as soon as it happens.
    </p>
    ${preview('coparent', guide, 'Inviting a co-parent from SportsCal Settings')}
    <p style="${styles.p}">
      Go to <strong>Settings → Household</strong>, type their email, and tap <strong>Send invite</strong>.
      They tap the link in their email and they're in, with their own login. If they already use SportsCal,
      their kids and calendars come with them.
    </p>
    ${button(`${BASE_URL}/settings`, 'Invite your co-parent →')}
  `;
  return {
    subject: 'Both parents, one calendar',
    preheader: "Invite your co-parent and you'll both see every practice, game and change.",
    body,
    text: [
      `Hi ${(user.name || 'there').split(' ')[0]},`,
      '',
      'Invite whoever else drives. They get the same kids, the same calendars, and every change as soon as it happens.',
      '',
      "Settings -> Household -> type their email -> Send invite. They tap the link and they're in.",
      '',
      `Invite your co-parent: ${BASE_URL}/settings`,
      `Guide: ${guide}`,
    ].join('\n'),
  };
}

function ridesEmail({ user }) {
  const first = firstNameOf(user);
  const guide = `${BASE_URL}/rides/group`;
  const body = `
    <h2 style="${styles.h2}">Ask the team for a ride. First yes wins.</h2>
    <p style="${styles.p}">
      Hi ${first}, two kids, two fields, same time? Ask the whole team at once. SportsCal writes one
      iMessage to the other parents with Yes and No links.
    </p>
    ${preview('ride', guide, 'Asking a team of parents for a ride in SportsCal')}
    <p style="${styles.p}">
      Set up the group once: in <strong>Contacts → Teams and Groups</strong>, add the team's parents.
      After that, open any event, tap <strong>+ Assign a ride</strong> under Ride requests, and choose
      <strong>Ask a group</strong>.
    </p>
    <p style="${styles.p}">
      The first parent to tap Yes gets the ride and it locks in, so nobody double-books. Everyone who taps
      after them sees a friendly “someone beat you to it.” You get one notification: who's driving.
    </p>
    ${button(guide, 'See how ride requests work →')}
  `;
  return {
    subject: 'Need a ride? Ask the whole team at once',
    preheader: 'One message to every parent on the team. The first one to say yes gets it.',
    body,
    text: [
      `Hi ${(user.name || 'there').split(' ')[0]},`,
      '',
      'Two kids, two fields, same time? Ask the whole team at once.',
      "Set up the group once in Contacts -> Teams and Groups. Then open any event, tap + Assign a ride under Ride requests, and choose Ask a group.",
      'SportsCal writes one iMessage to the other parents with Yes and No links. The first Yes gets the ride and it locks in.',
      '',
      `How it works: ${guide}`,
    ].join('\n'),
  };
}

function nightlyEmail({ user, ctx }) {
  const first = firstNameOf(user);
  const guide = `${BASE_URL}/how/bedtime-reminder`;
  const turnOn = ctx.hasApp
    ? `<p style="${styles.p}">It's off on your phone right now. To turn it on, open the app and go to <strong>Settings → Nightly heads-up</strong>.</p>`
    : `<p style="${styles.p}">It comes from the SportsCal iPhone app. Sign in with the same account and allow notifications when it asks.</p>
       ${button(APP_STORE_URL, 'Get the iPhone app →')}`;
  const body = `
    <h2 style="${styles.h2}">Know tomorrow before bedtime</h2>
    <p style="${styles.p}">
      Hi ${first}, every night at 8 PM SportsCal can send one notification with tomorrow's schedule:
      who has what, when and where. Nights with nothing on, it stays quiet.
    </p>
    ${preview('bedtime', guide, "SportsCal's 8 PM notification with tomorrow's schedule")}
    ${turnOn}
  `;
  return {
    subject: "Tomorrow's schedule, every night at 8",
    preheader: "One heads-up on your phone the night before, only when something's on.",
    body,
    text: [
      `Hi ${(user.name || 'there').split(' ')[0]},`,
      '',
      "Every night at 8 PM SportsCal can send one notification with tomorrow's schedule. Nights with nothing on, it stays quiet.",
      '',
      ctx.hasApp
        ? "It's off on your phone right now. Open the app: Settings -> Nightly heads-up."
        : `It comes from the iPhone app: ${APP_STORE_URL}`,
      `More: ${guide}`,
    ].join('\n'),
  };
}

function calendarsEmail({ user, ctx, inboundAddress }) {
  const first = firstNameOf(user);
  const guide = `${BASE_URL}/how/add-calendar`;
  const n = ctx.calendarCount;
  const intro = n === 0
    ? `Hi ${first}, SportsCal only knows about the teams you connect, and you haven't added one yet.
       Most team apps have a “subscribe to calendar” link. Paste it in and the whole season shows up,
       then stays in sync on its own.`
    : `Hi ${first}, you've connected ${n} calendar${n === 1 ? '' : 's'} so far. Is there a team that isn't in yet?
       A second sport, the school calendar, a club tournament? Add it and it shows up next to everything else,
       color-coded by kid.`;
  const body = `
    <h2 style="${styles.h2}">${n === 0 ? "Let's get your first team in" : 'Every team, one calendar'}</h2>
    <p style="${styles.p}">${intro}</p>
    ${preview('calendar', guide, 'Adding a team calendar to SportsCal')}
    <p style="${styles.p}">
      Not sure where your team app hides the link? The setup helper walks you through it for TeamSnap,
      GameChanger, PlayMetrics, SportsEngine and more. Or forward the team email to
      <a href="mailto:${inboundAddress}" style="color:#2563EB;text-decoration:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;">${inboundAddress}</a>.
    </p>
    ${button(`${BASE_URL}/setup`, 'Add a calendar →')}
    <p style="${styles.p};margin-top:28px;">
      That's the tour. If something's missing or confusing, reply to this email. It comes straight to me.
    </p>
    <p style="${styles.p};margin:0;">John<br><span style="color:#64748B;font-size:13px;">SportsCal founder, parent of four</span></p>
  `;
  return {
    subject: n === 0 ? 'Add your first team in about 30 seconds' : 'Is every team in?',
    preheader: 'TeamSnap, GameChanger, PlayMetrics, SportsEngine, BYGA and more, all on one calendar.',
    body,
    text: [
      `Hi ${(user.name || 'there').split(' ')[0]},`,
      '',
      n === 0
        ? "You haven't added a team calendar yet. Most team apps have a \"subscribe to calendar\" link. Paste it in and the whole season shows up."
        : `You've connected ${n} calendar${n === 1 ? '' : 's'} so far. Is there a team that isn't in yet?`,
      '',
      `Add a calendar: ${BASE_URL}/setup`,
      `Or forward the team email to ${inboundAddress}`,
      '',
      "That's the tour. If something's missing or confusing, reply to this email. It comes straight to me.",
      '',
      'John',
    ].join('\n'),
  };
}

const BUILDERS = {
  forward: forwardEmail,
  coparent: coparentEmail,
  rides: ridesEmail,
  nightly: nightlyEmail,
  calendars: calendarsEmail,
};

// { subject, html, text } for one step.
export function renderWelcomeEmail(key, { user, ctx, inboundAddress, unsubscribeUrl }) {
  const { subject, preheader, body, text } = BUILDERS[key]({ user, ctx, inboundAddress });
  return {
    subject,
    html: layout(body, preheader, { footer: footer(unsubscribeUrl) }),
    text: `${text}\n\n--\nStop these tips: ${unsubscribeUrl}`,
  };
}
