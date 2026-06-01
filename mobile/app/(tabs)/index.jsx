import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';
import { EventCard } from '../../components/EventCard';

export default function Calendar() {
  const { user } = useAuth();
  const router = useRouter();
  const [events, setEvents]       = useState([]);
  const [overrides, setOverrides] = useState({}); // { [eventId]: { [kidId]: attending } }
  // Onboarding-checklist state. Tracked here (vs. inside the chips
  // component) because the chip checklist replaces the events list
  // entirely for fresh users — same load lifecycle, no extra fetches
  // beyond the three small list endpoints.
  const [kids, setKids]           = useState([]);
  const [sources, setSources]     = useState([]);
  const [contacts, setContacts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      // Five parallel reads. kids/sources/contacts power the chip
      // checklist for fresh users; events/overrides power the normal
      // calendar list once they're set up. All five are small and
      // already-indexed by user_id — cheap enough to fetch on every
      // focus-effect re-run without optimizing.
      const [eventsRes, overridesRes, kidsRes, sourcesRes, contactsRes] = await Promise.all([
        api.get('/api/events?days=30'),
        api.get('/api/overrides'),
        api.get('/api/kids'),
        api.get('/api/sources'),
        api.get('/api/contacts'),
      ]);
      setEvents(eventsRes.events || []);
      const map = {};
      (overridesRes.overrides || []).forEach(o => {
        if (!map[o.event_id]) map[o.event_id] = {};
        map[o.event_id][o.kid_id] = o.attending;
      });
      setOverrides(map);
      setKids(kidsRes.kids || []);
      // Filter out the synthetic __manual__ source — it represents
      // hand-entered events, not a connected calendar feed.
      setSources((sourcesRes.sources || []).filter(s => s.name !== '__manual__'));
      setContacts(contactsRes.contacts || []);
    } catch (err) {
      setError(err.message || 'Could not load events');
    }
  }, []);

  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);

  // Refetch when the screen regains focus (e.g. after closing the event modal)
  // so attendance toggles show up without a pull-to-refresh.
  useFocusEffect(
    useCallback(() => { load(); }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Group events by YYYY-MM-DD so we can show date headers
  const grouped = useMemo(() => {
    const byDay = {};
    for (const ev of events) {
      const d = new Date(ev.starts_at);
      const key = d.toISOString().slice(0, 10);
      if (!byDay[key]) byDay[key] = { date: d, items: [] };
      byDay[key].items.push(ev);
    }
    // Flatten into a list for FlatList with { type: 'header' | 'event' }
    const out = [];
    Object.keys(byDay).sort().forEach(k => {
      out.push({ type: 'header', key: 'h-' + k, date: byDay[k].date });
      byDay[k].items.forEach(ev => out.push({ type: 'event', key: ev.id, event: ev }));
    });
    return out;
  }, [events]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#00d68f" size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>{error}</Text>
        <TouchableOpacity onPress={onRefresh} style={s.retry}>
          <Text style={s.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Calendar-first onboarding for fresh users. The trigger is having
  // no real (non-__manual__) calendar sources — that's the actual gap
  // between "signed up" and "getting value." Kids get auto-created
  // inline as part of the setup-helper conversation when the agent
  // asks "whose schedule is this?" — we deliberately don't make
  // "add a kid first" an explicit step, because parents come here to
  // connect their calendar, not to model their family in an app.
  const hasSources = sources.length > 0;

  if (!hasSources) {
    // 4 chip buttons mirror the setup helper's own chip welcome.
    // Tapping deep-links into /setup with the app pre-selected so
    // the chat opens already on the step-list for that app.
    const calendarChips = [
      { key: 'teamsnap',     label: 'TeamSnap'     },
      { key: 'gamechanger',  label: 'GameChanger'  },
      { key: 'playmetrics',  label: 'PlayMetrics'  },
      { key: 'parentsquare', label: 'ParentSquare' },
      { key: '__other__',    label: 'Other / PDF'  },
    ];
    return (
      <View style={s.root}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.hi}>Hi {user?.name?.split(' ')[0] || 'there'}</Text>
            <Text style={s.sub}>Let's get your kids' sports in one place.</Text>
          </View>
        </View>

        <View style={s.onboardingList}>
          <Text style={s.chipPrompt}>Which app does your team use?</Text>
          {calendarChips.map(chip => (
            <TouchableOpacity
              key={chip.key}
              style={s.appChip}
              activeOpacity={0.8}
              onPress={() => {
                // Route source chips through the tutorial player first;
                // it plays the per-app screen-recording (if bundled) then
                // auto-dismisses into /setup. For "Other / PDF" there's
                // no app-specific tutorial — skip straight to /setup.
                if (chip.key === '__other__') {
                  router.push('/setup');
                  return;
                }
                const next = encodeURIComponent(`/setup?app=${chip.key}`);
                router.push(`/tutorial/${chip.key}?next=${next}`);
              }}
            >
              <Text style={s.appChipLabel}>{chip.label}</Text>
              <Text style={s.appChipArrow}>→</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.hi}>Hi {user?.name?.split(' ')[0] || 'there'}</Text>
          <Text style={s.sub}>
            {events.length === 0
              ? 'Nothing upcoming in the next 30 days.'
              : events.length + ' upcoming event' + (events.length === 1 ? '' : 's')}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/event/new')}
          style={s.addEventBtn}
          activeOpacity={0.7}
          accessibilityLabel="Add a new event"
        >
          <Text style={s.addEventBtnText}>+ Add event</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={grouped}
        keyExtractor={i => i.key}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00d68f" />
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>📅</Text>
            <Text style={s.emptyTitle}>No upcoming events</Text>
            <Text style={s.emptyText}>
              Connect your sports calendars to see games and practices here.
              The setup helper walks you through it in a couple of minutes.
            </Text>
            <TouchableOpacity
              style={s.emptyCta}
              onPress={() => router.push('/setup')}
              activeOpacity={0.8}
            >
              <Text style={s.emptyCtaText}>Open setup helper</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          if (item.type === 'header') return <DayHeader date={item.date} />;
          return <EventCard event={item.event} overrides={overrides[item.event.id] || {}} />;
        }}
      />
    </View>
  );
}

function DayHeader({ date }) {
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  const label = isToday   ? 'Today'
              : isTomorrow ? 'Tomorrow'
              : date.toLocaleDateString(undefined,
                  { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <View style={s.dayHeader}>
      <Text style={s.dayHeaderText}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f4f6fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f4f6fa' },
  header: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
  },
  addEventBtn: {
    backgroundColor: '#00d68f', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    marginTop: 4,
  },
  addEventBtnText: { color: '#0f1629', fontSize: 14, fontWeight: '600' },
  // Hero greeting — bigger and bolder than a typical iOS section title
  // so the Calendar tab feels personal at a glance. Mirrors the design
  // mockups (28px, weight 800).
  hi:     { fontSize: 28, fontWeight: '800', color: '#0f1629', lineHeight: 30 },
  sub:    { fontSize: 13, color: '#8896b0', marginTop: 6 },

  // Calendar-first onboarding styles. Mirrors the /setup chip welcome
  // exactly so a user who taps a chip here lands on a visually
  // identical destination — same buttons, same colors, same shapes.
  onboardingList: {
    paddingHorizontal: 20, paddingTop: 16,
    gap: 12,
  },
  chipPrompt: {
    fontSize: 14, fontWeight: '600', color: '#8896b0',
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginBottom: 8,
  },
  appChip: {
    backgroundColor: '#0f1629',
    paddingHorizontal: 22, paddingVertical: 20,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appChipLabel: { color: '#00d68f', fontSize: 17, fontWeight: '600' },
  appChipArrow: { color: '#00d68f', fontSize: 17, opacity: 0.7 },
  dayHeader: {
    backgroundColor: '#f4f6fa',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6,
  },
  dayHeaderText: {
    fontSize: 11, fontWeight: '600', color: '#8896b0',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  empty: {
    paddingHorizontal: 24, paddingTop: 40, paddingBottom: 60,
    alignItems: 'center',
  },
  emptyEmoji: { fontSize: 36, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#0f1629', marginBottom: 6 },
  emptyText:  { color: '#8896b0', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 18 },
  emptyCta: {
    backgroundColor: '#00d68f', borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 12,
  },
  emptyCtaText: { color: '#0f1629', fontSize: 15, fontWeight: '600' },
  errorText:   { color: '#ff6b6b', fontSize: 14, marginBottom: 16 },
  retry:       { paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#00d68f', borderRadius: 8 },
  retryText:   { color: '#00d68f', fontWeight: '500' },
});
