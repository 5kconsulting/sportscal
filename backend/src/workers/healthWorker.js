import { Resend } from 'resend';
import { query } from '../db/index.js';

const resend  = new Resend(process.env.RESEND_API_KEY);
const FROM    = `${process.env.EMAIL_FROM_NAME || 'SportsCal'} <${process.env.EMAIL_FROM || 'noreply@mail.sportscalapp.com'}>`;
const APP_URL = process.env.FRONTEND_URL || 'https://www.sportscalapp.com';

// ============================================================
// checkSourceHealth
// Called once daily by the scheduler.
// Finds users with sources that have been failing for 24+ hours
// and haven't been alerted in the last 3 days.
// ============================================================
export async function checkSourceHealth() {
  console.log('[health] checking source health...');

  try {
    // Find all broken sources grouped by user
    const rows = await query(`
      SELECT
        s.id AS source_id,
        s.name AS source_name,
        s.app,
        s.last_fetch_error,
        s.last_fetched_at,
        s.last_error_alert_at,
        u.id AS user_id,
        u.email,
        u.name AS user_name,
        u.timezone
      FROM sources s
      JOIN users u ON u.id = s.user_id
      WHERE s.last_fetch_status = 'error'
        AND s.enabled = true
        AND s.name != '__manual__'
        AND s.last_fetched_at < NOW() - INTERVAL '24 hours'
        AND (s.last_error_alert_at IS NULL OR s.last_error_alert_at < NOW() - INTERVAL '3 days')
      ORDER BY u.id, s.name
    `);

    if (rows.length === 0) {
      console.log('[health] all sources healthy');
      return;
    }

    // Group by user
    const byUser = {};
    for (const row of rows) {
      if (!byUser[row.user_id]) {
        byUser[row.user_id] = {
          email: row.email,
          name: row.user_name,
          sources: [],
        };
      }
      byUser[row.user_id].sources.push({
        id: row.source_id,
        name: row.source_name,
        app: row.app,
        error: row.last_fetch_error,
        last_fetched_at: row.last_fetched_at,
      });
    }

    // Send one email per user
    for (const [userId, data] of Object.entries(byUser)) {
      try {
        await resend.emails.send({
          from: FROM,
          to:   data.email,
          subject: `Action needed: ${data.sources.length === 1 ? '1 calendar source' : `${data.sources.length} calendar sources`} need attention`,
          html: buildAlertEmail(data.name, data.sources),
          text: buildAlertText(data.name, data.sources),
        });

        // Mark all their broken sources as alerted
        const sourceIds = data.sources.map(s => s.id);
        await query(
          `UPDATE sources SET last_error_alert_at = NOW() WHERE id = ANY($1)`,
          [sourceIds]
        );

        console.log(`[health] alerted ${data.email} about ${data.sources.length} broken source(s)`);
      } catch (err) {
        console.error(`[health] failed to alert ${data.email}:`, err.message);
      }
    }

    console.log(`[health] done — alerted ${Object.keys(byUser).length} user(s)`);
  } catch (err) {
    console.error('[health] check error:', err.message);
  }
}

function buildAlertEmail(name, sources) {
  const sourceRows = sources.map(s => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f4f6fa;">
        <div style="font-size:14px;font-weight:500;color:#0f1629;">${s.name}</div>
        <div style="font-size:12px;color:#8896b0;margin-top:2px;text-transform:capitalize;">${s.app}</div>
        ${s.error ? `<div style="font-size:12px;color:#ef4444;margin-top:4px;font-family:monospace;">${s.error}</div>` : ''}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f4f6fa;font-size:12px;color:#8896b0;white-space:nowrap;">
        ${s.last_fetched_at ? `Last tried ${timeAgo(new Date(s.last_fetched_at))}` : 'Never synced'}
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#fff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#0f1629;padding:24px 32px;">
          <span style="font-size:16px;font-weight:600;color:#fff;letter-spacing:-0.02em;">SportsCal</span>
        </td></tr>
        <tr><td style="padding:32px 32px 24px;">
          <p style="margin:0 0 8px;font-size:22px;font-weight:600;color:#0f1629;letter-spacing:-0.02em;">
            ${sources.length === 1 ? 'A calendar source needs attention' : `${sources.length} calendar sources need attention`}
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#8896b0;line-height:1.6;">
            Hi ${name}, the following ${sources.length === 1 ? 'source has' : 'sources have'} stopped syncing. 
            Your calendar may be missing events until this is fixed.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8ecf4;border-radius:8px;overflow:hidden;margin-bottom:28px;">
            <thead>
              <tr style="background:#f4f6fa;">
                <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#8896b0;text-transform:uppercase;letter-spacing:0.05em;">Source</th>
                <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#8896b0;text-transform:uppercase;letter-spacing:0.05em;">Status</th>
              </tr>
            </thead>
            <tbody>${sourceRows}</tbody>
          </table>

          <p style="text-align:center;margin:0 0 24px;">
            <a href="${APP_URL}/sources"
               style="display:inline-block;background:#00b377;color:#ffffff !important;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;text-decoration:none;border:2px solid #00b377;">
              Fix my sources
            </a>
          </p>

          <p style="margin:0;font-size:13px;color:#8896b0;line-height:1.6;">
            Common fixes: the iCal URL may have expired (get a new one from your sports app), 
            or the app may have changed how they share calendars.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #f4f6fa;">
          <p style="margin:0;font-size:12px;color:#b8c4d8;text-align:center;">SportsCal · <a href="${APP_URL}/settings" style="color:#b8c4d8;">Manage notifications</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function buildAlertText(name, sources) {
  const sourceList = sources.map(s => `- ${s.name} (${s.app})${s.error ? `: ${s.error}` : ''}`).join('\n');
  return `Hi ${name},

The following calendar sources have stopped syncing and may be missing events:

${sourceList}

Fix your sources here: ${APP_URL}/sources

Common fixes: the iCal URL may have expired — get a new one from your sports app.

SportsCal`;
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
