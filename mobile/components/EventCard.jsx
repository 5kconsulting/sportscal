import { View, Text, StyleSheet, Pressable, Animated, PanResponder } from 'react-native';
import { useRouter } from 'expo-router';
import { useMemo, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useSkin } from '../lib/theme';

// Width of the swipe-revealed action. Swipe uses the built-in PanResponder
// (not react-native-gesture-handler) so it ships over-the-air.
const ACTION_W = 88;

// Infer a sport from the title for the chip — clear keyword only, no guessing.
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
// Legible text (dark/white) on a filled kid-color block.
function textOn(hex) {
  const h = String(hex).replace('#', '');
  if (h.length !== 6) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#0f172a' : '#ffffff';
}

export function EventCard({ event, overrides = {} }) {
  const router = useRouter();
  const t = useTheme();
  const { skin } = useSkin();
  const s = useMemo(() => makeStyles(t), [t]);

  // Swipe state — created unconditionally (hooks rules); unused by classic.
  const translateX = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);
  const snap = (open) => {
    openRef.current = open;
    Animated.timing(translateX, { toValue: open ? -ACTION_W : 0, duration: 160, useNativeDriver: false }).start();
  };
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_e, g) => {
      const x = Math.max(-ACTION_W, Math.min(0, (openRef.current ? -ACTION_W : 0) + g.dx));
      translateX.setValue(x);
    },
    onPanResponderRelease: (_e, g) => {
      snap(g.dx < -ACTION_W / 2 || (openRef.current && g.dx < ACTION_W / 2));
    },
  })).current;

  const d = new Date(event.starts_at);
  const time = event.all_day
    ? 'All day'
    : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const timeParts = event.all_day ? [] : time.split(' ');

  const kids = Array.isArray(event.kids) ? event.kids : [];
  const primaryKid = kids[0];
  const kidColor = primaryKid?.color || t.accent;

  const notGoingKids = kids.filter(k => overrides[k.id] === false);
  const allNotGoing = kids.length > 0 && notGoingKids.length === kids.length;
  const someNotGoing = notGoingKids.length > 0 && !allNotGoing;

  const title = event.display_title || event.raw_title;
  // Infer from the source name + location too, not just the title: a soccer
  // feed ("Albion Soccer") whose event title never says "soccer" should still
  // get the sport chip. Keeps sibling events on the same feed consistent.
  const sport = inferSport([title, event.source_name, event.location].filter(Boolean).join(' '));
  const a11yLabel = [title, time, event.location || null, allNotGoing ? 'not attending' : null]
    .filter(Boolean).join(', ');

  const open = () => router.push(`/event/${event.id}`);
  const onCardPress = () => { if (openRef.current) snap(false); else open(); };

  // ---- Beta skin: time-block card (matches web) + swipe-to-assign ----
  if (skin === 'beta') {
    const blockBg = allNotGoing ? '#94a3b8' : kidColor;
    const blockFg = textOn(blockBg);
    return (
      <View style={s.bWrap}>
        <View style={s.bAction}>
          <Pressable
            style={s.bActionBtn}
            onPress={() => { snap(false); open(); }}
            accessibilityRole="button"
            accessibilityLabel="Assign a ride"
          >
            <Ionicons name="car-outline" size={18} color={t.onAccent} />
            <Text style={s.bActionText}>Assign</Text>
          </Pressable>
        </View>
        <Animated.View style={[s.bCard, { transform: [{ translateX }] }]} {...pan.panHandlers}>
          {/* Time block — kid color (whose + when) */}
          <View style={[s.bBlock, { backgroundColor: blockBg }]}>
            {event.all_day ? (
              <Text style={[s.bBlockAllDay, { color: blockFg }]}>All day</Text>
            ) : (
              <>
                <Text style={[s.bBlockTime, { color: blockFg }]} numberOfLines={1} adjustsFontSizeToFit>{timeParts[0]}</Text>
                {timeParts[1] ? <Text style={[s.bBlockAp, { color: blockFg }]} numberOfLines={1}>{timeParts[1]}</Text> : null}
              </>
            )}
          </View>
          <Pressable
            style={[s.bBody, allNotGoing && s.cardDim]}
            onPress={onCardPress}
            accessibilityRole="button"
            accessibilityLabel={a11yLabel}
            accessibilityHint="Opens event details"
          >
            <Text style={[s.bTitle, allNotGoing && s.titleOff]} numberOfLines={1}>{title}</Text>
            <View style={s.bMetaRow}>
              {sport ? (
                <View style={[s.bChip, { backgroundColor: sport.color + '22' }]}>
                  <Text style={[s.bChipText, { color: sport.color }]}>{sport.label}</Text>
                </View>
              ) : null}
              {(primaryKid || event.source_name) ? (
                <Text style={s.bMeta} numberOfLines={1}>
                  {[primaryKid?.name, event.source_name].filter(Boolean).join('  ·  ')}
                </Text>
              ) : null}
              {event.location ? (
                <View style={s.bLoc}>
                  <Ionicons name="location-outline" size={11} color={t.slate} />
                  <Text style={s.bLocText} numberOfLines={1}>{event.location}</Text>
                </View>
              ) : null}
            </View>
            {allNotGoing && <Text style={s.notAttending}>Not attending — hidden from feed</Text>}
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  // ---- Classic skin: unchanged dot card ----
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens event details"
      style={({ pressed }) => [s.card, allNotGoing && s.cardDim, pressed && s.pressed]}
    >
      <View style={[s.dot, { backgroundColor: allNotGoing ? t.slateLight : kidColor }]} />
      <View style={{ flex: 1 }}>
        <Text style={[s.title, allNotGoing && s.titleOff]} numberOfLines={2}>{title}</Text>
        {allNotGoing && (
          <Text style={s.notAttending}>Not attending — hidden from feed</Text>
        )}
        {someNotGoing && (
          <Text style={s.someNotGoing} numberOfLines={1}>
            Not going: {notGoingKids.map(k => k.name).join(', ')}
          </Text>
        )}
        <View style={s.meta}>
          <Text style={s.time}>{time}</Text>
          {event.location ? (
            <>
              <Text style={s.dotSep}>·</Text>
              <Text style={s.location} numberOfLines={1}>{event.location}</Text>
            </>
          ) : null}
        </View>
        {event.source_name ? (
          <Text style={s.source}>{event.source_name}</Text>
        ) : null}
      </View>
      <Text style={s.chevron}>›</Text>
    </Pressable>
  );
}

function makeStyles(t) {
  return StyleSheet.create({
    // shared
    cardDim: { opacity: 0.55 },
    titleOff: { color: t.slate, textDecorationLine: 'line-through' },
    notAttending: {
      fontSize: 10, fontWeight: '700', color: t.slate,
      textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4,
    },
    someNotGoing: { fontSize: 12, color: t.slate, marginTop: 3 },

    // ---- classic dot card ----
    card: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: t.surface, borderRadius: 12,
      padding: 14, marginHorizontal: 16, marginBottom: 8,
      borderWidth: 1, borderColor: t.border,
    },
    pressed: { backgroundColor: t.bg },
    dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6, marginRight: 12, alignSelf: 'flex-start' },
    title: { fontSize: 15, fontWeight: '600', color: t.navy, lineHeight: 20 },
    meta:  { flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' },
    time:  { fontSize: 13, color: t.navy, fontWeight: '500' },
    dotSep:   { fontSize: 13, color: t.slate, marginHorizontal: 6 },
    location: { fontSize: 13, color: t.slate, flexShrink: 1 },
    source:   { fontSize: 11, color: t.slate, marginTop: 3 },
    chevron:  { fontSize: 24, color: t.slateLight, fontWeight: '300', marginLeft: 8 },

    // ---- beta time-block card + swipe ----
    bWrap: {
      marginHorizontal: 12, marginBottom: 10, borderRadius: 14,
      borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, overflow: 'hidden',
    },
    bAction: {
      position: 'absolute', top: 0, right: 0, bottom: 0, width: ACTION_W,
      backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center',
    },
    bActionBtn: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', gap: 3 },
    bActionText: { color: t.onAccent, fontSize: 12, fontWeight: '600' },
    bCard: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: t.surface },
    bBlock: { width: 68, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 8 },
    bBlockTime: { fontSize: 12.5, fontWeight: '800', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
    bBlockAp: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, opacity: 0.9, marginTop: 1 },
    bBlockAllDay: { fontSize: 12, fontWeight: '700' },
    bBody: { flex: 1, minWidth: 0, paddingVertical: 12, paddingHorizontal: 13, justifyContent: 'center', gap: 4 },
    bTitle: { fontSize: 15.5, fontWeight: '600', color: t.navy, letterSpacing: -0.2 },
    bMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
    bChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
    bChipText: { fontSize: 11, fontWeight: '700' },
    bMeta: { fontSize: 12.5, color: t.slate, flexShrink: 1 },
    bLoc: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: t.bg, borderWidth: 1, borderColor: t.border,
      borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, maxWidth: 180,
    },
    bLocText: { fontSize: 11.5, fontWeight: '600', color: t.navy, flexShrink: 1 },
  });
}
