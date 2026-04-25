import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Pressable, Switch, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../lib/api';
import { selectionStore } from '../../lib/selectionStore';

export default function EventDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [event, setEvent]         = useState(null);
  const [logistics, setLogistics] = useState([]); // array of 0-2 rows
  const [overrides, setOverrides] = useState({}); // { [kidId]: attending }
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [savingRole, setSavingRole] = useState(null); // 'pickup' | 'dropoff' | null
  const [savingKidId, setSavingKidId] = useState(null);

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

  function openPicker(role) {
    const sessionId = selectionStore.createSession(async (contact) => {
      if (!contact) return;
      setSavingRole(role);
      try {
        const { logistics: updated } = await api.post(`/api/logistics/${id}`, {
          contact_id: contact.id,
          role,
          notify: 'none', // mobile M2: assign only, no notifications
        });
        setLogistics(prev => {
          const others = prev.filter(l => l.role !== role);
          // Backend returns a single row with contact_name merged in
          return [...others, updated];
        });
      } catch (err) {
        Alert.alert('Could not assign', err.message || 'Please try again.');
      } finally {
        setSavingRole(null);
      }
    });
    router.push(`/contacts/picker?session=${sessionId}&role=${role}`);
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
        <View style={s.center}><ActivityIndicator color="#00d68f" size="large" /></View>
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

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ModalHeader onClose={() => router.back()} title="Event" />

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Title block */}
        <View style={s.titleBlock}>
          <Text style={s.title}>{event.display_title || event.raw_title}</Text>
          <Text style={s.meta}>{dateLabel}</Text>
          <Text style={s.meta}>{timeLabel}</Text>
          {event.location ? (
            <Pressable
              onPress={() => {
                const url = `http://maps.apple.com/?daddr=${encodeURIComponent(event.location)}`;
                Linking.openURL(url).catch(() =>
                  Alert.alert('Could not open Maps', 'Please try again.')
                );
              }}
              hitSlop={8}
              style={({ pressed }) => [{ marginTop: 8, opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[s.meta, s.locationLink]}>📍 {event.location}</Text>
            </Pressable>
          ) : null}
          {event.source_name ? (
            <Text style={s.source}>from {event.source_name}</Text>
          ) : null}
        </View>

        {/* Kids — per-kid attendance toggle */}
        {kids.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>Who's going</Text>
            <Text style={s.sectionHint}>
              Turn off to hide this event from a kid's calendar feed.
            </Text>
            {kids.map(k => {
              const attending = overrides[k.id] !== false;
              const saving = savingKidId === k.id;
              return (
                <View key={k.id} style={s.kidAttendRow}>
                  <View style={[s.kidDot, { backgroundColor: k.color || '#00d68f' }]} />
                  <Text
                    style={[s.kidAttendName, !attending && s.kidAttendNameOff]}
                    numberOfLines={1}
                  >
                    {k.name}
                  </Text>
                  {!attending && (
                    <Text style={s.kidAttendTag}>Not going</Text>
                  )}
                  {saving ? (
                    <ActivityIndicator color="#8896b0" style={{ marginLeft: 8 }} />
                  ) : (
                    <Switch
                      value={attending}
                      onValueChange={(v) => setKidAttendance(k.id, v)}
                      trackColor={{ false: '#d9dfe9', true: '#00d68f' }}
                      thumbColor="#ffffff"
                      ios_backgroundColor="#d9dfe9"
                      style={{ marginLeft: 8 }}
                    />
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Description */}
        {event.description ? (
          <View style={s.section}>
            <Text style={s.sectionLabel}>Details</Text>
            <Text style={s.description}>{event.description}</Text>
          </View>
        ) : null}

        {/* Logistics */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Ride coordination</Text>
          <LogisticsSlot
            role="pickup"
            label="Pickup"
            logistics={findLogistics('pickup')}
            saving={savingRole === 'pickup'}
            onAssign={() => openPicker('pickup')}
            onClear={() => clearRole('pickup')}
          />
          <LogisticsSlot
            role="dropoff"
            label="Dropoff"
            logistics={findLogistics('dropoff')}
            saving={savingRole === 'dropoff'}
            onAssign={() => openPicker('dropoff')}
            onClear={() => clearRole('dropoff')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ModalHeader({ onClose, title }) {
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
  if (!logistics) {
    return (
      <Pressable
        onPress={onAssign}
        disabled={saving}
        style={({ pressed }) => [s.slot, s.slotEmpty, pressed && s.slotPressed]}
      >
        {saving ? (
          <ActivityIndicator color="#8896b0" />
        ) : (
          <>
            <Text style={s.slotLabel}>{label}</Text>
            <Text style={s.slotAssign}>+ Assign</Text>
          </>
        )}
      </Pressable>
    );
  }

  const statusColor =
    logistics.status === 'confirmed' ? '#00b377'
    : logistics.status === 'declined' ? '#ef4444'
    : logistics.status === 'requested' ? '#f59e0b'
    : '#8896b0';
  const statusLabel =
    logistics.status === 'confirmed' ? 'Confirmed'
    : logistics.status === 'declined' ? 'Declined'
    : logistics.status === 'requested' ? 'Awaiting reply'
    : 'Assigned';

  return (
    <View style={[s.slot, s.slotFilled]}>
      <View style={s.slotRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.slotLabel}>{label}</Text>
          <Text style={s.slotContactName}>{logistics.contact_name}</Text>
          {logistics.contact_phone ? (
            <Text style={s.slotContactMeta}>{logistics.contact_phone}</Text>
          ) : logistics.contact_email ? (
            <Text style={s.slotContactMeta}>{logistics.contact_email}</Text>
          ) : null}
          <View style={s.statusRow}>
            <View style={[s.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
        {saving ? (
          <ActivityIndicator color="#8896b0" />
        ) : (
          <View style={s.slotActions}>
            <TouchableOpacity onPress={onAssign} style={s.slotBtn}>
              <Text style={s.slotBtnText}>Change</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClear} style={[s.slotBtn, { marginTop: 6 }]}>
              <Text style={[s.slotBtnText, { color: '#ef4444' }]}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f4f6fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#ef4444', fontSize: 14, paddingHorizontal: 24, textAlign: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#e8ecf4',
    backgroundColor: '#ffffff',
  },
  headerClose: { fontSize: 15, color: '#00d68f', fontWeight: '600' },
  headerTitle: { fontSize: 15, fontWeight: '600', color: '#0f1629' },

  titleBlock: {
    backgroundColor: '#ffffff', padding: 20,
    borderBottomWidth: 1, borderBottomColor: '#e8ecf4',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#0f1629', letterSpacing: -0.3, marginBottom: 8 },
  meta:  { fontSize: 14, color: '#4a5670', marginTop: 2 },
  locationLink: { color: '#00b377', textDecorationLine: 'underline' },
  source:{ fontSize: 12, color: '#8896b0', marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

  section: { paddingHorizontal: 20, paddingTop: 24 },
  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: '#8896b0',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
  },
  description: { fontSize: 14, color: '#4a5670', lineHeight: 21 },

  sectionHint: { fontSize: 12, color: '#8896b0', marginTop: -4, marginBottom: 10, lineHeight: 16 },
  kidDot:  { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  kidAttendRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ffffff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: '#e8ecf4', marginBottom: 8,
  },
  kidAttendName: { flex: 1, fontSize: 15, color: '#0f1629', fontWeight: '500' },
  kidAttendNameOff: { color: '#8896b0', textDecorationLine: 'line-through' },
  kidAttendTag: {
    fontSize: 11, color: '#8896b0', fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5, marginRight: 4,
  },

  slot: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#e8ecf4', marginBottom: 10,
  },
  slotEmpty: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderStyle: 'dashed',
  },
  slotPressed: { backgroundColor: '#f4f6fa' },
  slotFilled: {},
  slotRow: { flexDirection: 'row', alignItems: 'flex-start' },
  slotLabel: {
    fontSize: 11, fontWeight: '600', color: '#8896b0',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  slotAssign: { fontSize: 14, color: '#00d68f', fontWeight: '600' },
  slotContactName: { fontSize: 16, fontWeight: '600', color: '#0f1629', marginTop: 4 },
  slotContactMeta: { fontSize: 13, color: '#8896b0', marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusText: { fontSize: 12, fontWeight: '500' },
  slotActions: { alignItems: 'flex-end' },
  slotBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  slotBtnText: { fontSize: 13, color: '#00d68f', fontWeight: '600' },
});
