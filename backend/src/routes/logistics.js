import { Router } from 'express';
import crypto from 'crypto';
import { Resend } from 'resend';
import { requireAuth } from '../middleware/auth.js';
import { query, queryOne } from '../db/index.js';

const router = Router();
const resend  = new Resend(process.env.RESEND_API_KEY);
const FROM    = `${process.env.EMAIL_FROM_NAME || 'SportsCal'} <${process.env.EMAIL_FROM || 'noreply@mail.sportscalapp.com'}>`;
const APP_URL = process.env.FRONTEND_URL || 'https://www.sportscalapp.com';

// ============================================================
// GET /api/logistics/:eventId
// Get logistics for an event
// ============================================================
router.get('/:eventId', requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT el.*, c.name AS contact_name, c.email AS contact_email, c.phone AS contact_phone
       FROM event_logistics el
       JOIN contacts c ON c.id = el.contact_id
       WHERE el.event_id = $1 AND el.user_id = $2`,
      [req.params.eventId, req.user.id]
    );
    res.json({ logistics: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/logistics/:eventId
// Assign or request a contact for dropoff/pickup
// ============================================================
router.post('/:eventId', requireAuth, async (req, res) => {
  try {
    const { contact_id, role, send_request, note } = req.body;

    if (!['dropoff', 'pickup'].includes(role)) {
      return res.status(422).json({ error: 'Role must be dropoff or pickup' });
    }

    // Get event details for the email
    const event = await queryOne(
      `SELECT e.*, u.name AS user_name, u.email AS user_email
       FROM events e
       JOIN users u ON u.id = e.user_id
       WHERE e.id = $1 AND e.user_id = $2`,
      [req.params.eventId, req.user.id]
    );
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const contact = await queryOne(
      `SELECT * FROM contacts WHERE id=$1 AND user_id=$2`,
      [contact_id, req.user.id]
    );
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const token = crypto.randomBytes(24).toString('hex');
    const status = send_request && contact.email ? 'requested' : 'assigned';

    // Upsert — replace existing assignment for this role
    const logistics = await queryOne(
      `INSERT INTO event_logistics (user_id, event_id, contact_id, role, status, token, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (event_id, role) DO UPDATE SET
         contact_id = EXCLUDED.contact_id,
         status     = EXCLUDED.status,
         token      = EXCLUDED.token,
         note       = EXCLUDED.note
       RETURNING *`,
      [req.user.id, req.params.eventId, contact_id, role, status, token, note || null]
    );

    // Send request email if requested
    if (status === 'requested' && contact.email) {
      const confirmUrl = `${APP_URL}/api/logistics/respond/${token}/confirmed`;
      const declineUrl = `${APP_URL}/api/logistics/respond/${token}/declined`;

      const eventDate = new Date(event.starts_at).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric'
      });
      const eventTime = new Date(event.starts_at).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles'
      });

      await resend.emails.send({
        from: FROM,
        to: contact.email,
        subject: `Can you ${role === 'pickup' ? 'pick up' : 'drop off'} ${event.display_title.split('—')[0].trim()} on ${eventDate}?`,
        html: buildRequestEmail({
          contact, event, role, eventDate, eventTime,
          confirmUrl, declineUrl, parentName: event.user_name, note,
        }),
        text: buildRequestText({
          contact, event, role, eventDate, eventTime,
          confirmUrl, declineUrl, parentName: event.user_name, note,
        }),
      }).catch(err => console.error('[logistics] email error:', err.message));
    }

    res.status(201).json({ logistics: { ...logistics, contact_name: contact.name, contact_email: contact.email } });
  } catch (err) {
    console.error('[logistics] post error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DELETE /api/logistics/:eventId/:role
// Remove a logistics assignment
// ============================================================
router.delete('/:eventId/:role', requireAuth, async (req, res) => {
  try {
    await query(
      `DELETE FROM event_logistics WHERE event_id=$1 AND role=$2 AND user_id=$3`,
      [req.params.eventId, req.params.role, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/logistics/respond/:token/:action
// Public — no auth. Contact confirms or declines via email link.
// ============================================================
router.get('/respond/:token/:action', async (req, res) => {
  try {
    const { token, action } = req.params;
    if (!['confirmed', 'declined'].includes(action)) {
      return res.redirect(`${APP_URL}/?error=invalid`);
    }

    const logistics = await queryOne(
      `SELECT el.*, c.name AS contact_name, e.display_title, e.starts_at, e.location,
              u.email AS parent_email, u.name AS parent_name
       FROM event_logistics el
       JOIN contacts c ON c.id = el.contact_id
       JOIN events e ON e.id = el.event_id
       JOIN users u ON u.id = el.user_id
       WHERE el.token = $1`,
      [token]
    );

    if (!logistics) return res.redirect(`${APP_URL}/?error=invalid`);

    await query(
      `UPDATE event_logistics SET status=$1 WHERE token=$2`,
      [action, token]
    );

    // Notify parent
    const eventDate = new Date(logistics.starts_at).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
    });
    const eventTime = new Date(logistics.starts_at).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles'
    });

    if (logistics.parent_email) {
      await resend.emails.send({
        from: FROM,
        to: logistics.parent_email,
        subject: `${logistics.contact_name} has ${action === 'confirmed' ? 'confirmed' : 'declined'} the ${logistics.role} for ${eventDate}`,
        html: buildResponseEmail({ logistics, action, eventDate, eventTime }),
        text: `${logistics.contact_name} has ${action === 'confirmed' ? 'confirmed' : 'declined'} the ${logistics.role} for ${logistics.display_title} on ${eventDate} at ${eventTime}.`,
      }).catch(err => console.error('[logistics] notify error:', err.message));
    }

    // Redirect to a friendly confirmation page
    const msg = action === 'confirmed' ? 'confirmed' : 'declined';
    res.redirect(`${APP_URL}/logistics-response?status=${msg}&name=${encodeURIComponent(logistics.contact_name)}`);
  } catch (err) {
    console.error('[logistics] respond error:', err.message);
    res.redirect(`${APP_URL}/?error=server`);
  }
});

// ============================================================
// Email templates
// ============================================================
function buildRequestEmail({ contact, event, role, eventDate, eventTime, confirmUrl, declineUrl, parentName, note }) {
  const action = role === 'pickup' ? 'pick up' : 'drop off';
  const kidName = event.display_title.split('—')[0].replace(/,/g, ' &').trim();
  const eventName = event.display_title.split('—')[1]?.trim() || event.display_title;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#fff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#0f1629;padding:24px 32px;">
          <span style="font-size:16px;font-weight:600;color:#fff;">SportsCal</span>
        </td></tr>
        <tr><td style="padding:36px 32px;">
          <p style="margin:0 0 8px;font-size:22px;font-weight:600;color:#0f1629;letter-spacing:-0.02em;">
            Hi ${contact.name.split(' ')[0]} — can you help?
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#8896b0;line-height:1.6;">
            ${parentName} is asking if you can <strong style="color:#0f1629;">${action} ${kidName}</strong> from the following event:
          </p>

          <div style="background:#f4f6fa;border-radius:10px;padding:20px;margin-bottom:24px;border-left:4px solid #00d68f;">
            <p style="margin:0 0 6px;font-size:16px;font-weight:600;color:#0f1629;">${eventName}</p>
            <p style="margin:0 0 4px;font-size:14px;color:#8896b0;">📅 ${eventDate} at ${eventTime}</p>
            ${event.location ? `<p style="margin:0;font-size:14px;color:#8896b0;">📍 ${event.location}</p>` : ''}
            ${note ? `<p style="margin:8px 0 0;font-size:13px;color:#0f1629;font-style:italic;">"${note}"</p>` : ''}
          </div>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              <td style="padding-right:8px;">
                <a href="${confirmUrl}" style="display:block;background:#00b377;color:#fff;font-weight:700;font-size:15px;padding:14px;border-radius:8px;text-decoration:none;text-align:center;">
                  ✓ Yes, I can ${action}
                </a>
              </td>
              <td style="padding-left:8px;">
                <a href="${declineUrl}" style="display:block;background:#f4f6fa;color:#8896b0;font-weight:600;font-size:15px;padding:14px;border-radius:8px;text-decoration:none;text-align:center;border:1px solid #e8ecf4;">
                  Sorry, I can't
                </a>
              </td>
            </tr>
          </table>

          <p style="margin:0;font-size:13px;color:#b8c4d8;line-height:1.6;">
            ${parentName} will be notified of your response. No account needed — just click above.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #f4f6fa;">
          <p style="margin:0;font-size:12px;color:#b8c4d8;text-align:center;">Sent via SportsCal · <a href="${APP_URL}" style="color:#b8c4d8;">sportscalapp.com</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function buildRequestText({ contact, event, role, eventDate, eventTime, confirmUrl, declineUrl, parentName, note }) {
  const action = role === 'pickup' ? 'pick up' : 'drop off';
  const kidName = event.display_title.split('—')[0].trim();
  const eventName = event.display_title.split('—')[1]?.trim() || event.display_title;
  return `Hi ${contact.name.split(' ')[0]},

${parentName} is asking if you can ${action} ${kidName} from:

${eventName}
${eventDate} at ${eventTime}${event.location ? `\n${event.location}` : ''}${note ? `\n\n"${note}"` : ''}

✓ Yes, I can ${action}: ${confirmUrl}
Sorry, I can't: ${declineUrl}

No account needed — just click a link above.

SportsCal`;
}

function buildResponseEmail({ logistics, action, eventDate, eventTime }) {
  const confirmed = action === 'confirmed';
  const eventName = logistics.display_title.split('—')[1]?.trim() || logistics.display_title;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#fff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#0f1629;padding:24px 32px;">
          <span style="font-size:16px;font-weight:600;color:#fff;">SportsCal</span>
        </td></tr>
        <tr><td style="padding:36px 32px;">
          <p style="margin:0 0 16px;font-size:22px;font-weight:600;color:#0f1629;">
            ${confirmed ? '✅' : '❌'} ${logistics.contact_name} has ${confirmed ? 'confirmed' : 'declined'}
          </p>
          <p style="margin:0 0 20px;font-size:15px;color:#8896b0;line-height:1.6;">
            <strong style="color:#0f1629;">${logistics.contact_name}</strong> has 
            ${confirmed ? 'confirmed' : 'declined'} the 
            <strong style="color:#0f1629;">${logistics.role}</strong> for:
          </p>
          <div style="background:#f4f6fa;border-radius:10px;padding:20px;border-left:4px solid ${confirmed ? '#00d68f' : '#ef4444'};">
            <p style="margin:0 0 6px;font-size:16px;font-weight:600;color:#0f1629;">${eventName}</p>
            <p style="margin:0 0 4px;font-size:14px;color:#8896b0;">📅 ${eventDate} at ${eventTime}</p>
            ${logistics.location ? `<p style="margin:0;font-size:14px;color:#8896b0;">📍 ${logistics.location}</p>` : ''}
          </div>
          ${!confirmed ? '<p style="margin:20px 0 0;font-size:14px;color:#8896b0;">You may want to arrange an alternative.</p>' : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export default router;
