// ============================================================
// SportsCal Email Templates
// Clean, mobile-friendly HTML emails
// ============================================================

const BASE_URL = process.env.FRONTEND_URL || 'https://sportscalapp.com';
const DEFAULT_TZ = 'America/Los_Angeles';

const styles = {
  body:    'margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
  wrapper: 'background:#f4f6fa;padding:40px 16px;',
  card:    'background:#ffffff;border-radius:12px;max-width:600px;width:100%;margin:0 auto;overflow:hidden;',
  header:  'background:#0f1629;padding:28px 32px;',
  body_pad:'padding:32px;',
  footer:  'background:#f4f6fa;padding:20px 32px;border-top:1px solid #e8ecf4;',
  h1:      'margin:0;font-size:22px;font-weight:600;color:#ffffff;letter-spacing:-0.02em;',
  h2:      'margin:0 0 8px;font-size:20px;font-weight:600;color:#0f1629;letter-spacing:-0.02em;',
  p:       'margin:0 0 16px;font-size:15px;color:#3d3d3a;line-height:1.6;',
  muted:   'margin:0;font-size:13px;color:#8896b0;line-height:1.6;',
  btn:     'display:inline-block;background:#00d68f;color:#0f1629;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;',
  dayLabel:'font-size:11px;font-weight:600;color:#8896b0;text-transform:uppercase;letter-spacing:0.06em;padding:16px 0 8px;border-top:1px solid #f4f6fa;margin-top:8px;',
  eventRow:'padding:10px 0;border-bottom:1px solid #f9fafb;',
  eventTitle:'margin:0 0 3px;font-size:15px;font-weight:500;color:#0f1629;',
  eventMeta:'margin:0;font-size:13px;color:#8896b0;',
  logo:    'display:inline-flex;align-items:center;gap:8px;text-decoration:none;',
  logoMark:'display:inline-block;width:28px;height:28px;background:#00d68f;border-radius:6px;',
  logoText:'font-size:16px;font-weight:600;color:#ffffff;letter-spacing:-0.02em;',
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
          <a href="${BASE_URL}" style="${styles.logo}">
            <span style="${styles.logoMark}"></span>
            <span style="${styles.logoText}">SportsCal</span>
          </a>
        </td></tr>
        <!-- Content -->
        <tr><td style="${styles.body_pad}">
          ${content}
        </td></tr>
        <!-- Footer -->
        <tr><td style="${styles.footer}">
          <p style="${styles.muted}">
            SportsCal · <a href="${BASE_URL}/settings" style="color:#8896b0;">manage preferences</a>
            &nbsp;·&nbsp; <a href="${BASE_URL}/settings" style="color:#8896b0;">unsubscribe</a>
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
// ============================================================
export function welcomeEmail(user) {
  const content = `
    <h2 style="${styles.h2}">Welcome to SportsCal, ${user.name.split(' ')[0]}! 🎉</h2>
    <p style="${styles.p}">
      You're all set to pull all your kids' sports schedules into one place.
      Here's how to get started in 3 steps:
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f4f6fa;">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:32px;height:32px;background:#e6fdf5;border-radius:50%;text-align:center;vertical-align:middle;font-size:14px;font-weight:600;color:#00b377;">1</td>
              <td style="padding-left:12px;">
                <p style="margin:0;font-size:14px;font-weight:500;color:#0f1629;">Add your family members</p>
                <p style="margin:0;font-size:13px;color:#8896b0;">Give each kid a name and color</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f4f6fa;">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:32px;height:32px;background:#e6fdf5;border-radius:50%;text-align:center;vertical-align:middle;font-size:14px;font-weight:600;color:#00b377;">2</td>
              <td style="padding-left:12px;">
                <p style="margin:0;font-size:14px;font-weight:500;color:#0f1629;">Connect your sports apps</p>
                <p style="margin:0;font-size:13px;color:#8896b0;">Paste iCal links from TeamSnap, GameChanger, PlayMetrics & more</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0;">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:32px;height:32px;background:#e6fdf5;border-radius:50%;text-align:center;vertical-align:middle;font-size:14px;font-weight:600;color:#00b377;">3</td>
              <td style="padding-left:12px;">
                <p style="margin:0;font-size:14px;font-weight:500;color:#0f1629;">Subscribe your calendar feed</p>
                <p style="margin:0;font-size:13px;color:#8896b0;">One URL works in Apple Calendar, Google Calendar & Outlook</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="text-align:center;margin:0 0 8px;">
      <a href="${BASE_URL}" style="${styles.btn}">Get started →</a>
    </p>
    <p style="text-align:center;margin:0;">
      <span style="font-size:13px;color:#8896b0;">Takes about 5 minutes to set up</span>
    </p>
  `;

  return {
    subject: `Welcome to SportsCal, ${user.name.split(' ')[0]}!`,
    html: layout(content, 'All your kids\' sports schedules in one place — let\'s get started.'),
    text: `Welcome to SportsCal, ${user.name.split(' ')[0]}!\n\nGet started at ${BASE_URL}\n\n1. Add your family members\n2. Connect your sports apps\n3. Subscribe your calendar feed`,
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

    <div style="margin-top:24px;padding:16px;background:#f4f6fa;border-radius:8px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:500;color:#0f1629;">Your calendar feed</p>
      <p style="margin:0 0 12px;font-size:12px;color:#8896b0;font-family:monospace;word-break:break-all;">
        ${BASE_URL}/feed/${user.feed_token}.ics
      </p>
      <a href="${BASE_URL}" style="font-size:13px;color:#00b377;text-decoration:none;">Open dashboard →</a>
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
    <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#00b377;text-transform:uppercase;letter-spacing:0.06em;">
      Reminder · in ~${hoursUntil} hour${hoursUntil !== 1 ? 's' : ''}
    </p>
    <h2 style="${styles.h2};margin-bottom:20px;">${escapeHtml(event.display_title)}</h2>

    <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="font-size:14px;color:#8896b0;padding:6px 16px 6px 0;white-space:nowrap;">When</td>
        <td style="font-size:14px;color:#0f1629;font-weight:500;padding:6px 0;">
          ${formatFullDateTime(startsAt, tz)}
          ${event.ends_at ? ` – ${formatTime(new Date(event.ends_at), tz)}` : ''}
        </td>
      </tr>
      ${event.location ? `
      <tr>
        <td style="font-size:14px;color:#8896b0;padding:6px 16px 6px 0;white-space:nowrap;">Where</td>
        <td style="font-size:14px;color:#0f1629;font-weight:500;padding:6px 0;">
          <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.location)}"
             style="color:#00b377;text-decoration:none;">
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
