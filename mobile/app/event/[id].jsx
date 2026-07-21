import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Pressable, Linking,
  ActionSheetIOS,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { selectionStore } from '../../lib/selectionStore';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';

// Sport inference (keyword only — no guessing) drives the hero color + icon.
const SPORTS = [
  { re: /soccer|f[úu]tbol/i, label: 'Soccer', color: '#16a34a' },
  { re: /swim|dive|aquatic/i, label: 'Swim', color: '#0891b2' },
  { re: /volley/i, label: 'Volleyball', color: '#db2777' },
  { re: /basketball|hoops/i, label: 'Basketball', color: '#ea580c' },
  { re: /baseball|softball|t-?ball/i, label: 'Baseball', color: '#ca8a04' },
  { re: /hockey/i, label: 'Hockey', color: '#0ea5e9' },
  { re: /football/i, label: 'Football', color: '#7c3aed' },
  { re: /lacrosse|lax/i, label: 'Lacrosse', color: '#059669' },
  { re: /tennis/i, label: 'Tennis', color: '#65a30d' },
  { re: /golf/i, label: 'Golf', color: '#15803d' },
  { re: /track|cross.?country|\bxc\b/i, label: 'Track', color: '#dc2626' },
  { re: /gymnastic/i, label: 'Gymnastics', color: '#c026d3' },
  { re: /dance|ballet/i, label: 'Dance', color: '#e11d48' },
  { re: /wrestl/i, label: 'Wrestling', color: '#9333ea' },
];
function inferSport(title = '') {
  for (const sp of SPORTS) if (sp.re.test(title)) return sp;
  return null;
}
const SPORT_ICON = {
  Soccer: 'football-outline', Basketball: 'basketball-outline', Baseball: 'baseball-outline',
  Tennis: 'tennisball-outline', Football: 'american-football-outline', Swim: 'water-outline',
  Golf: 'golf-outline', Track: 'walk-outline', Gymnastics: 'body-outline', Dance: 'body-outline',
  Hockey: 'ellipse-outline', Volleyball: 'ellipse-outline', Lacrosse: 'ellipse-outline', Wrestling: 'body-outline',
};
function textOn(hex) {
  const h = String(hex).replace('#', '');
  if (h.length !== 6) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#0f172a' : '#ffffff';
}
function countdownLabel(start) {
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const days = Math.round((b - a) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1) return `In ${days} days`;
  return `${-days} days ago`;
}

export default function EventDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const isPremium = user?.plan === 'premium';
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const [event, setEvent]         = useState(null);
  const [logistics, setLogistics] = useState([]); // array of 0-2 rows
  const [overrides, setOverrides] = useState({}); // { [kidId]: attending }
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [savingRole, setSavingRole] = useState(null); // 'pickup' | 'dropoff' | null
  const [savingKidId, setSavingKidId] = useState(null);
  const [removing, setRemoving] = useState(false);

  // "Remove from SportsCal" — soft-hides this event for this user. The
  // backend keys the hide on source_uid (not events.id) so it survives
  // the next iCal feed refresh, which UPSERTs and would otherwise un-hide.
  function confirmRemove() {
    Alert.alert(
      'Remove from SportsCal?',
      `"${event?.display_title || event?.raw_title || 'This event'}" will be hidden from your calendar. The original stays in the source app. Restore from Settings → Hidden events.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemoving(true);
            try {
              await api.del(`/api/events/${id}`);
              router.back();
            } catch (err) {
              Alert.alert('Could not remove', err.message || 'Try again.');
              setRemoving(false);
            }
          },
        },
      ],
    );
  }

  const load = useCallback(async () => {
    setError('');
    try {
      const [eventRes, logRes, ovRes] = await Promise.all([
        api.get(`/api/events/${id}`),
        api.get(`/api/logistics/${id}`),
        api.get(`/api/overrides/${id}`),
      ]);
      setEvent(eventRes.event);
      setLogistics(logRes.logistics || []);
      const map = {};
      (ovRes.overrides || []).forEach(o => { map[o.kid_id] = o.attending; });
      setOverrides(map);
    } catch (err) {
      setError(err.message || 'Could not load event');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function findLogistics(role) {
    return logistics.find(l => l.role === role) || null;
  }

  // The "how should we notify them?" action sheet now lives in the picker
  // itself (lib/notifyChoice.js) — see the long comment in openContactPicker
  // below for why.

  // Open the native Messages app pre-filled with the request, including
  // the same Yes/No tap-links that the Twilio path embeds. Token comes
  // from the logistics row we just created — when the contact taps Yes,
  // it hits GET /api/logistics/respond/:token/confirmed (public, no auth)
  // and the parent gets an email confirmation. Same plumbing as email
  // and Twilio paths, just routed through the parent's own Messages app.
  function openMessagesFallback(contact, role, token) {
    if (!contact?.phone || !event) return;
    const action_word = role === 'pickup' ? 'pick up' : 'drop off';
    const kid = (event.display_title || '').split('—')[0].trim();
    const startsAt = new Date(event.starts_at);
    const dateStr = startsAt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = event.all_day
      ? ''
      : ' at ' + startsAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const baseUrl = 'https://www.sportscalapp.com/api/logistics/respond';
    const confirmUrl = token ? `${baseUrl}/${token}/confirmed` : null;
    const declineUrl = token ? `${baseUrl}/${token}/declined` : null;
    const lines = [
      `Hi ${contact.name.split(' ')[0]} — can you ${action_word} ${kid} on ${dateStr}${timeStr}${event.location ? ' at ' + event.location : ''}?`,
    ];
    if (confirmUrl && declineUrl) {
      // Blank line between the two URLs so iMessage renders them as
      // two distinct tappable links instead of one continuous wrap.
      lines.push('', `Yes: ${confirmUrl}`, '', `No: ${declineUrl}`);
    } else {
      lines.push('', 'Thanks!');
    }
    const body = encodeURIComponent(lines.join('\n'));
    Linking.openURL(`sms:${contact.phone}?&body=${body}`).catch(() => {
      Alert.alert('Could not open Messages', 'Please try again.');
    });
  }

  // Top-level "+ Assign" tap. For free users we go straight to the
  // single-contact picker (matches existing behavior). For Premium
  // users with at least one group configured, we ask first whether
  // they want a single contact or a whole group — same shape as the
  // tabbed UI on the web event modal.
  async function openPicker(role) {
    if (!isPremium) {
      openContactPicker(role);
      return;
    }
    let teams = [];
    try {
      const r = await api.get('/api/teams');
      teams = r.teams || [];
    } catch {
      // If teams endpoint is unreachable, just fall back to contact
      // picker. Better than blocking on a non-essential lookup.
    }
    if (!teams.length) {
      openContactPicker(role);
      return;
    }
    const choice = await chooseAssignType(role);
    if (choice === 'contact') openContactPicker(role);
    else if (choice === 'team') openTeamRequest(role, teams);
  }

  function chooseAssignType(role) {
    const action_word = role === 'pickup' ? 'pick up' : 'drop off';
    return new Promise((resolve) => {
      const options = ['Pick a contact', 'Ask a group', 'Cancel'];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: `Who handles ${action_word}?`,
          options,
          cancelButtonIndex: options.length - 1,
        },
        (idx) => {
          if (idx === 0) resolve('contact');
          else if (idx === 1) resolve('team');
          else resolve(null);
        },
      );
    });
  }

  function openContactPicker(role) {
    // The picker itself prompts the user for the notify choice (email /
    // text / open-Messages / just-assign) before resolving, because that
    // action sheet has to be presented while the picker is the active
    // modal. Presenting it from here — after router.back() has started
    // dismissing the picker — caused iOS to silently drop the sheet
    // mid-animation, which manifested as "tap a contact, sheet flashes
    // for a moment, then nothing happens." See lib/notifyChoice.js.
    const sessionId = selectionStore.createSession(async (payload) => {
      if (!payload || !payload.contact) return;
      const { contact, notify: choice } = payload;

      // 'manual_sms' opens Messages directly and still records the
      // assignment server-side (with notify='none' so we don't ALSO try
      // to send through Twilio).
      const isManualSms = choice === 'manual_sms';
      const notify = isManualSms ? 'none' : choice;

      setSavingRole(role);
      try {
        const resp = await api.post(`/api/logistics/${id}`, {
          contact_id: contact.id,
          role,
          notify,
        });
        setLogistics(prev => {
          const others = prev.filter(l => l.role !== role);
          return [...others, resp.logistics];
        });

        // Whenever the Twilio path didn't actually send (because consent
        // isn't confirmed or A2P verification is still pending), route
        // through Messages directly — no consent-warning prompt. v1 ships
        // SMS-via-parent's-iPhone as the primary path; Twilio is a
        // post-launch addition.
        const needsManualMessage = isManualSms
          || resp.sms_skipped_reason === 'consent_pending'
          || resp.sms_skipped_reason === 'consent_declined';
        if (needsManualMessage) {
          openMessagesFallback(contact, role, resp.logistics?.token);
        }
      } catch (err) {
        Alert.alert('Could not assign', err.message || 'Please try again.');
      } finally {
        setSavingRole(null);
      }
    });
    router.push(`/contacts/picker?session=${sessionId}&role=${role}`);
  }

  // Ask-a-group flow. Second action sheet lists the user's groups
  // with member counts; on pick, fires team-request and opens iMessage
  // with the recipient list + body prefilled. iOS will then create a
  // single group thread and send the message from the parent's own
  // phone — no Twilio.
  async function openTeamRequest(role, teams) {
    const action_word = role === 'pickup' ? 'pick up' : 'drop off';
    const team = await new Promise((resolve) => {
      const options = teams.map(t => {
        const total = (t.members || []).length;
        const reachable = (t.members || []).filter(m => m.phone).length;
        const suffix = reachable === total ? `(${total})` : `(${reachable}/${total})`;
        return `${t.name} ${suffix}`;
      });
      options.push('Cancel');
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: `Ask which group to ${action_word}?`,
          options,
          cancelButtonIndex: options.length - 1,
        },
        (idx) => {
          if (idx === options.length - 1) resolve(null);
          else resolve(teams[idx]);
        },
      );
    });
    if (!team) return;

    setSavingRole(role);
    try {
      const resp = await api.post(`/api/logistics/${id}/team-request`, {
        team_id: team.id,
        role,
      });
      const phones = (resp.phones || []).join(',');
      const body = encodeURIComponent(resp.sms_body || '');
      // sms:?addresses=N1,N2&body=… — same form used on web. iMessage
      // group thread opens; parent hits Send. First parent to tap the
      // landing-page link claims the role.
      Linking.openURL(`sms:?addresses=${phones}&body=${body}`).catch(() => {
        Alert.alert(
          'Could not open Messages',
          'The message body has been copied to your clipboard if available.',
        );
      });
    } catch (err) {
      Alert.alert('Could not send group request', err.message || 'Please try again.');
    } finally {
      setSavingRole(null);
    }
  }

  async function setKidAttendance(kidId, attending) {
    const prev = overrides;
    setOverrides(p => ({ ...p, [kidId]: attending }));
    setSavingKidId(kidId);
    try {
      if (attending) {
        await api.del(`/api/overrides/${id}/${kidId}`);
      } else {
        await api.post(`/api/overrides/${id}`, { kid_id: kidId, attending: false });
      }
    } catch (err) {
      setOverrides(prev);
      Alert.alert('Could not update', err.message || 'Please try again.');
    } finally {
      setSavingKidId(null);
    }
  }

  function clearRole(role) {
    Alert.alert(
      'Remove assignment?',
      `This will unassign the ${role} for this event.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            setSavingRole(role);
            try {
              await api.del(`/api/logistics/${id}/${role}`);
              setLogistics(prev => prev.filter(l => l.role !== role));
            } catch (err) {
              Alert.alert('Could not remove', err.message || 'Please try again.');
            } finally {
              setSavingRole(null);
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <ModalHeader onClose={() => router.back()} title="" />
        <View style={s.center}><ActivityIndicator color={t.accent} size="large" /></View>
      </SafeAreaView>
    );
  }

  if (error || !event) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <ModalHeader onClose={() => router.back()} title="" />
        <View style={s.center}>
          <Text style={s.errorText}>{error || 'Event not found'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : null;

  const dateLabel = start.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  const timeLabel = event.all_day
    ? 'All day'
    : (end
        ? `${start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
        : start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));

  const kids = Array.isArray(event.kids) ? event.kids : [];

  // Match the calendar card: infer from source name + location too, so a
  // soccer feed whose title omits "soccer" still gets the green sport hero
  // (not a generic calendar motif). Keeps card and detail consistent.
  const sport = inferSport(
    [event.display_title || event.raw_title, event.source_name, event.location].filter(Boolean).join(' ')
  );
  const heroColor = sport?.color || kids[0]?.color || t.accent;
  const heroFg = textOn(heroColor);
  const heroScrim = heroFg === '#ffffff' ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.10)';
  const sportIconName = (sport && SPORT_ICON[sport.label]) || 'calendar-outline';
  const countdown = countdownLabel(start);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ModalHeader onClose={() => router.back()} title="Event" />

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* HERO — sport/kid color with a big translucent sport-icon watermark */}
        <View style={[s.hero, { backgroundColor: heroColor }]}>
          <Ionicons name={sportIconName} size={188} color={heroFg} style={s.heroWm} />
          <View style={[s.countPill, { backgroundColor: heroScrim }]}>
            <Ionicons name="time-outline" size={13} color={heroFg} />
            <Text style={[s.countText, { color: heroFg }]}>{countdown}</Text>
          </View>
          <Text style={[s.heroTitle, { color: heroFg }]}>{event.display_title || event.raw_title}</Text>
          <Text style={[s.heroWhen, { color: heroFg }]}>{dateLabel} · {timeLabel}</Text>
          {kids.length > 0 && (
            <View style={s.heroAvatars}>
              {kids.slice(0, 4).map(k => (
                <View key={k.id} style={[s.heroAv, { backgroundColor: k.color || t.accent, borderColor: heroFg }]}>
                  <Text style={s.heroAvTxt}>{(k.name || '?')[0]}</Text>
                </View>
              ))}
              <Text style={[s.heroWho, { color: heroFg }]} numberOfLines={1}>
                {kids.map(k => k.name).join(', ')}{event.source_name ? `  ·  ${event.source_name}` : ''}
              </Text>
            </View>
          )}
        </View>

        {/* LOCATION — decorative map motif + directions */}
        {event.location ? (
          <View style={[s.card, s.locCard]}>
            <View style={[s.locMap, { backgroundColor: heroColor + '14' }]}>
              <View style={[s.road, s.road1, { backgroundColor: heroColor + '33' }]} />
              <View style={[s.road, s.road2, { backgroundColor: heroColor + '33' }]} />
              <Ionicons name="location" size={28} color={heroColor} style={s.mapPin} />
            </View>
            <View style={s.locRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.locVenue} numberOfLines={1}>{event.location}</Text>
                <Text style={s.locHint}>Tap for directions</Text>
              </View>
              <Pressable
                onPress={() => {
                  const url = `http://maps.apple.com/?daddr=${encodeURIComponent(event.location)}`;
                  Linking.openURL(url).catch(() => Alert.alert('Could not open Maps', 'Please try again.'));
                }}
                hitSlop={8}
                style={({ pressed }) => [s.dirBtn, pressed && { opacity: 0.6 }]}
              >
                <Text style={s.dirBtnText}>Directions</Text>
                <Ionicons name="arrow-forward" size={14} color={t.accent} />
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* WHO'S GOING — tappable kid chips (same attendance logic) */}
        {kids.length > 0 && (
          <View style={[s.card, s.pad]}>
            <Text style={s.clab}>Who's going</Text>
            <View style={s.chips}>
              {kids.map(k => {
                const attending = overrides[k.id] !== false;
                const saving = savingKidId === k.id;
                return (
                  <Pressable
                    key={k.id}
                    onPress={() => setKidAttendance(k.id, !attending)}
                    disabled={saving}
                    style={[s.kchip, !attending && s.kchipOff]}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: attending }}
                    accessibilityLabel={`${k.name}${attending ? ', going' : ', not going'}`}
                  >
                    <View style={[s.ka, { backgroundColor: k.color || t.accent }]}>
                      <Text style={s.kaTxt}>{(k.name || '?')[0]}</Text>
                    </View>
                    <Text style={[s.kchipName, !attending && s.kchipNameOff]}>{k.name}</Text>
                    {saving ? (
                      <ActivityIndicator size="small" color={t.slate} />
                    ) : attending ? (
                      <Ionicons name="checkmark-circle" size={18} color={t.accent} />
                    ) : (
                      <Ionicons name="ellipse-outline" size={18} color={t.slateLight} />
                    )}
                  </Pressable>
                );
              })}
            </View>
            <Text style={s.secHint}>Tap a kid to toggle whether this shows in their calendar feed.</Text>
          </View>
        )}

        {/* DETAILS */}
        {event.description ? (
          <View style={[s.card, s.pad]}>
            <Text style={s.clab}>Details</Text>
            <Text style={s.description}>{event.description}</Text>
          </View>
        ) : null}

        {/* RIDE COORDINATION */}
        <View style={[s.card, s.pad]}>
          <Text style={s.clab}>Ride coordination</Text>
          <View style={s.rides}>
            <LogisticsSlot
              role="pickup"
              label="Pick-up"
              logistics={findLogistics('pickup')}
              saving={savingRole === 'pickup'}
              onAssign={() => openPicker('pickup')}
              onClear={() => clearRole('pickup')}
            />
            <LogisticsSlot
              role="dropoff"
              label="Drop-off"
              logistics={findLogistics('dropoff')}
              saving={savingRole === 'dropoff'}
              onAssign={() => openPicker('dropoff')}
              onClear={() => clearRole('dropoff')}
            />
          </View>
        </View>

        {/* Remove — subtle, last in scroll; server soft-hides keyed on source_uid. */}
        <TouchableOpacity style={s.removeBtn} onPress={confirmRemove} activeOpacity={0.7} disabled={removing}>
          {removing ? <ActivityIndicator color={t.danger} /> : <Text style={s.removeBtnText}>Remove from SportsCal</Text>}
        </TouchableOpacity>
        <Text style={s.removeHelp}>
          Hides this event from your calendar. The original stays in the source app.
          Restore from Settings → Hidden events.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ModalHeader({ onClose, title }) {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={s.header}>
      <TouchableOpacity onPress={onClose} hitSlop={16}>
        <Text style={s.headerClose}>Done</Text>
      </TouchableOpacity>
      <Text style={s.headerTitle}>{title}</Text>
      <View style={{ width: 44 }} />
    </View>
  );
}

function LogisticsSlot({ role, label, logistics, saving, onAssign, onClear }) {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  if (!logistics) {
    return (
      <Pressable
        onPress={onAssign}
        disabled={saving}
        style={({ pressed }) => [s.ride, s.rideEmpty, pressed && s.ridePressed]}
      >
        <View style={[s.rideIc, s.rideIcEmpty]}>
          {saving ? <ActivityIndicator size="small" color={t.slate} />
            : <Ionicons name="car-outline" size={20} color={t.slate} />}
        </View>
        <View style={s.rideInfo}>
          <Text style={s.rideRole}>{label}</Text>
          <Text style={s.rideAssign}>+ Assign a ride</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={t.slateLight} />
      </Pressable>
    );
  }

  const statusColor =
    logistics.status === 'confirmed' ? t.accent
    : logistics.status === 'declined' ? t.danger
    : logistics.status === 'requested' ? '#f59e0b'
    : t.slate;
  const statusLabel =
    logistics.status === 'confirmed' ? 'Confirmed'
    : logistics.status === 'declined' ? 'Declined'
    : logistics.status === 'requested' ? 'Awaiting reply'
    : 'Assigned';

  return (
    <View style={s.ride}>
      <View style={s.rideIc}>
        <Ionicons name="car-outline" size={20} color={t.accent} />
      </View>
      <View style={s.rideInfo}>
        <Text style={s.rideRole}>{label}</Text>
        <Text style={s.rideName} numberOfLines={1}>{logistics.contact_name}</Text>
        <View style={s.badgeRow}>
          <View style={[s.badge, { backgroundColor: statusColor + '22' }]}>
            <Text style={[s.badgeText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
      </View>
      {saving ? (
        <ActivityIndicator color={t.slate} />
      ) : (
        <View style={s.rideActions}>
          <TouchableOpacity onPress={onAssign} style={s.slotBtn} hitSlop={6}>
            <Text style={s.slotBtnText}>Change</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClear} style={s.slotBtn} hitSlop={6}>
            <Text style={[s.slotBtnText, { color: t.danger }]}>Remove</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function makeStyles(t) {
  return StyleSheet.create({
    root:   { flex: 1, backgroundColor: t.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    errorText: { color: t.danger, fontSize: 14, paddingHorizontal: 24, textAlign: 'center' },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: t.border,
      backgroundColor: t.surface,
    },
    headerClose: { fontSize: 15, color: t.accent, fontWeight: '600' },
    headerTitle: { fontSize: 15, fontWeight: '600', color: t.navy },

    // hero
    hero: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 22, overflow: 'hidden' },
    heroWm: { position: 'absolute', right: -30, bottom: -46, opacity: 0.16, transform: [{ rotate: '-8deg' }] },
    countPill: {
      flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
      borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5,
    },
    countText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
    heroTitle: { fontSize: 25, fontWeight: '800', letterSpacing: -0.4, marginTop: 14, marginBottom: 4, maxWidth: '86%' },
    heroWhen: { fontSize: 14, fontWeight: '600' },
    heroAvatars: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
    heroAv: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    heroAvTxt: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
    heroWho: { fontSize: 13, fontWeight: '600', flexShrink: 1 },

    // card scaffold
    card: {
      marginHorizontal: 14, marginTop: 12,
      backgroundColor: t.surface, borderRadius: 16,
      borderWidth: 1, borderColor: t.border,
      shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    pad: { padding: 14 },
    clab: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', color: t.slate },
    secHint: { fontSize: 12, color: t.slate, marginTop: 10, lineHeight: 16 },
    description: { fontSize: 14, color: t.navy, lineHeight: 21, marginTop: 8 },

    // location
    locCard: { overflow: 'hidden' },
    locMap: { height: 92, position: 'relative', overflow: 'hidden' },
    road: { position: 'absolute', borderRadius: 3 },
    road1: { left: -12, right: '34%', top: 44, height: 7, transform: [{ rotate: '-6deg' }] },
    road2: { width: 7, top: -12, bottom: 22, left: '62%', transform: [{ rotate: '9deg' }] },
    mapPin: { position: 'absolute', left: '57%', top: 30 },
    locRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 },
    locVenue: { fontSize: 15, fontWeight: '600', color: t.navy },
    locHint: { fontSize: 12, color: t.slate, marginTop: 1 },
    dirBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      borderWidth: 1, borderColor: t.border, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 8,
    },
    dirBtnText: { fontSize: 13, fontWeight: '600', color: t.accent },

    // who's going chips
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 11 },
    kchip: {
      flexDirection: 'row', alignItems: 'center', gap: 7,
      paddingLeft: 4, paddingRight: 12, paddingVertical: 4,
      borderRadius: 999, borderWidth: 1, borderColor: t.border, backgroundColor: t.bg,
    },
    kchipOff: { opacity: 0.6 },
    ka: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    kaTxt: { fontSize: 11, fontWeight: '700', color: '#ffffff' },
    kchipName: { fontSize: 13.5, fontWeight: '600', color: t.navy },
    kchipNameOff: { textDecorationLine: 'line-through', color: t.slate },

    // ride cards
    rides: { gap: 9, marginTop: 11 },
    ride: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: 1, borderColor: t.border, borderRadius: 13, padding: 11, backgroundColor: t.surface,
    },
    rideEmpty: { borderStyle: 'dashed', borderColor: t.slateLight },
    ridePressed: { backgroundColor: t.bg },
    rideIc: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accent + '1a' },
    rideIcEmpty: { backgroundColor: t.slate + '1a' },
    rideInfo: { flex: 1, minWidth: 0 },
    rideRole: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: t.slate },
    rideName: { fontSize: 14.5, fontWeight: '600', color: t.navy, marginTop: 1 },
    rideAssign: { fontSize: 14, fontWeight: '700', color: t.cta, marginTop: 1 },
    badgeRow: { flexDirection: 'row', marginTop: 5 },
    badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, alignSelf: 'flex-start' },
    badgeText: { fontSize: 11, fontWeight: '700' },
    rideActions: { alignItems: 'flex-end', gap: 2 },
    slotBtn: { paddingHorizontal: 8, paddingVertical: 4 },
    slotBtnText: { fontSize: 13, color: t.accent, fontWeight: '600' },

    // remove
    removeBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginTop: 18 },
    removeBtnText: { color: t.danger, fontSize: 13, fontWeight: '600' },
    removeHelp: { fontSize: 12, color: t.slate, marginTop: 2, lineHeight: 16, textAlign: 'center', paddingHorizontal: 28 },
  });
}
