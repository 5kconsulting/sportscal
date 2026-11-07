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
