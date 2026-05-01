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

import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { api } from '../../lib/api';

export default function NewEvent() {
  const router = useRouter();

  const [title, setTitle]     = useState('');
  const [allDay, setAllDay]   = useState(false);
  // Default the date to "now rounded up to the next half hour" so the
  // first-screen state is a plausible event the user just nudges, not
  // 12:00am today which is never what they want.
  const [date, setDate]       = useState(() => roundedNowPlus30());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [location, setLocation] = useState('');
  const [kids, setKids]         = useState([]);
  const [kidIds, setKidIds]     = useState([]);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

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
    setSaving(true);
    setError('');
    try {
      // For all-day events, snap starts_at to the start of the local day
      // so the event renders as "all day" not "12:34am" in calendar feeds.
      const startsAt = allDay ? startOfLocalDay(date) : date;
      await api.post('/api/manual', {
        title:     title.trim(),
        starts_at: startsAt.toISOString(),
        ends_at:   null,
        location:  location.trim() || null,
        all_day:   allDay,
        kid_ids:   kidIds,
        recurrence: 'none',
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
            placeholderTextColor="#b8c4d8"
            autoCapitalize="sentences"
            autoFocus
          />

          <View style={s.allDayRow}>
            <Text style={s.allDayLabel}>All day</Text>
            <Switch
              value={allDay}
              onValueChange={setAllDay}
              trackColor={{ false: '#d9dfe9', true: '#00d68f' }}
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
                  // the user adjusts only the date (and vice versa).
                  const next = new Date(date);
                  next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
                  setDate(next);
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
                      setDate(next);
                    }
                    if (Platform.OS !== 'ios') setShowTimePicker(false);
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
            placeholderTextColor="#b8c4d8"
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

          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color="#0f1629" />
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

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f6fa' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#e8ecf4',
    backgroundColor: '#ffffff',
  },
  headerClose: { fontSize: 15, color: '#00d68f', fontWeight: '600' },
  headerTitle: { fontSize: 15, fontWeight: '600', color: '#0f1629' },

  body: { padding: 20, gap: 4, paddingBottom: 40 },
  label: {
    fontSize: 12, fontWeight: '600', color: '#8896b0',
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginTop: 14, marginBottom: 6,
  },
  input: {
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e8ecf4',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#0f1629',
  },
  pickerBtn: {
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e8ecf4',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  pickerBtnText: { fontSize: 15, color: '#0f1629' },

  allDayRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e8ecf4',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    marginTop: 14,
  },
  allDayLabel: { fontSize: 15, color: '#0f1629', fontWeight: '500' },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e8ecf4',
  },
  chipText: { fontSize: 13, color: '#0f1629', fontWeight: '500' },
  chipTextOn: { color: '#ffffff' },

  error: {
    color: '#ff6b6b', fontSize: 13, padding: 10,
    backgroundColor: 'rgba(255,107,107,0.08)', borderRadius: 6,
  },
  saveBtn: {
    backgroundColor: '#00d68f', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 28,
  },
  saveText: { color: '#0f1629', fontSize: 15, fontWeight: '600' },
});
