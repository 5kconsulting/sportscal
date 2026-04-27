// Twilio SMS helpers — opt-in confirmation, phone normalization,
// and shared client. Centralized so we don't sprinkle Twilio init
// across every route.
//
// A2P 10DLC consent model:
//   1. Account holders consent at signup via the public consent
//      checkbox on /signup. Their consent is recorded on the user row.
//   2. Ride contacts (people the parent adds) get exactly one SMS
//      from us — the opt-in confirmation generated here. They must
//      reply YES before we send anything else. STOP/HELP are handled
//      by /api/twilio/inbound.

let _twilioClient = null;

export function twilioConfigured() {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
}

export async function getTwilioClient() {
  if (!twilioConfigured()) return null;
  if (_twilioClient) return _twilioClient;
  const twilio = (await import('twilio')).default;
  _twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return _twilioClient;
}

// Best-effort E.164 normalization for US numbers. We don't pull in
// libphonenumber-js — keeps the dep tree light. Returns null if the
// input is obviously not a phone we can dial.
export function toE164(phone) {
  if (!phone) return null;
  const trimmed = String(phone).trim();
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    return digits.length >= 10 ? `+${digits}` : null;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

// Send the one-and-only SMS a contact ever receives before opting in.
// Carriers expect: brand, sender identity, what messages are about,
// frequency, opt-out instructions, rates disclosure.
export async function sendOptInSms({ contact, parentName }) {
  const client = await getTwilioClient();
  const to = toE164(contact.phone);

  if (!client) return { sent: false, reason: 'twilio_not_configured' };
  if (!to)     return { sent: false, reason: 'invalid_phone' };

  const fromName = (parentName || 'A SportsCal user').split(' ')[0];
  const body =
    `${fromName} added you as a ride contact on SportsCal — a youth sports calendar app. ` +
    `Reply YES to receive occasional ride coordination texts (typically 1-4/week), ` +
    `or STOP to opt out. Msg&data rates may apply. https://www.sportscalapp.com/sms`;

  const msg = await client.messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
  });
  return { sent: true, sid: msg.sid, from: process.env.TWILIO_PHONE_NUMBER };
}

// Inbound message classification. Anything else returns 'noop' so the
// webhook responds politely without changing state.
export function classifyInbound(body) {
  if (!body) return 'noop';
  const t = String(body).trim().toUpperCase();
  if (['YES', 'Y', 'START', 'UNSTOP'].includes(t))                    return 'opt_in';
  if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(t)) return 'opt_out';
  if (['HELP', 'INFO'].includes(t))                                   return 'help';
  return 'noop';
}
