// "+ Add event" modal — manual one-off event entry on mobile.
//
// Mirrors web's AddEventModal but trimmed to the parent-task essentials
// for tonight: title, date+time (or all-day), location, kid multi-select.
// Description, end-time, and recurrence are intentionally web-only for now
// — the use case is "just add Tuesday's pickup at 3pm," not "set up a
// 12-week recurring weekly soccer practice with detailed notes." Parents
// who need those advanced fields can edit on web.
//
// POSTs to /api/manual which already handles all of the above; we just
// don't expose every input. Backend is unchanged.

import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { api } from '../../lib/api';
import { useTheme } from '../../lib/theme';

export default function NewEvent() {
  const router = useRouter();
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const [title, setTitle]     = useState('');
  const [allDay, setAllDay]   = useState(false);
  // Whether this event goes into the family iCal feed. Default true
  // (shared) matches behavior before the column existed and matches
  // the common case of adding a soccer practice that the whole family
  // needs to see. Toggle off for personal stuff — doctor visits,
  // date nights — that should stay in SportsCal only.
  const [shareWithFamily, setShareWithFamily] = useState(true);
  // Default the date to "now rounded up to the next half hour" so the
  // first-screen state is a plausible event the user just nudges, not
  // 12:00am today which is never what they want.
  const [date, setDate]       = useState(() => roundedNowPlus30());
  // Default end-time to start + 90 min — typical practice/game length.
  // Subsequent start-time changes shift end by the same delta so the
  // user's duration customization survives. Direct edits to end-time
  // re-anchor the delta naturally.
  const [endDate, setEndDate] = useState(() => addMinutes(roundedNowPlus30(), 90));
  const [showDatePicker, setShowDatePicker]   = useState(false);
  const [showTimePicker, setShowTimePicker]   = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [location, setLocation] = useState('');
  const [kids, setKids]         = useState([]);
  const [kidIds, setKidIds]     = useState([]);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  // Keep end-time tracking start-time when the user adjusts start (so
  // duration stays the same). Direct edits to end go through setEndDate.
  function updateStart(newStart) {
    const delta = endDate.getTime() - date.getTime();
    setDate(newStart);
    setEndDate(new Date(newStart.getTime() + delta));
  }

  useEffect(() => {
    let cancelled = false;
    api.get('/api/kids')
      .then(({ kids }) => {
        if (cancelled) return;
        const list = kids || [];
        setKids(list);
        // If only one kid on the account, auto-select — saves a tap for
        // the most common single-kid case.
        if (list.length === 1) setKidIds([list[0].id]);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function toggleKid(id) {
    setKidIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSave() {
    if (!title.trim()) { setError('Title is required.'); return; }
    if (kidIds.length === 0 && kids.length > 0) {
      setError('Pick at least one kid this event is for.');
      return;
    }
    if (!allDay && endDate.getTime() <= date.getTime()) {
      setError('End time must be after start time.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // For all-day events, snap starts_at to the start of the local day
      // so the event renders as "all day" not "12:34am" in calendar feeds.
      const startsAt = allDay ? startOfLocalDay(date) : date;
      const endsAt   = allDay ? null               : endDate.toISOString();
      await api.post('/api/manual', {
        title:     title.trim(),
        starts_at: startsAt.toISOString(),
        ends_at:   endsAt,
        location:  location.trim() || null,
        all_day:   allDay,
        kid_ids:   kidIds,
        recurrence: 'none',
        is_private: !shareWithFamily,
      });
      router.back();
    } catch (err) {
      setError(err.message || 'Could not save event');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ModalHeader title="Add event" onClose={() => router.back()} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          {error ? <Text style={s.error}>{error}</Text> : null}

          <Text style={s.label}>Title *</Text>
          <TextInput
            style={s.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Soccer practice"
            placeholderTextColor={t.slateLight}
            autoCapitalize="sentences"
            autoFocus
          />

          <View style={s.allDayRow}>
            <Text style={s.allDayLabel}>All day</Text>
            <Switch
              value={allDay}
              onValueChange={setAllDay}
              trackColor={{ false: '#d9dfe9', true: t.accent }}
              thumbColor="#ffffff"
              ios_backgroundColor="#d9dfe9"
            />
          </View>

          <Text style={s.label}>Date</Text>
          <TouchableOpacity
            style={s.pickerBtn}
            onPress={() => setShowDatePicker(v => !v)}
            activeOpacity={0.7}
          >
            <Text style={s.pickerBtnText}>{formatDate(date)}</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={date}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(_, picked) => {
                if (picked) {
                  // Preserve the time-of-day from the current state when
                  // the user adjusts only the date. updateStart shifts
                  // the end-time by the same delta to preserve duration.
                  const next = new Date(date);
                  next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
                  updateStart(next);
                }
                if (Platform.OS !== 'ios') setShowDatePicker(false);
              }}
            />
          )}

          {!allDay && (
            <>
              <Text style={s.label}>Start time</Text>
              <TouchableOpacity
                style={s.pickerBtn}
                onPress={() => setShowTimePicker(v => !v)}
                activeOpacity={0.7}
              >
                <Text style={s.pickerBtnText}>{formatTime(date)}</Text>
              </TouchableOpacity>
              {showTimePicker && (
                <DateTimePicker
                  value={date}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, picked) => {
                    if (picked) {
                      const next = new Date(date);
                      next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
                      updateStart(next);
                    }
                    if (Platform.OS !== 'ios') setShowTimePicker(false);
                  }}
                />
              )}

              <Text style={s.label}>End time</Text>
              <TouchableOpacity
                style={s.pickerBtn}
                onPress={() => setShowEndTimePicker(v => !v)}
                activeOpacity={0.7}
              >
                <Text style={s.pickerBtnText}>
                  {formatTime(endDate)}
                  {!sameDay(date, endDate) ? ' (next day)' : ''}
                </Text>
              </TouchableOpacity>
              {showEndTimePicker && (
                <DateTimePicker
                  value={endDate}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, picked) => {
                    if (picked) {
                      // Anchor end-time on the same calendar day as start,
                      // unless the picked time is earlier — in which case
                      // assume the next day (e.g. 11pm start + 1am end).
                      const next = new Date(date);
                      next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
                      if (next.getTime() <= date.getTime()) {
                        next.setDate(next.getDate() + 1);
                      }
                      setEndDate(next);
                    }
                    if (Platform.OS !== 'ios') setShowEndTimePicker(false);
                  }}
                />
              )}
            </>
          )}

          <Text style={s.label}>Location (optional)</Text>
          <TextInput
            style={s.input}
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Tualatin Community Park, Field 4"
            placeholderTextColor={t.slateLight}
          />

          {kids.length > 0 && (
            <>
              <Text style={s.label}>Who's going *</Text>
              <View style={s.chipWrap}>
                {kids.map(kid => {
                  const on = kidIds.includes(kid.id);
                  const color = kid.color || '#6366f1';
                  return (
                    <TouchableOpacity
                      key={kid.id}
                      onPress={() => toggleKid(kid.id)}
                      style={[
                        s.chip,
                        on && { backgroundColor: color, borderColor: color },
                      ]}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.chipText, on && s.chipTextOn]}>
                        {on ? '✓ ' : ''}{kid.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Derive the names of the currently-selected kids to label
              the "only show in <kid>'s calendar" state. Falls back to a
              generic phrase before the user picks any kid. */}
          {(() => {
            const selectedNames = kids
              .filter(k => kidIds.includes(k.id))
              .map(k => k.name);
            const possessive = selectedNames.length === 0
              ? "your kid's"
              : selectedNames.length === 1
                ? `${selectedNames[0]}'s`
                : selectedNames.length === 2
                  ? `${selectedNames[0]} and ${selectedNames[1]}'s`
                  : `${selectedNames.slice(0, -1).join(', ')}, and ${selectedNames.slice(-1)[0]}'s`;
            return (
              <View style={s.allDayRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={s.allDayLabel}>
                    {shareWithFamily ? 'Share with family' : `Only show in ${possessive} calendar`}
                  </Text>
                  <Text style={s.shareHint}>
                    {shareWithFamily
                      ? 'Adds to the calendar feed your family subscribes to.'
                      : `Stays out of the family feed but still appears in ${possessive} per-kid feed.`}
                  </Text>
                </View>
                <Switch
                  value={shareWithFamily}
                  onValueChange={setShareWithFamily}
                  trackColor={{ false: '#d9dfe9', true: t.accent }}
                  thumbColor="#ffffff"
                  ios_backgroundColor="#d9dfe9"
                />
              </View>
            );
          })()}

          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color={t.ctaText} />
              : <Text style={s.saveText}>Save event</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ----- helpers --------------------------------------------------------------

function roundedNowPlus30() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 30);
  // Round up to the next 15-min mark so the default time looks intentional.
  const m = d.getMinutes();
  d.setMinutes(m + ((15 - (m % 15)) % 15), 0, 0);
  return d;
}

function addMinutes(d, minutes) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() + minutes);
  return x;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate()  === b.getDate();
}

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatDate(d) {
  return d.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatTime(d) {
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric', minute: '2-digit',
  });
}

function ModalHeader({ title, onClose }) {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={s.header}>
      <TouchableOpacity onPress={onClose} hitSlop={16}>
        <Text style={s.headerClose}>Cancel</Text>
      </TouchableOpacity>
      <Text style={s.headerTitle}>{title}</Text>
      <View style={{ width: 56 }} />
    </View>
  );
}

function makeStyles(t) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: t.border,
    backgroundColor: t.surface,
  },
  headerClose: { fontSize: 15, color: t.accent, fontWeight: '600' },
  headerTitle: { fontSize: 15, fontWeight: '600', color: t.navy },

  body: { padding: 20, gap: 4, paddingBottom: 40 },
  label: {
    fontSize: 12, fontWeight: '600', color: t.slate,
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginTop: 14, marginBottom: 6,
  },
  input: {
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: t.navy,
  },
  pickerBtn: {
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  pickerBtnText: { fontSize: 15, color: t.navy },

  allDayRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    marginTop: 14,
  },
  allDayLabel: { fontSize: 15, color: t.navy, fontWeight: '500' },
  shareHint:   { fontSize: 12, color: t.slate, marginTop: 2, lineHeight: 16 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
  },
  chipText: { fontSize: 13, color: t.navy, fontWeight: '500' },
  chipTextOn: { color: '#ffffff' },

  error: {
    color: t.danger, fontSize: 13, padding: 10,
    backgroundColor: 'rgba(255,107,107,0.08)', borderRadius: 6,
  },
  saveBtn: {
    backgroundColor: t.cta, borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 28,
  },
  saveText: { color: t.ctaText, fontSize: 15, fontWeight: '600' },
  });
}
