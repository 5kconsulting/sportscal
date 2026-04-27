import { Router, urlencoded } from 'express';
import { query } from '../db/index.js';
import { classifyInbound, toE164 } from '../lib/sms.js';

// Twilio inbound message webhook.
//
// Twilio POSTs application/x-www-form-urlencoded when a contact replies
// to one of our messages. We don't auth this endpoint with our normal
// JWT — instead we verify Twilio's request signature on every request
// in production. In dev/test, validation is bypassed so curl works.
//
// Configured in Twilio dashboard: <PHONE NUMBER> > Messaging > A MESSAGE
// COMES IN > Webhook > https://<host>/api/twilio/inbound

const router = Router();

// Twilio sends form-urlencoded, not JSON, so this route needs its own
// body parser. Mounting at the route level keeps it isolated from the
// rest of the API which is JSON.
router.use(urlencoded({ extended: false }));

// Signature validator: real in production, no-op everywhere else so
// local development can curl the endpoint freely.
let validateTwilio;
if (process.env.NODE_ENV === 'production' && process.env.TWILIO_AUTH_TOKEN) {
  const twilioMod = await import('twilio');
  validateTwilio = twilioMod.default.webhook(process.env.TWILIO_AUTH_TOKEN, { validate: true });
} else {
  validateTwilio = (_req, _res, next) => next();
}

router.post('/inbound', validateTwilio, async (req, res) => {
  try {
    const fromRaw = req.body.From || '';
    const body    = req.body.Body || '';
    const sid     = req.body.MessageSid || '';
    const to      = req.body.To || '';

    const from = toE164(fromRaw) || fromRaw;
    const action = classifyInbound(body);

    console.log(`[twilio] inbound from=${from} action=${action} sid=${sid}`);

    // Look up every contact across every parent that has this phone.
    // A coach used by three parents gets three rows; a single STOP from
    // her opts her out for all of them.
    const contacts = await query(
      `SELECT id, user_id, name, phone, sms_consent_status FROM contacts WHERE phone = $1`,
      [from]
    );

    if (action === 'opt_in' && contacts.length > 0) {
      await query(
        `UPDATE contacts
            SET sms_consent_status = 'confirmed',
                sms_consent_at     = NOW(),
                sms_consent_method = 'reply_yes',
                sms_consent_phone  = $1
          WHERE phone = $2`,
        [to || process.env.TWILIO_PHONE_NUMBER || null, from]
      );
      return reply(res, "You're in. We'll only text you when a SportsCal user assigns you to a specific ride. Reply STOP anytime to opt out.");
    }

    if (action === 'opt_out' && contacts.length > 0) {
      await query(
        `UPDATE contacts
            SET sms_consent_status = 'declined',
                sms_consent_at     = NOW(),
                sms_consent_method = 'reply_stop',
                sms_consent_phone  = $1
          WHERE phone = $2`,
        [to || process.env.TWILIO_PHONE_NUMBER || null, from]
      );
      // Twilio Advanced Opt-Out also auto-handles the "you're opted out"
      // confirmation, so we keep our reply terse and informational.
      return reply(res, "You will not receive further SportsCal messages. Reply START to re-enable.");
    }

    if (action === 'help') {
      return reply(
        res,
        "SportsCal: ride coordination texts for youth sports. Reply STOP to opt out. " +
        "Support: https://www.sportscalapp.com/support"
      );
    }

    // Unknown body or unknown phone — respond politely without
    // changing any state. Important for noisy senders so we don't
    // create error feedback loops.
    return reply(res, "Sorry, this number only accepts YES, STOP, or HELP. Visit www.sportscalapp.com for more.");
  } catch (err) {
    console.error('[twilio] inbound error:', err.message);
    // Respond with empty TwiML — Twilio retries on non-2xx, and we
    // don't want infinite retries on a bug.
    res.type('text/xml').status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response/>');
  }
});

function reply(res, text) {
  // Inline TwiML so we don't need to import the SDK's helper.
  // XML-escape text just in case it contains special chars.
  const safe = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`;
  res.type('text/xml').status(200).send(xml);
}

export default router;
