// Shared "how should we notify <contact> about this assignment?" action
// sheet. Lives in the picker (not the opener) so the sheet shows while
// the picker is still the active modal — presenting a UIAlertController
// from the opener while the picker is mid-dismiss causes iOS to silently
// drop the sheet, which manifested as "tap a contact, sheet flashes for
// a moment, then nothing happens, no assign."
//
// Free users skip the sheet entirely (notifications are premium-only;
// the backend silently drops them anyway).
//
// Returns one of: 'none' | 'email' | 'sms' | 'manual_sms' | null
//   null => user hit Cancel; opener should not act.
//   'manual_sms' => after assigning, opener should open Messages app
//                   pre-filled with the request body.

import { ActionSheetIOS } from 'react-native';

export function chooseNotify(contact, role, { isPremium }) {
  if (!isPremium) return Promise.resolve('none');

  const hasEmail        = !!contact.email;
  const hasConfirmedSms = !!contact.phone && contact.sms_consent_status === 'confirmed';
  const hasPendingPhone = !!contact.phone && !hasConfirmedSms;
  const firstName       = (contact.name || 'them').split(' ')[0];

  const options = ['Just assign'];
  const actions = ['none'];
  if (hasEmail)        { options.push(`Email ${firstName}`);                 actions.push('email'); }
  if (hasConfirmedSms) { options.push(`Text ${firstName}`);                  actions.push('sms'); }
  if (hasPendingPhone) { options.push(`Open Messages to text ${firstName}`); actions.push('manual_sms'); }
  options.push('Cancel');

  return new Promise((resolve) => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: `Assign ${contact.name} as ${role}?`,
        message: hasPendingPhone
          ? `${firstName} hasn't confirmed SMS yet. You can still text them yourself from your Messages app.`
          : undefined,
        options,
        cancelButtonIndex: options.length - 1,
      },
      (idx) => {
        if (idx === options.length - 1) resolve(null);
        else resolve(actions[idx]);
      },
    );
  });
}
