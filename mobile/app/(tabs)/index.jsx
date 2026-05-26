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

  // Onboarding checklist gate. New users land on the Calendar tab with
  // nothing connected — instead of dumping a vague "No upcoming events"
  // empty state on them, walk them through the three setup actions
  // explicitly. Once they have ≥1 kid AND ≥1 calendar (real source,
  // not the synthetic __manual__), the normal Calendar list renders.
  // The 3rd step (drivers) is genuinely optional, reachable from the
  // Carpool tab — we don't gate the dashboard on it.
  const hasKids    = kids.length > 0;
  const hasSources = sources.length > 0;
  const hasDrivers = contacts.length > 0;
  const needsOnboarding = !hasKids || !hasSources;

  if (needsOnboarding) {
    // Personalize headline + subtitle based on progress.
    const kidNames = kids.map(k => k.name).join(' & ');
    const greeting = `Hi ${user?.name?.split(' ')[0] || 'there'}`;
    const subtitle = !hasKids
      ? "Let's set up SportsCal. Start by adding a kid."
      : hasKids && !hasSources
        ? `Nice — ${kidNames} on the team. Now add a calendar.`
        : 'Almost there.';

    return (
      <View style={s.root}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.hi}>{greeting}</Text>
            <Text style={s.sub}>{subtitle}</Text>
          </View>
        </View>

        <View style={s.onboardingList}>
          {/* Step 1: Add a kid */}
          <OnboardingChip
            done={hasKids}
            num={1}
            doneLabel={hasKids ? (kids.length === 1 ? kidNames : `${kids.length} kids — ${kidNames}`) : ''}
            todoLabel="Add your first kid"
            onPress={() => router.push('/kids/new')}
          />

          {/* Step 2: Add a calendar */}
          <OnboardingChip
            done={hasSources}
            num={2}
            doneLabel={hasSources
              ? (sources.length === 1
                  ? `${sources[0].name} connected`
                  : `${sources.length} calendars connected`)
              : ''}
            todoLabel={hasKids
              ? (kids.length === 1
                  ? `Add ${kidNames}'s calendar`
                  : 'Add a calendar')
              : 'Add a calendar'}
            onPress={() => router.push('/setup')}
            // Calendar step depends on a kid existing for proper
            // assignment, but the setup chat handles "no kids" by
            // prompting the user to add one. Still tappable to keep
            // the chips internally consistent — never disabled.
          />

          {/* Step 3: Add a driver (optional, doesn't block dashboard) */}
          <OnboardingChip
            done={hasDrivers}
            num={3}
            doneLabel={hasDrivers
              ? `${contacts.length} ${contacts.length === 1 ? 'driver' : 'drivers'} added`
              : ''}
            todoLabel="Add a carpool driver"
            sublabel="optional"
            onPress={() => router.push('/contacts/new')}
          />
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

// Chip-style onboarding row. When `done`, renders as a green-tinted
// "✓ <doneLabel>" card with no chevron. When not done, renders as a
// dark navy tappable chip matching the chip-welcome pattern on
// /setup and /contacts — same visual language across all first-run
// surfaces so the user learns the shape once.
function OnboardingChip({ done, num, doneLabel, todoLabel, sublabel, onPress }) {
  if (done) {
    return (
      <View style={s.chipDone}>
        <Text style={s.chipDoneCheck}>✓</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.chipDoneLabel} numberOfLines={1}>{doneLabel}</Text>
        </View>
      </View>
    );
  }
  return (
    <TouchableOpacity style={s.chipTodo} onPress={onPress} activeOpacity={0.8}>
      <Text style={s.chipTodoNum}>{num}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.chipTodoLabel} numberOfLines={1}>{todoLabel}</Text>
        {sublabel ? <Text style={s.chipTodoSublabel}>{sublabel}</Text> : null}
      </View>
      <Text style={s.chipTodoArrow}>→</Text>
    </TouchableOpacity>
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

  // Onboarding-checklist styles. Stacked chip cards under the header
  // with same visual language as the chip welcomes on /setup and
  // /contacts. Done chips lose the chevron + flip to a green tint.
  onboardingList: {
    paddingHorizontal: 20, paddingTop: 24,
    gap: 12,
  },
  chipTodo: {
    backgroundColor: '#0f1629',
    paddingHorizontal: 20, paddingVertical: 18,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  chipTodoNum: {
    color: '#00d68f', fontSize: 14, fontWeight: '700',
    width: 22, textAlign: 'center',
    opacity: 0.6,
  },
  chipTodoLabel:    { color: '#00d68f', fontSize: 17, fontWeight: '600' },
  chipTodoSublabel: { color: '#8896b0', fontSize: 12, marginTop: 2 },
  chipTodoArrow:    { color: '#00d68f', fontSize: 17, opacity: 0.7 },

  chipDone: {
    backgroundColor: 'rgba(0,214,143,0.10)',
    borderWidth: 1, borderColor: 'rgba(0,214,143,0.25)',
    paddingHorizontal: 20, paddingVertical: 18,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  chipDoneCheck: {
    color: '#047a47', fontSize: 17, fontWeight: '700',
    width: 22, textAlign: 'center',
  },
  chipDoneLabel: { color: '#047a47', fontSize: 16, fontWeight: '500' },
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
