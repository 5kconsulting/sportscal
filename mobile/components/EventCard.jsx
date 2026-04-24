import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

export function EventCard({ event }) {
  const router = useRouter();
  const d = new Date(event.starts_at);
  const time = event.all_day
    ? 'All day'
    : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  // Kids array comes back as JSON from the /api/events endpoint
  const kids = Array.isArray(event.kids) ? event.kids : [];
  const primaryKid = kids[0];
  const dotColor = primaryKid?.color || '#00d68f';

  return (
    <Pressable
      onPress={() => router.push(`/event/${event.id}`)}
      style={({ pressed }) => [s.card, pressed && s.pressed]}
    >
      <View style={[s.dot, { backgroundColor: dotColor }]} />
      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={2}>
          {event.display_title || event.raw_title}
        </Text>
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

const s = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ffffff', borderRadius: 12,
    padding: 14, marginHorizontal: 16, marginBottom: 8,
    borderWidth: 1, borderColor: '#e8ecf4',
  },
  pressed: { backgroundColor: '#f4f6fa' },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6, marginRight: 12, alignSelf: 'flex-start' },
  title: { fontSize: 15, fontWeight: '600', color: '#0f1629', lineHeight: 20 },
  meta:  { flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' },
  time:  { fontSize: 13, color: '#0f1629', fontWeight: '500' },
  dotSep:   { fontSize: 13, color: '#8896b0', marginHorizontal: 6 },
  location: { fontSize: 13, color: '#8896b0', flexShrink: 1 },
  source:   { fontSize: 11, color: '#8896b0', marginTop: 3 },
  chevron:  { fontSize: 24, color: '#b8c4d8', fontWeight: '300', marginLeft: 8 },
});
