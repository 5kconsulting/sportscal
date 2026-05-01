// "Manage calendars" — mobile parity with web's Sources page.
//
// Lists each connected calendar with the per-row actions parents
// actually need on a phone: sync now, pause/resume, edit (rename
// + change kid assignments), remove. Adding a new calendar still
// happens through /setup (the chat helper) since that flow already
// handles per-app instructions and intake; this screen is for
// "what do I have, and how do I keep it tidy."
//
// URL editing stays web-only on purpose — it's rare, easy to
// fat-finger, and if the URL really did change the simpler answer
// is "Remove + re-add via setup helper."

import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { api } from '../../lib/api';

// Mirrors APP_OPTIONS labels from web. Kept inline (not imported)
// because the mobile app deliberately doesn't pull from frontend/.
const APP_LABELS = {
  teamsnap:         'TeamSnap',
  teamsnapone:      'TeamSnap ONE',
  gamechanger:      'GameChanger',
  playmetrics:      'PlayMetrics',
  teamsideline:     'TeamSideline',
  byga:             'BYGA',
  sportsengine:     'SportsEngine',
  teamreach:        'TeamReach',
  leagueapps:       'LeagueApps',
  demosphere:       'Demosphere',
  '360player':      '360Player',
  sportsyou:        'SportsYou',
  band:             'BAND',
  rankone:          'RankOne',
  google_classroom: 'Google Classroom',
  custom:           'Custom iCal',
};

export default function ManageSources() {
  const router = useRouter();
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);   // id of source currently sync/toggle/delete-ing
  const [error, setError]   = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const { sources } = await api.get('/api/sources');
      // Filter out the synthetic __manual__ source — it represents
      // hand-entered events, not a real calendar feed.
      setSources((sources || []).filter(s => s.name !== '__manual__'));
    } catch (err) {
      setError(err.message || 'Could not load calendars');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        await load();
        if (active) setLoading(false);
      })();
      return () => { active = false; };
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleSync(source) {
    setBusyId(source.id);
    try {
      await api.post(`/api/sources/${source.id}/refresh`);
      // Poll briefly so the user sees "Synced just now" — same idea
      // as the web Sources page, with a smaller attempt budget since
      // the user is staring at a phone.
      const original = source.last_fetched_at;
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const { sources: list } = await api.get('/api/sources');
          const fresh = (list || []).find(s => s.id === source.id);
          if (fresh && fresh.last_fetched_at !== original) {
            setSources(list.filter(s => s.name !== '__manual__'));
            clearInterval(poll);
            setBusyId(null);
            return;
          }
        } catch {}
        if (attempts >= 10) {
          clearInterval(poll);
          setBusyId(null);
        }
      }, 1500);
    } catch (err) {
      Alert.alert('Sync failed', err.message || 'Please try again.');
      setBusyId(null);
    }
  }

  async function handleToggle(source) {
    setBusyId(source.id);
    try {
      const { source: updated } = await api.patch(`/api/sources/${source.id}`, {
        enabled: !source.enabled,
      });
      setSources(s => s.map(x => x.id === source.id ? updated : x));
    } catch (err) {
      Alert.alert('Could not update', err.message || 'Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  function handleDelete(source) {
    const label = source.name || 'this calendar';
    Alert.alert(
      `Remove ${label}?`,
      'All events from this calendar will be deleted. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            setBusyId(source.id);
            try {
              await api.del(`/api/sources/${source.id}`);
              setSources(s => s.filter(x => x.id !== source.id));
            } catch (err) {
              Alert.alert('Could not remove', err.message || 'Please try again.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ModalHeader title="Manage calendars" onClose={() => router.back()} />

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#00d68f" size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.body}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00d68f" />
          }
        >
          {error ? <Text style={s.error}>{error}</Text> : null}

          {sources.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>📅</Text>
              <Text style={s.emptyTitle}>No calendars yet</Text>
              <Text style={s.emptyText}>
                Connect TeamSnap, GameChanger, or any iCal feed and we'll pull
                games and practices into one calendar automatically.
              </Text>
              <TouchableOpacity
                style={s.emptyCta}
                onPress={() => router.replace('/setup')}
                activeOpacity={0.8}
              >
                <Text style={s.emptyCtaText}>Open setup helper</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={s.intro}>
                Tap a calendar to rename it or change which kid it's for.
              </Text>
              {sources.map(src => (
                <SourceCard
                  key={src.id}
                  source={src}
                  busy={busyId === src.id}
                  onSync={() => handleSync(src)}
                  onToggle={() => handleToggle(src)}
                  onEdit={() => router.push(`/sources/${src.id}`)}
                  onDelete={() => handleDelete(src)}
                />
              ))}

              <TouchableOpacity
                style={s.addCalendarBtn}
                onPress={() => router.replace('/setup')}
                activeOpacity={0.7}
              >
                <Text style={s.addCalendarText}>+ Add another calendar</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SourceCard({ source, busy, onSync, onToggle, onEdit, onDelete }) {
  const appLabel = APP_LABELS[source.app] || source.app;
  const hasError = source.last_fetch_status === 'error';
  const paused   = !source.enabled;

  return (
    <TouchableOpacity
      style={[s.card, paused && { opacity: 0.6 }]}
      onPress={onEdit}
      activeOpacity={0.7}
    >
      <View style={s.cardTop}>
        <View style={s.appBadge}>
          <Text style={s.appBadgeText}>{appLabel}</Text>
        </View>
        <Text style={s.cardName} numberOfLines={1}>{source.name}</Text>
      </View>

      {Array.isArray(source.kids) && source.kids.length > 0 ? (
        <View style={s.kidWrap}>
          {source.kids.map(kid => (
            <View
              key={kid.id}
              style={[
                s.kidChip,
                {
                  backgroundColor: (kid.color || '#6366f1') + '22',
                  borderColor:     (kid.color || '#6366f1') + '55',
                },
              ]}
            >
              <Text style={[s.kidChipText, { color: kid.color || '#6366f1' }]}>
                {kid.name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={[s.statusLine, hasError && s.statusError]}>
        {paused
          ? '⏸ Paused — sync skipped until resumed'
          : hasError
            ? `⚠ ${source.last_fetch_error || 'Last fetch failed'}`
            : source.last_fetched_at
              ? `✓ Synced ${timeAgo(source.last_fetched_at)} · ${source.last_event_count || 0} events`
              : 'Not yet synced'}
      </Text>

      <View style={s.actionRow}>
        <ActionBtn label={busy ? '…' : '↻ Sync'}  onPress={onSync}    disabled={busy || paused} />
        <ActionBtn label={paused ? 'Resume' : 'Pause'} onPress={onToggle} disabled={busy} />
        <ActionBtn label="Remove" onPress={onDelete} disabled={busy} danger />
      </View>
    </TouchableOpacity>
  );
}

function ActionBtn({ label, onPress, disabled, danger }) {
  return (
    <TouchableOpacity
      onPress={(e) => { e.stopPropagation?.(); onPress(); }}
      disabled={disabled}
      style={[s.actionBtn, disabled && { opacity: 0.5 }, danger && s.actionBtnDanger]}
      activeOpacity={0.7}
    >
      <Text style={[s.actionBtnText, danger && s.actionBtnTextDanger]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ModalHeader({ title, onClose }) {
  return (
    <View style={s.header}>
      <TouchableOpacity onPress={onClose} hitSlop={16}>
        <Text style={s.headerClose}>Done</Text>
      </TouchableOpacity>
      <Text style={s.headerTitle}>{title}</Text>
      <View style={{ width: 56 }} />
    </View>
  );
}

// Compact "5m ago / 3h ago / 2d ago" formatter — same idea as the web
// helper of the same name. Local copy so this screen has no
// cross-package imports.
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const t = new Date(dateStr).getTime();
  const diffMs = Date.now() - t;
  const min = Math.floor(diffMs / 60000);
  if (min < 1)   return 'just now';
  if (min < 60)  return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)   return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f6fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#e8ecf4',
    backgroundColor: '#ffffff',
  },
  headerClose: { fontSize: 15, color: '#00d68f', fontWeight: '600' },
  headerTitle: { fontSize: 15, fontWeight: '600', color: '#0f1629' },

  body: { padding: 20, paddingBottom: 40 },
  intro: { fontSize: 13, color: '#8896b0', marginBottom: 14, lineHeight: 18 },

  card: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#e8ecf4', marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  appBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    backgroundColor: '#0f1629',
  },
  appBadgeText: {
    color: '#00d68f', fontSize: 10, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  cardName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0f1629' },

  kidWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  kidChip: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12,
    borderWidth: 1,
  },
  kidChipText: { fontSize: 12, fontWeight: '500' },

  statusLine: { fontSize: 12, color: '#8896b0', marginBottom: 12 },
  statusError: { color: '#c5390a' },

  actionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionBtn: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    backgroundColor: '#f4f6fa', borderWidth: 1, borderColor: '#e8ecf4',
  },
  actionBtnText: { fontSize: 13, color: '#0f1629', fontWeight: '500' },
  actionBtnDanger: {
    backgroundColor: 'rgba(255,107,107,0.08)', borderColor: 'rgba(255,107,107,0.3)',
  },
  actionBtnTextDanger: { color: '#c5390a' },

  addCalendarBtn: {
    backgroundColor: '#0f1629', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  addCalendarText: { color: '#00d68f', fontSize: 15, fontWeight: '600' },

  error: {
    color: '#ff6b6b', fontSize: 13, padding: 10,
    backgroundColor: 'rgba(255,107,107,0.08)', borderRadius: 6, marginBottom: 14,
  },

  empty: { paddingVertical: 40, alignItems: 'center' },
  emptyEmoji: { fontSize: 36, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#0f1629', marginBottom: 6 },
  emptyText:  {
    color: '#8896b0', fontSize: 14, textAlign: 'center',
    lineHeight: 20, marginBottom: 18, paddingHorizontal: 12,
  },
  emptyCta: {
    backgroundColor: '#00d68f', borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 12,
  },
  emptyCtaText: { color: '#0f1629', fontSize: 15, fontWeight: '600' },
});
