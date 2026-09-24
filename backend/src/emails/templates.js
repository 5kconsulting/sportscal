// ============================================================
// SportsCal Email Templates
// Clean, mobile-friendly HTML emails
// ============================================================

const BASE_URL = process.env.FRONTEND_URL || 'https://sportscalapp.com';
const DEFAULT_TZ = 'America/Los_Angeles';

const styles = {
  body:    'margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
  wrapper: 'background:#F8FAFC;padding:40px 16px;',
  card:    'background:#ffffff;border-radius:12px;max-width:600px;width:100%;margin:0 auto;overflow:hidden;',
  header:  'background:#2563EB;padding:28px 32px;',
  body_pad:'padding:32px;',
  footer:  'background:#F8FAFC;padding:20px 32px;border-top:1px solid #E4ECFC;',
  h1:      'margin:0;font-size:22px;font-weight:600;color:#ffffff;letter-spacing:-0.02em;',
  h2:      'margin:0 0 8px;font-size:20px;font-weight:600;color:#0F172A;letter-spacing:-0.02em;',
  p:       'margin:0 0 16px;font-size:15px;color:#0F172A;line-height:1.6;',
  muted:   'margin:0;font-size:13px;color:#64748B;line-height:1.6;',
  btn:     'display:inline-block;background:#D97706;color:#FFFFFF;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;',
  dayLabel:'font-size:11px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.06em;padding:16px 0 8px;border-top:1px solid #F8FAFC;margin-top:8px;',
  eventRow:'padding:10px 0;border-bottom:1px solid #F1F5FD;',
  eventTitle:'margin:0 0 3px;font-size:15px;font-weight:500;color:#0F172A;',
  eventMeta:'margin:0;font-size:13px;color:#64748B;',
  logoText:'font-size:16px;font-weight:600;color:#ffffff;letter-spacing:-0.02em;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
};

function layout(content, preheader = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>SportsCal</title>
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>` : ''}
</head>
<body style="${styles.body}">
  <table width="100%" cellpadding="0" cellspacing="0" style="${styles.wrapper}">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="${styles.card}">
        <!-- Header -->
        <tr><td style="${styles.header}">
          <table cellpadding="0" cellspacing="0" border="0" role="presentation">
            <tr>
              <td style="padding-right:10px;vertical-align:middle;">
                <a href="${BASE_URL}" style="display:inline-block;text-decoration:none;">
                  <img src="${BASE_URL}/favicon-192.png" alt="SportsCal" width="28" height="28"
                       style="display:block;border:0;border-radius:6px;" />
                </a>
              </td>
              <td style="vertical-align:middle;">
                <a href="${BASE_URL}" style="${styles.logoText}">SportsCal</a>
              </td>
            </tr>
          </table>
        </td></tr>
        <!-- Content -->
        <tr><td style="${styles.body_pad}">
          ${content}
        </td></tr>
        <!-- Footer -->
        <tr><td style="${styles.footer}">
          <p style="${styles.muted}">
            SportsCal · <a href="${BASE_URL}/settings" style="color:#64748B;">manage preferences</a>
            &nbsp;·&nbsp; <a href="${BASE_URL}/settings" style="color:#64748B;">unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ============================================================
// Welcome email
//
// Structure:
//   1. Warm greeting.
//   2. Primary CTA card — "Add your first calendar" — the one
//      action that unlocks every downstream feature. Two links:
//      the app's setup agent (for people who want to do it right
//      now) and the walkthrough (for people who want to read first).
//   3. Six feature cards linking to /how walkthroughs. Chosen for
//      breadth ("oh, it also does that?") and growth-loop leverage
//      (co-parent invite is one of the six, deliberately).
//   4. "See all 12 walkthroughs →" for the completionists.
//   5. Founder signoff — reinforces the parent-to-parent voice.
// ============================================================
export function welcomeEmail(user) {
  const firstName = user.name.split(' ')[0];

  // Feature card cell — kept as a helper because emails render this
  // pattern in a table, not with CSS grid, so the markup is verbose.
  // Passing linkStyles for the outer <a> keeps the tap-target as the
  // entire card in clients that respect display:block on anchors.
  const cardCell = (href, emoji, title, sub) => `
    <a href="${href}" style="display:block;padding:14px;border:1px solid #E4ECFC;border-radius:10px;text-decoration:none;background:#FFFFFF;">
      <span style="font-size:22px;line-height:1;">${emoji}</span>
      <p style="margin:8px 0 4px;font-size:14px;font-weight:600;color:#0F172A;">${title}</p>
      <p style="margin:0;font-size:12.5px;color:#64748B;line-height:1.5;">${sub}</p>
    </a>`;

  const content = `
    <h2 style="${styles.h2}">Welcome to SportsCal, ${firstName}!</h2>
    <p style="${styles.p}">
      You're in. SportsCal pulls every kid's practices, games, and school events
      from every team app into one family calendar the whole household sees.
      Here's the fastest way to feel that.
    </p>

    <!-- Primary CTA card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 28px;">
      <tr><td style="background:#EFF6FF;border:1px solid #DBEAFE;border-radius:10px;padding:20px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#2563EB;text-transform:uppercase;letter-spacing:0.08em;">Start here</p>
        <p style="margin:0 0 8px;font-size:17px;font-weight:600;color:#0F172A;letter-spacing:-0.01em;">Add your first calendar</p>
        <p style="margin:0 0 16px;font-size:14px;color:#64748B;line-height:1.55;">
          Paste an iCal URL from TeamSnap, GameChanger, PlayMetrics, or a dozen more sports apps.
          Events land on your dashboard in seconds.
        </p>
        <p style="margin:0;">
          <a href="${BASE_URL}/setup" style="${styles.btn}">Add a calendar →</a>
          &nbsp;&nbsp;<a href="${BASE_URL}/how/add-calendar" style="font-size:13px;color:#2563EB;text-decoration:none;font-weight:600;">See the walkthrough</a>
        </p>
      </td></tr>
    </table>

    <p style="${styles.p};margin-bottom:12px;">
      Once you have a calendar or two connected, here's what SportsCal does next:
    </p>

    <!-- Feature grid: 2-col, 3-row -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td width="50%" style="padding:6px 6px 6px 0;vertical-align:top;">
          ${cardCell(`${BASE_URL}/how/share-kid-calendar`, '📤', "Share a kid's calendar",
            "Each kid gets their own subscribable URL for their phone.")}
        </td>
        <td width="50%" style="padding:6px 0 6px 6px;vertical-align:top;">
          ${cardCell(`${BASE_URL}/how/add-a-head-of-household`, '🏠', 'Add a co-parent',
            "Both parents see the same kids, calendars, and events.")}
        </td>
      </tr>
      <tr>
        <td width="50%" style="padding:6px 6px 6px 0;vertical-align:top;">
          ${cardCell(`${BASE_URL}/how/route-to-kid`, '🎯', 'Route events to the right kid',
            "When one team feed covers multiple ages, sort them.")}
        </td>
        <td width="50%" style="padding:6px 0 6px 6px;vertical-align:top;">
          ${cardCell(`${BASE_URL}/rides/group`, '👥', 'Ask a group for a ride',
            "One iMessage to a whole team of parents. First yes wins.")}
        </td>
      </tr>
      <tr>
        <td width="50%" style="padding:6px 6px 6px 0;vertical-align:top;">
          ${cardCell(`${BASE_URL}/how/weekly-digest`, '✉️', 'Weekly digest email',
            "Every event for the whole family, every Friday morning.")}
        </td>
        <td width="50%" style="padding:6px 0 6px 6px;vertical-align:top;">
          ${cardCell(`${BASE_URL}/how/bedtime-reminder`, '🌙', 'Bedtime reminder',
            "8pm push notification with tomorrow's events.")}
        </td>
      </tr>
    </table>

    <p style="text-align:center;margin:0 0 24px;">
      <a href="${BASE_URL}/how" style="font-size:14px;color:#2563EB;text-decoration:none;font-weight:600;">
        See all 12 walkthroughs →
      </a>
    </p>

    <p style="${styles.muted}">
      Built by a parent of four who was tired of missing pickups.
      Questions or a feature you wish existed? Reply — I read every email.
    </p>
  `;

  return {
    subject: `Welcome to SportsCal, ${firstName}!`,
    html: layout(content, "All your kids' sports schedules in one place — let's get started."),
    text: [
      `Welcome to SportsCal, ${firstName}!`,
      '',
      "Start here: add your first calendar.",
      `  ${BASE_URL}/setup`,
      `  Walkthrough: ${BASE_URL}/how/add-calendar`,
      '',
      "Once your calendars are in, SportsCal can also:",
      `  * Share a kid's calendar     ${BASE_URL}/how/share-kid-calendar`,
      `  * Add a co-parent            ${BASE_URL}/how/add-a-head-of-household`,
      `  * Route events to the right kid   ${BASE_URL}/how/route-to-kid`,
      `  * Ask a group for a ride     ${BASE_URL}/rides/group`,
      `  * Weekly digest email        ${BASE_URL}/how/weekly-digest`,
      `  * Bedtime reminder           ${BASE_URL}/how/bedtime-reminder`,
      '',
      `See all 12 walkthroughs: ${BASE_URL}/how`,
      '',
      "Questions? Reply to this email — I read every one.",
    ].join('\n'),
  };
}

// ============================================================
// Email verification email
//
// Sent right after signup and on demand from the in-app "resend
// verification" banner. Kept focused: the verify button is the
// only action that should compete for attention. A small "what
// comes next" line appears BELOW the button — deliberately light
// so the transactional intent stays clear, but present enough to
// route new users into the /how guides once they land back in
// the app.
// ============================================================
export function verifyEmail(user, verifyUrl) {
  const firstName = (user.name || 'there').split(' ')[0];

  const content = `
    <h2 style="${styles.h2}">Confirm your SportsCal email</h2>
    <p style="${styles.p}">
      Hi ${escapeHtml(firstName)}, thanks for joining. Tap below to confirm your email —
      takes 2 seconds and unlocks push notifications, the weekly digest, and calendar sharing.
    </p>

    <p style="text-align:center;margin:24px 0 12px;">
      <a href="${verifyUrl}" style="display:inline-block;background:#D97706;color:#ffffff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;text-decoration:none;">
        Verify my email
      </a>
    </p>

    <p style="text-align:center;font-size:12px;color:#94A3B8;margin:0 0 28px;line-height:1.55;">
      Or copy this link:<br>
      <span style="word-break:break-all;">${verifyUrl}</span>
    </p>

    <div style="margin-top:8px;padding-top:20px;border-top:1px solid #F1F5FD;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#0F172A;">Once you're back inside</p>
      <p style="margin:0;font-size:13.5px;color:#64748B;line-height:1.6;">
        Every SportsCal feature has a short walkthrough at
        <a href="${BASE_URL}/how" style="color:#2563EB;text-decoration:none;font-weight:600;">sportscalapp.com/how</a>.
        Start with
        <a href="${BASE_URL}/how/add-calendar" style="color:#2563EB;text-decoration:none;">adding a calendar</a>,
        then try
        <a href="${BASE_URL}/how/add-a-head-of-household" style="color:#2563EB;text-decoration:none;">adding a co-parent</a>
        or
        <a href="${BASE_URL}/rides/group" style="color:#2563EB;text-decoration:none;">asking for a ride</a> —
        90 seconds each.
      </p>
    </div>

    <p style="${styles.muted};margin-top:24px;">
      If you didn't create a SportsCal account, you can safely ignore this email.
    </p>
  `;

  return {
    subject: 'Verify your SportsCal email',
    html: layout(content, "Confirm your email to unlock push, digests, and calendar sharing."),
    text: [
      `Hi ${firstName},`,
      '',
      "Thanks for joining SportsCal. Confirm your email so we can send you push,",
      "the weekly digest, and calendar sharing:",
      '',
      `  ${verifyUrl}`,
      '',
      "Once you're back inside, every SportsCal feature has a short walkthrough:",
      `  ${BASE_URL}/how`,
      '',
      "Start with add-a-calendar, then try add-a-co-parent or ask-a-group-for-a-ride.",
      '',
      "If you didn't create a SportsCal account, you can safely ignore this email.",
    ].join('\n'),
  };
}

// ============================================================
// Weekly digest email
// ============================================================
export function digestEmail(user, events) {
  const tz        = user.timezone || DEFAULT_TZ;
  const grouped   = groupByDay(events, tz);
  const total     = events.length;
  const dateRange = formatDateRange(tz);

  const dayRows = Object.entries(grouped).map(([day, dayEvents]) => `
    <p style="${styles.dayLabel}">${day}</p>
    ${dayEvents.map(e => `
      <div style="${styles.eventRow}">
        <p style="${styles.eventTitle}">${escapeHtml(e.display_title)}</p>
        <p style="${styles.eventMeta}">
          ${e.all_day ? 'All day' : formatTime(new Date(e.starts_at), tz)}
          ${e.ends_at && !e.all_day ? ` – ${formatTime(new Date(e.ends_at), tz)}` : ''}
          ${e.location ? ` &nbsp;·&nbsp; 📍 ${escapeHtml(e.location)}` : ''}
        </p>
      </div>
    `).join('')}
  `).join('');

  const content = `
    <h2 style="${styles.h2}">Your week in sports ⚽</h2>
    <p style="${styles.p}">${dateRange} &nbsp;·&nbsp; ${total} event${total !== 1 ? 's' : ''} coming up</p>

    ${dayRows}

    <div style="margin-top:24px;padding:16px;background:#F8FAFC;border-radius:8px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:500;color:#0F172A;">Your calendar feed</p>
      <p style="margin:0 0 12px;font-size:12px;color:#64748B;font-family:monospace;word-break:break-all;">
        ${BASE_URL}/feed/${user.feed_token}.ics
      </p>
      <a href="${BASE_URL}" style="font-size:13px;color:#2563EB;text-decoration:none;">Open dashboard →</a>
    </div>
  `;

  return {
    subject: `Your week in sports — ${dateRange}`,
    html: layout(content, `${total} event${total !== 1 ? 's' : ''} coming up for your family this week.`),
    text: buildDigestText(user, events),
  };
}

// ============================================================
// Reminder email
// ============================================================
export function reminderEmail(user, event) {
  const tz         = user.timezone || DEFAULT_TZ;
  const startsAt   = new Date(event.starts_at);
  const hoursUntil = Math.round((startsAt - Date.now()) / 3_600_000);

  const content = `
    <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#D97706;text-transform:uppercase;letter-spacing:0.06em;">
      Reminder · in ~${hoursUntil} hour${hoursUntil !== 1 ? 's' : ''}
    </p>
    <h2 style="${styles.h2};margin-bottom:20px;">${escapeHtml(event.display_title)}</h2>

    <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="font-size:14px;color:#64748B;padding:6px 16px 6px 0;white-space:nowrap;">When</td>
        <td style="font-size:14px;color:#0F172A;font-weight:500;padding:6px 0;">
          ${formatFullDateTime(startsAt, tz)}
          ${event.ends_at ? ` – ${formatTime(new Date(event.ends_at), tz)}` : ''}
        </td>
      </tr>
      ${event.location ? `
      <tr>
        <td style="font-size:14px;color:#64748B;padding:6px 16px 6px 0;white-space:nowrap;">Where</td>
        <td style="font-size:14px;color:#0F172A;font-weight:500;padding:6px 0;">
          <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.location)}"
             style="color:#2563EB;text-decoration:none;">
            ${escapeHtml(event.location)} ↗
          </a>
        </td>
      </tr>` : ''}
    </table>

    <p style="text-align:center;">
      <a href="${BASE_URL}" style="${styles.btn}">Open dashboard</a>
    </p>
  `;

  return {
    subject: `Reminder: ${event.display_title} in ~${hoursUntil}h`,
    html: layout(content, `${event.display_title} is coming up in about ${hoursUntil} hours.`),
    text: `Reminder: ${event.display_title}\nWhen: ${formatFullDateTime(startsAt, tz)}\n${event.location ? `Where: ${event.location}` : ''}`,
  };
}

// ============================================================
// Household invite email
// Sent when a parent invites their co-parent to join their
// SportsCal household. The magic link lands on
// /household/join?token=… where the recipient signs in (or
// creates an account) and joins.
// ============================================================
export function householdInviteEmail({ inviterName, householdName, token, expiresAt }) {
  const firstName = inviterName ? inviterName.split(' ')[0] : 'Someone';
  const joinUrl   = `${BASE_URL}/household/join?token=${token}`;

  const content = `
    <h2 style="${styles.h2}">${escapeHtml(firstName)} invited you to their SportsCal family</h2>
    <p style="${styles.p}">
      SportsCal keeps every kid's practices, games, and school events in one place.
      Accept this invite and you'll both see the same family calendar — pickups,
      dropoffs, and all.
    </p>

    <p style="text-align:center;margin:28px 0 8px;">
      <a href="${joinUrl}" style="${styles.btn}">Accept invite →</a>
    </p>
    <p style="text-align:center;margin:0 0 24px;">
      <span style="font-size:13px;color:#64748B;">
        Expires ${new Date(expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </span>
    </p>

    <div style="margin-top:8px;padding:16px;background:#F8FAFC;border-radius:8px;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:500;color:#0F172A;">
        What happens when you accept
      </p>
      <p style="${styles.muted}">
        You and ${escapeHtml(firstName)} will share the same view of your family's
        calendar. Anything you add — a kid, a team feed, a manual event — the
        other sees too. Your existing account and any calendars you've already
        connected come with you.
      </p>
    </div>

    <p style="${styles.muted};margin-top:20px;">
      If you weren't expecting this, you can ignore this email — nothing changes
      until you click accept.
    </p>
  `;

  return {
    subject: `${firstName} invited you to their SportsCal family`,
    html: layout(content, `${firstName} wants to share their family calendar with you.`),
    text: [
      `${firstName} invited you to their SportsCal family.`,
      '',
      `Accept the invite: ${joinUrl}`,
      '',
      `Expires ${new Date(expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`,
      '',
      'What happens when you accept: you and ' + firstName + ' share the same family calendar.',
      "Your existing account and calendars come with you.",
      '',
      "If you weren't expecting this, ignore this email.",
    ].join('\n'),
  };
}

// ============================================================
// Helpers
// ============================================================
function groupByDay(events, timezone = DEFAULT_TZ) {
  const groups = {};
  for (const e of events) {
    const day = formatDay(new Date(e.starts_at), timezone, e.all_day);
    if (!groups[day]) groups[day] = [];
    groups[day].push(e);
  }
  return groups;
}

function formatDay(date, timezone, allDay = false) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    timeZone: allDay ? 'UTC' : timezone,
  });
}

function formatTime(date, timezone = DEFAULT_TZ) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: timezone,
  });
}

function formatFullDateTime(date, timezone = DEFAULT_TZ) {
  return date.toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: timezone,
  });
}

function formatDateRange(timezone = DEFAULT_TZ) {
  const s = new Date(), e = new Date();
  e.setDate(e.getDate() + 6);
  const o = { month: 'short', day: 'numeric', timeZone: timezone };
  return `${s.toLocaleDateString('en-US', o)} – ${e.toLocaleDateString('en-US', o)}`;
}

function buildDigestText(user, events) {
  const tz = user.timezone || DEFAULT_TZ;
  const lines = [`YOUR WEEK IN SPORTS — ${formatDateRange(tz)}`, ''];
  for (const e of events) {
    const time = e.all_day ? 'All day' : formatTime(new Date(e.starts_at), tz);
    lines.push(`${time} — ${e.display_title}`);
    if (e.location) lines.push(`  📍 ${e.location}`);
  }
  lines.push('', `Open dashboard: ${process.env.FRONTEND_URL}`);
  return lines.join('\n');
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
