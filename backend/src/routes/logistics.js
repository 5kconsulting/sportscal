import { Router } from 'express';
import crypto from 'crypto';
import { Resend } from 'resend';
import { requireAuth } from '../middleware/auth.js';
import { query, queryOne, withTransaction } from '../db/index.js';

const router = Router();
const resend  = new Resend(process.env.RESEND_API_KEY);
const FROM    = `${process.env.EMAIL_FROM_NAME || 'SportsCal'} <${process.env.EMAIL_FROM || 'noreply@mail.sportscalapp.com'}>`;
const APP_URL = process.env.FRONTEND_URL || 'https://www.sportscalapp.com';

// ============================================================
// GET /api/logistics
// Bulk: every logistics row for the current user (Dashboard uses
// this to render pickup/dropoff inline on each event card without
// needing to open the modal first).
// ============================================================
router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT el.*, c.name AS contact_name, c.email AS contact_email, c.phone AS contact_phone
       FROM event_logistics el
       JOIN contacts c ON c.id = el.contact_id
       WHERE el.user_id = $1`,
      [req.user.id]
    );
    res.json({ logistics: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/logistics/:eventId
// Get logistics for a single event
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
    const notify = req.body.notify || 'none';
    const user_plan = (await queryOne(`SELECT plan FROM users WHERE id = $1`, [req.user.id]))?.plan;
    const isPremium = user_plan === 'premium';

    // Notifications (email/SMS) are premium only.
    const wantsEmail = (notify === 'email' || notify === 'both');
    const wantsSms   = (notify === 'sms'   || notify === 'both');

    // SMS additionally requires that the contact has actively opted in
    // by replying YES to the confirmation message (A2P 10DLC double
    // opt-in). Pending or declined contacts are silently skipped here;
    // the response includes sms_skipped_reason so the UI can prompt the
    // user to use the native Messages app instead.
    let smsSkippedReason = null;
    if (wantsSms) {
      if (!isPremium)                                  smsSkippedReason = 'not_premium';
      else if (!contact.phone)                         smsSkippedReason = 'no_phone';
      else if (contact.sms_consent_status === 'pending')  smsSkippedReason = 'consent_pending';
      else if (contact.sms_consent_status === 'declined') smsSkippedReason = 'consent_declined';
    }

    const sendEmail = isPremium && wantsEmail && contact.email;
    const sendSms   = isPremium && wantsSms   && contact.phone && contact.sms_consent_status === 'confirmed';
    const status = (sendEmail || sendSms) ? 'requested' : 'assigned';

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

    // Send email if requested
    if (sendEmail) {
      const confirmUrl = `${APP_URL}/api/logistics/respond/${token}/confirmed`;
      const declineUrl = `${APP_URL}/api/logistics/respond/${token}/declined`;

      const eventDate = new Date(event.starts_at).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles'
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

    // Send SMS if requested
    if (sendSms) {
      const eventDate = new Date(event.starts_at).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles'
      });
      const eventTime = new Date(event.starts_at).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles'
      });
      const action = role === 'pickup' ? 'pick up' : 'drop off';
      const kidName = event.display_title.split('—')[0].trim();
      const confirmUrl = `${APP_URL}/api/logistics/respond/${token}/confirmed`;
      const declineUrl = `${APP_URL}/api/logistics/respond/${token}/declined`;

      // A2P 10DLC requires every outbound marketing/transactional SMS to
      // include opt-out instructions and the rates disclosure. Append them
      // to every message so campaign compliance is never in question.
      const smsBody = `Hi ${contact.name.split(' ')[0]}! Can you ${action} ${kidName} on ${eventDate} at ${eventTime}${event.location ? ` at ${event.location}` : ''}?${note ? ` "${note}"` : ''}\n\nYes: ${confirmUrl}\nNo: ${declineUrl}\n\nReply STOP to opt out, HELP for help. Msg&data rates may apply.`;

      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        try {
          const twilio = (await import('twilio')).default;
          const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
          await client.messages.create({
            body: smsBody,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: contact.phone,
          });
          console.log(`[logistics] SMS sent to ${contact.phone}`);
        } catch (err) {
          console.error('[logistics] SMS error:', err.message);
        }
      } else {
        console.log('[logistics] SMS skipped — Twilio not configured. Message would be:', smsBody);
      }
    }

    res.status(201).json({
      logistics: { ...logistics, contact_name: contact.name, contact_email: contact.email },
      sms_skipped_reason: smsSkippedReason,
    });
  } catch (err) {
    console.error('[logistics] post error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/logistics/:eventId/team-request
//
// Create a "first parent to confirm wins" ride request directed at
// every member of a team. We don't send the SMS server-side — we
// return the per-parent links + assembled body so the parent's
// own iMessage app sends the group text from their own phone
// number (no Twilio, no A2P regime, no per-message fee).
//
// Body: { team_id, role }
// Response: { offers, sms_body, phones }
// ============================================================
router.post('/:eventId/team-request', requireAuth, async (req, res) => {
  try {
    const { team_id, role } = req.body;
    if (!['dropoff', 'pickup'].includes(role)) {
      return res.status(422).json({ error: 'Role must be dropoff or pickup' });
    }
    if (!team_id) return res.status(422).json({ error: 'team_id is required' });

    const event = await queryOne(
      `SELECT * FROM events WHERE id = $1 AND user_id = $2`,
      [req.params.eventId, req.user.id]
    );
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Pull team members with phone numbers — parents without a
    // phone can't receive a group SMS so we silently skip them.
    const members = await query(
      `SELECT c.id, c.name, c.phone, c.email
         FROM team_members tm
         JOIN contacts c ON c.id = tm.contact_id
         JOIN teams t    ON t.id = tm.team_id
        WHERE t.id = $1
          AND t.user_id = $2
          AND c.phone IS NOT NULL`,
      [team_id, req.user.id]
    );
    if (!members.length) {
      return res.status(422).json({
        error: 'No team members with phone numbers — add contacts with phones to this team first.',
      });
    }

    // First, supersede any still-pending offers for the same
    // event/role. A parent re-requesting overrides the previous
    // outstanding offer set rather than creating a parallel one.
    // Done in a transaction with the new inserts so a tap on a
    // newly-superseded link can't sneak through.
    const offers = await withTransaction(async (client) => {
      await client.query(
        `UPDATE event_logistics_offers
            SET status = 'superseded', resolved_at = NOW()
          WHERE event_id = $1 AND role = $2 AND status = 'pending'`,
        [req.params.eventId, role]
      );

      const rows = [];
      for (const m of members) {
        const token = crypto.randomBytes(24).toString('hex');
        const { rows: [offer] } = await client.query(
          `INSERT INTO event_logistics_offers
             (user_id, event_id, team_id, contact_id, role, token)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, contact_id, token`,
          [req.user.id, req.params.eventId, team_id, m.id, role, token]
        );
        rows.push({ ...offer, contact_name: m.name, contact_phone: m.phone });
      }
      return rows;
    });

    // Build the SMS body. iMessage will tap-link each URL; the
    // blank line between parents prevents the URLs visually
    // running together.
    const action_word = role === 'pickup' ? 'pick up' : 'drop off';
    const kid = (event.display_title || '').split('—')[0].trim();
    const eventDate = new Date(event.starts_at).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
    const eventTime = event.all_day
      ? ''
      : ' at ' + new Date(event.starts_at).toLocaleTimeString('en-US', {
          hour: 'numeric', minute: '2-digit',
        });
    // Single short URL → landing page that lists every pending parent
    // as a claim button. Scales cleanly to teams of any size since the
    // SMS body stays one line of text + one URL no matter the count.
    // The token is just one of the per-parent ones; the landing page
    // resolves it to the batch and shows all pending offers.
    const requestUrl = `${APP_URL}/r/${offers[0].token}`;
    const sms_body =
      `Hey team — can someone ${action_word} ${kid} on ${eventDate}${eventTime}` +
      `${event.location ? ' at ' + event.location : ''}? First to claim wins:\n\n` +
      requestUrl;

    res.status(201).json({
      offers,
      sms_body,
      request_url: requestUrl,
      phones: members.map(m => m.phone),
    });
  } catch (err) {
    console.error('[logistics] team-request error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/logistics/offer/:token/:action
//
// Public claim endpoint for team ride requests. First parent to
// confirm wins; sibling pending offers atomically flip to
// 'superseded' in the same transaction. Subsequent taps on
// already-superseded tokens get a friendly "already claimed"
// page rather than a 500.
// ============================================================
router.get('/offer/:token/:action', async (req, res) => {
  try {
    const { token, action } = req.params;
    if (!['confirmed', 'declined'].includes(action)) {
      return res.redirect(`${APP_URL}/?error=invalid`);
    }

    const result = await withTransaction(async (client) => {
      // Atomic conditional update — only flips status if it's
      // still pending, so the second tapper sees zero rows.
      const updateSql = action === 'confirmed'
        ? `UPDATE event_logistics_offers
              SET status = 'confirmed', resolved_at = NOW()
            WHERE token = $1 AND status = 'pending'
            RETURNING id, user_id, event_id, role, contact_id, team_id`
        : `UPDATE event_logistics_offers
              SET status = 'declined', resolved_at = NOW()
            WHERE token = $1 AND status = 'pending'
            RETURNING id, user_id, event_id, role, contact_id, team_id`;
      const { rows: [winning] } = await client.query(updateSql, [token]);
      if (!winning) {
        // Look up the offer's current state so we can give a
        // helpful "already claimed by Linda" page.
        const { rows: [stale] } = await client.query(
          `SELECT o.status, o.event_id, o.role,
                  (
                    SELECT json_build_object('name', c.name)
                      FROM event_logistics_offers o2
                      JOIN contacts c ON c.id = o2.contact_id
                     WHERE o2.event_id = o.event_id
                       AND o2.role = o.role
                       AND o2.status = 'confirmed'
                     LIMIT 1
                  ) AS winner
             FROM event_logistics_offers o
            WHERE o.token = $1`,
          [token]
        );
        return { stale };
      }

      if (action === 'confirmed') {
        // Supersede every other pending offer for this event/role
        // — only one parent can claim each role.
        await client.query(
          `UPDATE event_logistics_offers
              SET status = 'superseded', resolved_at = NOW()
            WHERE event_id = $1 AND role = $2
              AND status = 'pending' AND id <> $3`,
          [winning.event_id, winning.role, winning.id]
        );
        // Mirror the winning offer into the canonical
        // event_logistics row so existing dashboard surfaces
        // (per-event card pickup/dropoff line) just work.
        await client.query(
          `INSERT INTO event_logistics
             (user_id, event_id, contact_id, role, status, token)
           VALUES ($1, $2, $3, $4, 'confirmed', $5)
           ON CONFLICT (event_id, role) DO UPDATE SET
             contact_id = EXCLUDED.contact_id,
             status     = EXCLUDED.status,
             token      = EXCLUDED.token`,
          [winning.user_id, winning.event_id, winning.contact_id, winning.role, token]
        );
      }
      return { winning };
    });

    // Stale path: this token was already resolved (someone else
    // got there first, or this offer was rescinded by a
    // superseding request).
    if (result.stale) {
      const winnerName = result.stale.winner?.name;
      const msg = winnerName ? `claimed-by-${encodeURIComponent(winnerName)}` : 'already-claimed';
      return res.redirect(`${APP_URL}/logistics-response?status=${msg}`);
    }

    // Confirmed: notify the parent + send a calendar invite to
    // the winning contact. Reuses the same email helpers the
    // single-contact flow uses.
    const winning = result.winning;
    const detail = await queryOne(
      `SELECT c.name AS contact_name, c.email AS contact_email,
              e.display_title, e.starts_at, e.ends_at, e.location,
              u.name AS parent_name, u.email AS parent_email
         FROM contacts c, events e, users u
        WHERE c.id = $1 AND e.id = $2 AND u.id = $3`,
      [winning.contact_id, winning.event_id, winning.user_id]
    );

    if (detail) {
      const eventDate = new Date(detail.starts_at).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
      });
      const eventTime = new Date(detail.starts_at).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
      });

      // Notify parent (always, regardless of action)
      if (detail.parent_email) {
        const subject = action === 'confirmed'
          ? `${detail.contact_name} has confirmed the ${winning.role} for ${eventDate}`
          : `${detail.contact_name} has declined the ${winning.role} for ${eventDate}`;
        await resend.emails.send({
          from: FROM,
          to: detail.parent_email,
          subject,
          html: buildResponseEmail({
            logistics: { ...detail, role: winning.role },
            action,
            eventDate,
            eventTime,
          }),
          text: `${detail.contact_name} has ${action} the ${winning.role} for ${detail.display_title} on ${eventDate} at ${eventTime}.`,
        }).catch(err => console.error('[logistics] team-claim notify error:', err.message));
      }

      // Calendar invite to confirmed contact
      if (action === 'confirmed' && detail.contact_email) {
        const action_label = winning.role === 'pickup' ? 'Pick up' : 'Drop off';
        const icsContent = buildIcs({
          logistics: { id: winning.id, ...detail, role: winning.role },
          eventDate, eventTime,
        });
        await resend.emails.send({
          from: FROM,
          to: detail.contact_email,
          subject: `📅 Calendar invite: ${action_label} for ${eventDate}`,
          html: buildConfirmCalendarEmail({
            logistics: { ...detail, role: winning.role },
            eventDate, eventTime,
          }),
          text: `Hi ${detail.contact_name.split(' ')[0]}, here's a calendar invite for the ${winning.role} on ${eventDate} at ${eventTime}${detail.location ? ` at ${detail.location}` : ''}.`,
          attachments: [{ filename: 'ride.ics', content: Buffer.from(icsContent).toString('base64') }],
        }).catch(err => console.error('[logistics] team-claim ics error:', err.message));
      }
    }

    const msg = action === 'confirmed' ? 'confirmed' : 'declined';
    const name = encodeURIComponent(detail?.contact_name || 'You');
    res.redirect(`${APP_URL}/logistics-response?status=${msg}&name=${name}`);
  } catch (err) {
    console.error('[logistics] offer respond error:', err.message);
    res.redirect(`${APP_URL}/?error=server`);
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
      `SELECT el.*, c.name AS contact_name, c.email AS contact_email,
              e.display_title, e.starts_at, e.ends_at, e.location,
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
      weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles'
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

    // If confirmed, send contact a calendar invite
    if (action === 'confirmed' && logistics.contact_email) {
      const icsContent = buildIcs({ logistics, eventDate, eventTime });
      const eventName = logistics.display_title.split('—')[1]?.trim() || logistics.display_title;
      const action_label = logistics.role === 'pickup' ? 'Pick up' : 'Drop off';

      await resend.emails.send({
        from: FROM,
        to: logistics.contact_email,
        subject: `📅 Calendar invite: ${action_label} for ${eventDate}`,
        html: buildConfirmCalendarEmail({ logistics, eventDate, eventTime }),
        text: `Hi ${logistics.contact_name.split(' ')[0]}, here's a calendar invite for the ${logistics.role} on ${eventDate} at ${eventTime}${logistics.location ? ` at ${logistics.location}` : ''}.`,
        attachments: [
          {
            filename: 'ride.ics',
            content: Buffer.from(icsContent).toString('base64'),
          }
        ],
      }).catch(err => console.error('[logistics] calendar invite error:', err.message));
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

function buildIcs({ logistics, eventDate, eventTime }) {
  const start = new Date(logistics.starts_at);
  // Default to 1 hour duration if no end time
  const end = (logistics.ends_at && logistics.ends_at !== logistics.starts_at)
    ? new Date(logistics.ends_at)
    : new Date(start.getTime() + 60 * 60 * 1000);

  // Format as YYYYMMDDTHHMMSSZ
  const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

  const eventName = logistics.display_title.split('—')[1]?.trim() || logistics.display_title;
  const action_label = logistics.role === 'pickup' ? 'Pick up' : 'Drop off';
  const uid = `sportscal-${logistics.id}-${Date.now()}@sportscalapp.com`;
  const now = fmt(new Date());

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SportsCal//Ride Logistics//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${action_label}: ${eventName}`,
    logistics.location ? `LOCATION:${logistics.location}` : null,
    `DESCRIPTION:${action_label} assigned via SportsCal by ${logistics.parent_name}.`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  return lines;
}

function buildConfirmCalendarEmail({ logistics, eventDate, eventTime }) {
  const eventName = logistics.display_title.split('—')[1]?.trim() || logistics.display_title;
  const action_label = logistics.role === 'pickup' ? 'Pick up' : 'Drop off';
  const firstName = logistics.contact_name.split(' ')[0];

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
          <p style="margin:0 0 8px;font-size:22px;font-weight:600;color:#0f1629;">
            📅 You're all set, ${firstName}!
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#8896b0;line-height:1.6;">
            Here's a calendar invite for your ${action_label.toLowerCase()} assignment. Tap the attachment to add it to your calendar.
          </p>
          <div style="background:#f4f6fa;border-radius:10px;padding:20px;margin-bottom:24px;border-left:4px solid #00d68f;">
            <p style="margin:0 0 6px;font-size:16px;font-weight:600;color:#0f1629;">${action_label}: ${eventName}</p>
            <p style="margin:0 0 4px;font-size:14px;color:#8896b0;">📅 ${eventDate} at ${eventTime}</p>
            ${logistics.location ? `<p style="margin:0;font-size:14px;color:#8896b0;">📍 ${logistics.location}</p>` : ''}
          </div>
          <p style="margin:0;font-size:13px;color:#b8c4d8;line-height:1.6;">
            Open the <strong>ride.ics</strong> attachment below to add this event to your calendar.
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

export default router;
