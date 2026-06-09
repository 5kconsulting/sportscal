// Hidden events — Settings → "Hidden events" management screen.
//
// Lists every event the user has hidden via "Remove from SportsCal"
// (button on event detail). Tap a row to restore. Snapshot of the title +
// when-it-was-scheduled lives on the hidden_events row server-side, so this
// works even when the upstream iCal feed has since dropped the event
// entirely.
//
// Swipe-to-restore would be the iOS-native gesture here, but
// react-native-gesture-handler is a native module — adding it requires a
// new EAS build and can't ship via OTA. Tap-to-restore lands today; swipe
// can replace it in a later build if we want.

import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';

export default function HiddenEventsScreen() {
  const router = useRouter();
  const [hidden, setHidden] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restoringId, setRestoringId] = useState(null);

  const load = useCallback(async () => {
    try {
      const { hidden } = await api.get('/api/events/hidden');
      setHidden(hidden || []);
    } catch (err) {
      console.warn('[hidden] load failed:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function confirmRestore(item) {
    Alert.alert(
      'Restore event?',
      `"${item.hidden_title || 'This event'}" will reappear in your calendar on the next refresh.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', onPress: () => doRestore(item) },
      ],
    );
  }

  async function doRestore(item) {
    setRestoringId(item.id);
    // Optimistic remove from list.
    const prev = hidden;
    setHidden(h => h.filter(x => x.id !== item.id));
    try {
      await api.del(`/api/events/hidden/${item.id}`);
    } catch (err) {
      Alert.alert('Could not restore', err.message || 'Try again.');
      setHidden(prev);
    } finally {
      setRestoringId(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={s.center}>
        <ActivityIndicator color="#00d68f" size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color="#00d68f" />
        </TouchableOpacity>
        <Text style={s.title}>Hidden events</Text>
        <View style={{ width: 28 }} />
      </View>

      {hidden.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No hidden events</Text>
          <Text style={s.emptySub}>
            Tap any event in your calendar, then{' '}
            <Text style={{ fontWeight: '600' }}>Remove from SportsCal</Text>{' '}
            to hide it. It'll show up here for restoring.
          </Text>
        </View>
      ) : (
        <FlatList
          data={hidden}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor="#00d68f"
            />
          }
          ListHeaderComponent={
            <Text style={s.listHint}>
              Tap an event to restore it to your calendar.
            </Text>
          }
          renderItem={({ item }) => {
            const restoring = restoringId === item.id;
            return (
              <TouchableOpacity
                style={s.row}
                onPress={() => confirmRestore(item)}
                activeOpacity={0.7}
                disabled={restoring}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={2}>
                    {item.hidden_title || '(Untitled event)'}
                  </Text>
                  <Text style={s.rowSub}>
                    {item.source_name}
                    {item.hidden_starts_at
                      ? ' · was ' + new Date(item.hidden_starts_at).toLocaleDateString(undefined,
                          { weekday: 'short', month: 'short', day: 'numeric' })
                      : ''}
                  </Text>
                </View>
                {restoring
                  ? <ActivityIndicator color="#00d68f" />
                  : <Text style={s.restoreLink}>Restore</Text>}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f4f6fa' },
  center: { flex: 1, backgroundColor: '#f4f6fa', alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#0f1629',
  },
  backBtn: { padding: 4 },
  title:  { color: '#fff', fontSize: 17, fontWeight: '600' },
  empty:  { flex: 1, padding: 32, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#0f1629', marginBottom: 8 },
  emptySub:   { fontSize: 14, color: '#5b6478', lineHeight: 20, textAlign: 'center' },
  listHint:   { fontSize: 13, color: '#5b6478', padding: 16, paddingBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 18,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2e6ee',
  },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#0f1629' },
  rowSub:   { fontSize: 12, color: '#8896b0', marginTop: 3 },
  restoreLink: { fontSize: 14, color: '#00d68f', fontWeight: '600', marginLeft: 12 },
});
