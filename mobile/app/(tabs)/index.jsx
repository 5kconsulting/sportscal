import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';
import { EventCard } from '../../components/EventCard';
import { useTheme, useSkin } from '../../lib/theme';

export default function Calendar() {
  const { user } = useAuth();
  const router = useRouter();
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
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

  // Group events by YYYY-MM-DD so we can show date headers. The date
  // bucketing needs to match what the user expects to see, which differs
  // between timed and all-day events:
  //   • Timed event (e.g. "Saturday 9am Pacific"): bucket by the LOCAL
  //     calendar date of the event's start moment.
  //   • All-day event (e.g. iCal "DTSTART;VALUE=DATE:20260606"): the
  //     calendar date IS the canonical value — there's no time zone
  //     attached. node-ical parses these as midnight UTC, which a Pacific
  //     user's `toDateString()` would render as the PREVIOUS day. So we
  //     read the UTC date components directly to recover the intended date.
  // Before this fix, both used UTC-truncated grouping (toISOString slice)
  // but DayHeader used local-date for "Today"/"Tomorrow" — inconsistent,
  // and all-day events shipped a day early everywhere west of UTC.
  const grouped = useMemo(() => {
    const byDay = {};
    for (const ev of events) {
      const key = displayDateKey(ev.starts_at, ev.all_day);
      if (!byDay[key]) byDay[key] = { dateKey: key, items: [] };
      byDay[key].items.push(ev);
    }
    // Flatten into a list for FlatList with { type: 'header' | 'event' }
    const out = [];
    Object.keys(byDay).sort().forEach(k => {
      out.push({ type: 'header', key: 'h-' + k, dateKey: byDay[k].dateKey });
      byDay[k].items.forEach(ev => out.push({ type: 'event', key: ev.id, event: ev }));
    });
    return out;
  }, [events]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={t.accent} size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>{error}</Text>
        <TouchableOpacity onPress={onRefresh} style={s.retry}
          accessibilityRole="button" accessibilityLabel="Try again">
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
      { key: 'teamsnap',     label: 'TeamSnap'                  },
      { key: 'gamechanger',  label: 'GameChanger'               },
      { key: 'playmetrics',  label: 'PlayMetrics'               },
      { key: 'parentsquare', label: 'ParentSquare'              },
      // Screenshot route — different shape from the app chips above
      // (method-based, not app-based). Bypasses the tutorial router
      // and jumps straight into the iOS photo library so the user
      // doesn't waste taps if they already have the screenshot saved.
      { key: '__screenshot__', label: 'Screenshot of a calendar' },
      { key: '__other__',    label: 'Other / PDF'                },
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
              accessibilityRole="button"
              accessibilityLabel={chip.label}
              onPress={() => {
                // Route source chips through the tutorial player first;
                // it plays the per-app screen-recording (if bundled) then
                // auto-dismisses into /setup. Special-shape chips bypass
                // the tutorial since they're method-based, not app-based.
                if (chip.key === '__other__') {
                  router.push('/setup');
                  return;
                }
                if (chip.key === '__screenshot__') {
                  // setup.jsx watches for ?screenshot=1 and auto-fires the
                  // photo-library picker on mount, skipping the chat intro
                  // — the user already knows they want to send an image.
                  router.push('/setup?screenshot=1');
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
          accessibilityRole="button"
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} />
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
              accessibilityRole="button"
              accessibilityLabel="Open setup helper"
            >
              <Text style={s.emptyCtaText}>Open setup helper</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          if (item.type === 'header') return <DayHeader dateKey={item.dateKey} />;
          return <EventCard event={item.event} overrides={overrides[item.event.id] || {}} />;
        }}
      />
    </View>
  );
}

// Helpers for date-key math. We pass YYYY-MM-DD strings around (not Date
// objects) because string comparison is unambiguous and dodges the all-day
// timezone trap: an all-day event stored as midnight UTC would render as
// the previous day for any user west of UTC if we converted it through a
// local-Date round trip.
function pad(n) { return String(n).padStart(2, '0'); }

function localDateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function utcDateKey(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Canonical "bucket date" for an event:
//   • All-day events → the UTC date components (which iCal stores as the
//     intended calendar date, with no real time/zone meaning).
//   • Timed events  → the LOCAL date of the start moment.
function displayDateKey(startsAt, allDay) {
  const d = new Date(startsAt);
  return allDay ? utcDateKey(d) : localDateKey(d);
}

function DayHeader({ dateKey }) {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const { skin } = useSkin();
  const today = new Date();
  const todayKey = localDateKey(today);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const tomorrowKey = localDateKey(tomorrow);

  // Reconstruct a Date for pretty-printing (e.g. "Sat, Jun 6"). Building
  // from local year/month/day means the resulting Date is at local midnight
  // on the intended date — toLocaleDateString won't shift it.
  const [y, m, d] = dateKey.split('-').map(Number);
  const displayDate = new Date(y, m - 1, d);

  const isToday    = dateKey === todayKey;
  const isTomorrow = dateKey === tomorrowKey;
  const pretty = displayDate.toLocaleDateString(undefined,
    { weekday: 'short', month: 'short', day: 'numeric' });
  const label = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : pretty;

  // Beta: "Today" gets a tinted pill + the date, per the preview.
  if (skin === 'beta') {
    return (
      <View style={s.bDayHeader}>
        {isToday ? (
          <View style={s.todayPill}><Text style={s.todayPillText}>Today</Text></View>
        ) : null}
        <Text style={s.bDayText}>{isToday ? pretty : label}</Text>
      </View>
    );
  }
  return (
    <View style={s.dayHeader}>
      <Text style={s.dayHeaderText}>{label}</Text>
    </View>
  );
}

function makeStyles(t) {
  return StyleSheet.create({
  root:   { flex: 1, backgroundColor: t.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg },
  header: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
  },
  addEventBtn: {
    backgroundColor: t.cta, borderRadius: 8,
    paddingHorizontal: 14, minHeight: 44,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 4,
  },
  addEventBtnText: { color: t.ctaText, fontSize: 14, fontWeight: '600' },
  // Hero greeting — bigger and bolder than a typical iOS section title
  // so the Calendar tab feels personal at a glance. Mirrors the design
  // mockups (28px, weight 800).
  hi:     { fontSize: 28, fontWeight: '800', color: t.navy, lineHeight: 30 },
  sub:    { fontSize: 13, color: t.slate, marginTop: 6 },

  // Calendar-first onboarding styles. Mirrors the /setup chip welcome
  // exactly so a user who taps a chip here lands on a visually
  // identical destination — same buttons, same colors, same shapes.
  onboardingList: {
    paddingHorizontal: 20, paddingTop: 16,
    gap: 12,
  },
  chipPrompt: {
    fontSize: 14, fontWeight: '600', color: t.slate,
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginBottom: 8,
  },
  appChip: {
    backgroundColor: t.navy,
    paddingHorizontal: 22, paddingVertical: 20,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appChipLabel: { color: t.accentOnDark, fontSize: 17, fontWeight: '600' },
  appChipArrow: { color: t.accentOnDark, fontSize: 17, opacity: 0.7 },
  dayHeader: {
    backgroundColor: t.bg,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6,
  },
  dayHeaderText: {
    fontSize: 11, fontWeight: '600', color: t.slate,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  // beta day header: tinted "Today" pill + normal-case date
  bDayHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6,
  },
  todayPill: {
    backgroundColor: t.accent, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  todayPillText: { color: t.onAccent, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  bDayText: { fontSize: 13, fontWeight: '600', color: t.slate },
  empty: {
    paddingHorizontal: 24, paddingTop: 40, paddingBottom: 60,
    alignItems: 'center',
  },
  emptyEmoji: { fontSize: 36, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: t.navy, marginBottom: 6 },
  emptyText:  { color: t.slate, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 18 },
  emptyCta: {
    backgroundColor: t.cta, borderRadius: 10,
    paddingHorizontal: 18, minHeight: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyCtaText: { color: t.ctaText, fontSize: 15, fontWeight: '600' },
  errorText:   { color: t.danger, fontSize: 14, marginBottom: 16 },
  retry:       { paddingHorizontal: 16, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.accent, borderRadius: 8 },
  retryText:   { color: t.accent, fontWeight: '500' },
  });
}
