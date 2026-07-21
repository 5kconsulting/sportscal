// My kids — a color-card overview. Per-kid stats are real:
//   calendar_count comes from /api/kids (kid_sources count),
//   upcoming + the 7-day sparkline are derived client-side from
//   /api/events (which already resolves each event's kids correctly),
// so we don't duplicate the title_contains / assigned_kid_ids precedence.

import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { useTheme } from '../../lib/theme';

function textOn(hex) {
  const h = String(hex).replace('#', '');
  if (h.length !== 6) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#0f172a' : '#ffffff';
}
function dayKey(d) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }

function Header() {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const router = useRouter();
  return (
    <View style={s.header}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={16}>
        <Text style={s.headerClose}>Done</Text>
      </TouchableOpacity>
      <Text style={s.headerTitle}>My kids</Text>
      <View style={{ width: 44 }} />
    </View>
  );
}

export default function MyKids() {
  const router = useRouter();
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [kids, setKids] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [kRes, eRes] = await Promise.all([
        api.get('/api/kids'),
        api.get('/api/events?days=30'),
      ]);
      setKids(kRes.kids || []);
      setEvents(eRes.events || []);
    } catch {
      // non-fatal; screen shows whatever loaded
    }
  }, []);

  useFocusEffect(useCallback(() => { load().finally(() => setLoading(false)); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Per-kid: total upcoming (30d) + a 7-day per-day count for the sparkline.
  const { byKid, days } = useMemo(() => {
    const now = new Date();
    const d7 = [];
    for (let i = 0; i < 7; i++) { const d = new Date(now); d.setDate(now.getDate() + i); d7.push(dayKey(d)); }
    const map = {};
    for (const ev of events) {
      const evKids = Array.isArray(ev.kids) ? ev.kids : [];
      const k = dayKey(new Date(ev.starts_at));
      for (const kid of evKids) {
        if (!map[kid.id]) map[kid.id] = { upcoming: 0, spark: Object.fromEntries(d7.map(x => [x, 0])) };
        map[kid.id].upcoming += 1;
        if (k in map[kid.id].spark) map[kid.id].spark[k] += 1;
      }
    }
    return { byKid: map, days: d7 };
  }, [events]);

  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <Header />
        <View style={s.center}><ActivityIndicator color={t.accent} size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <Header />
      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} />}
      >
        {kids.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="people-outline" size={30} color={t.slate} />
            <Text style={s.emptyTitle}>No kids yet</Text>
            <Text style={s.emptySub}>Add a kid to start organizing their schedule.</Text>
          </View>
        ) : kids.map(k => {
          const color = k.color || t.accent;
          const fg = textOn(color);
          const st = byKid[k.id] || { upcoming: 0, spark: {} };
          const cal = k.calendar_count ?? 0;
          const vals = days.map(d => st.spark[d] || 0);
          const maxV = Math.max(1, ...vals);
          const barBg = fg === '#ffffff' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.28)';
          return (
            <TouchableOpacity
              key={k.id}
              style={[s.kidCard, { backgroundColor: color }]}
              activeOpacity={0.9}
              onPress={() => router.push(`/kids/${k.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${k.name}, ${cal} calendars, ${st.upcoming} upcoming`}
            >
              <Ionicons name="person" size={110} color={fg} style={s.wm} />
              <Ionicons name="chevron-forward" size={20} color={fg} style={s.chev} />
              <View style={s.krow}>
                <View style={[s.kav, { backgroundColor: fg === '#ffffff' ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.12)' }]}>
                  <Text style={[s.kavTxt, { color: fg }]}>{(k.name || '?')[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.kname, { color: fg }]} numberOfLines={1}>{k.name}</Text>
                  <Text style={[s.kmeta, { color: fg }]}>
                    {cal} {cal === 1 ? 'calendar' : 'calendars'} · {st.upcoming} upcoming
                  </Text>
                </View>
              </View>
              <View style={s.spark}>
                {vals.map((v, i) => (
                  <View key={i} style={[s.sparkBar, { height: 6 + (v / maxV) * 20, backgroundColor: barBg }]} />
                ))}
              </View>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity style={s.addBtn} onPress={() => router.push('/kids/new')} activeOpacity={0.85}>
          <Ionicons name="add" size={18} color={t.ctaText} />
          <Text style={s.addBtnText}>Add a kid</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(t) {
  return StyleSheet.create({
    root:   { flex: 1, backgroundColor: t.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: t.border, backgroundColor: t.surface,
    },
    headerClose: { fontSize: 15, color: t.accent, fontWeight: '600' },
    headerTitle: { fontSize: 15, fontWeight: '600', color: t.navy },

    empty: { alignItems: 'center', gap: 6, paddingVertical: 60, paddingHorizontal: 24 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: t.navy, marginTop: 4 },
    emptySub: { fontSize: 13, color: t.slate, textAlign: 'center', lineHeight: 18 },

    kidCard: { position: 'relative', borderRadius: 18, padding: 16, marginBottom: 10, overflow: 'hidden' },
    wm: { position: 'absolute', right: -14, bottom: -24, opacity: 0.16 },
    chev: { position: 'absolute', top: 16, right: 14, opacity: 0.85 },
    krow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    kav: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    kavTxt: { fontSize: 20, fontWeight: '800' },
    kname: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
    kmeta: { fontSize: 12.5, fontWeight: '600', marginTop: 1, opacity: 0.92 },
    spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 28, marginTop: 13 },
    sparkBar: { flex: 1, borderRadius: 2 },

    addBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: t.cta, borderRadius: 12, paddingVertical: 14, marginTop: 6,
    },
    addBtnText: { color: t.ctaText, fontSize: 15, fontWeight: '700' },
  });
}
