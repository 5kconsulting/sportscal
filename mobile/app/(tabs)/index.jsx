import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';
import { EventCard } from '../../components/EventCard';

export default function Calendar() {
  const { user } = useAuth();
  const [events, setEvents]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await api.get('/api/events?days=30');
      setEvents(data.events || []);
    } catch (err) {
      setError(err.message || 'Could not load events');
    }
  }, []);

  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);

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

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.hi}>Hi {user?.name?.split(' ')[0] || 'there'}</Text>
        <Text style={s.sub}>
          {events.length === 0
            ? 'Nothing upcoming in the next 30 days.'
            : events.length + ' upcoming event' + (events.length === 1 ? '' : 's')}
        </Text>
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
            <Text style={s.emptyText}>
              No upcoming events. Add calendar sources on the web app to get started.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          if (item.type === 'header') return <DayHeader date={item.date} />;
          return <EventCard event={item.event} />;
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
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  hi:     { fontSize: 22, fontWeight: '600', color: '#0f1629' },
  sub:    { fontSize: 13, color: '#8896b0', marginTop: 4 },
  dayHeader: {
    backgroundColor: '#f4f6fa',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6,
  },
  dayHeaderText: {
    fontSize: 11, fontWeight: '600', color: '#8896b0',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  empty:       { padding: 40, alignItems: 'center' },
  emptyText:   { color: '#8896b0', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  errorText:   { color: '#ff6b6b', fontSize: 14, marginBottom: 16 },
  retry:       { paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#00d68f', borderRadius: 8 },
  retryText:   { color: '#00d68f', fontWeight: '500' },
});
