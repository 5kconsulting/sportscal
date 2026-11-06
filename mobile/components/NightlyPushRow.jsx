// ============================================================
// "Nightly heads-up" row in Settings — the 8 PM push with tomorrow's
// schedule (backend/src/workers/pushWorker.js).
//
// On  = iOS permission granted AND the user hasn't switched it off here.
// Off = switched off here (server records push_opted_out, so the token
//       re-registration on every launch doesn't turn it back on).
// Blocked = iOS permission denied; the only way back is iPhone Settings,
//       so the row links there and re-checks when the app comes back.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { View, Text, Switch, TouchableOpacity, AppState, Linking, Alert } from 'react-native';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useTheme } from '../lib/theme';
import { getPushPermission, registerForPush } from '../lib/push';

export default function NightlyPushRow() {
  const t = useTheme();
  const { user, updateUser } = useAuth();
  const [perm, setPerm] = useState(null);       // null while checking
  const [pending, setPending] = useState(null); // switch value mid-save

  const refresh = useCallback(async () => {
    const p = await getPushPermission();
    setPerm(p);
    // Back from iPhone Settings with notifications newly allowed: register
    // this device so tonight's push can reach it.
    if (p === 'granted') registerForPush();
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // Simulators and pre-push clients can't receive pushes; nothing to show.
  if (perm === null || perm === 'unavailable') return null;

  const on = perm === 'granted' && !user?.push_opted_out;

  async function setEnabled(next) {
    setPending(next);
    try {
      if (next && perm !== 'granted') {
        await registerForPush(); // shows the iOS prompt if it hasn't been answered
        const p = await getPushPermission();
        setPerm(p);
        if (p !== 'granted') return;
      }
      const prefs = await api.patch('/api/push-tokens/preference', { enabled: next });
      updateUser({ push_opted_out: prefs.push_opted_out, push_enabled: prefs.push_enabled });
      if (next) registerForPush();
    } catch (err) {
      Alert.alert('Could not save', err.message || 'Please try again.');
    } finally {
      setPending(null);
    }
  }

  const blocked = perm === 'denied';

  return (
    <View style={{
      backgroundColor: t.surface, borderRadius: 12, padding: 16,
      marginBottom: 12, borderWidth: 1, borderColor: t.border,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: t.navy }}>🌙 Nightly heads-up</Text>
          <Text style={{ fontSize: 12, color: t.slate, marginTop: 3, lineHeight: 16 }}>
            {blocked
              ? 'Notifications are turned off for SportsCal in iPhone Settings.'
              : "A notification at 8 PM with tomorrow's schedule. Only sent when something's on."}
          </Text>
        </View>
        {!blocked && (
          <Switch
            value={pending ?? on}
            onValueChange={setEnabled}
            disabled={pending !== null}
            trackColor={{ true: t.accent, false: '#cbd5e1' }}
            accessibilityLabel="Nightly heads-up at 8 PM"
          />
        )}
      </View>
      {blocked && (
        <TouchableOpacity
          onPress={() => Linking.openSettings()}
          activeOpacity={0.8}
          style={{
            marginTop: 12, backgroundColor: t.cta, borderRadius: 10,
            paddingVertical: 11, alignItems: 'center',
          }}
        >
          <Text style={{ color: t.ctaText, fontSize: 14, fontWeight: '600' }}>Turn on in iPhone Settings</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
