// Edit a single calendar source: name + iCal URL + kid assignments.
//
// We expose the iCal URL because real users hit cases where the URL
// they entered during onboarding had a typo, or their league/team
// rotated the calendar token, or they want to swap to a different
// season's feed without losing the kid-assignment history. "Remove
// and re-add via setup helper" is a real workaround but a fairly
// punishing one — losing override + edit history is too much for a
// single character that needs fixing.
//
// `app` and `fetch_type` editing stays web-only — those decisions
// are tightly coupled to URL pattern and getting them wrong silently
// breaks the feed. Web's edit screen has more guardrails for that.

import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../lib/api';

export default function EditSource() {
  const { id }  = useLocalSearchParams();
  const router  = useRouter();

  const [source, setSource]   = useState(null);
  const [name, setName]       = useState('');
  const [icalUrl, setIcalUrl] = useState('');
  const [kids, setKids]       = useState([]);
  const [kidIds, setKidIds]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get(`/api/sources/${id}`),
      api.get('/api/kids'),
    ])
      .then(([srcRes, kidsRes]) => {
        if (cancelled) return;
        const src = srcRes.source;
        if (!src) {
          setError('Calendar not found.');
          return;
        }
        setSource(src);
        setName(src.name || '');
        setIcalUrl(src.ical_url || '');
        // Source's `kids` is the populated array; pull just the ids.
        setKidIds((src.kids || []).map(k => k.id));
        setKids(kidsRes.kids || []);
      })
      .catch(err => { if (!cancelled) setError(err.message || 'Could not load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  function toggleKid(kidId) {
    setKidIds(prev => prev.includes(kidId) ? prev.filter(x => x !== kidId) : [...prev, kidId]);
  }

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return; }

    // Only validate iCal URL shape if this source actually has one
    // (scrape-only sources have ical_url=null; we don't want to force
    // them to fabricate one to save a name change). Backend accepts
    // webcal:// and https:// as equivalent — match that here.
    const trimmedUrl = icalUrl.trim();
    if (source?.ical_url && trimmedUrl) {
      const normalized = trimmedUrl.replace(/^webcal:\/\//i, 'https://');
      try { new URL(normalized); }
      catch {
        setError('That doesn\'t look like a valid URL. iCal links start with https:// or webcal://');
        return;
      }
    }

    setSaving(true);
    setError('');
    try {
      const patch = {
        name:    name.trim(),
        kid_ids: kidIds,
      };
      // Only send ical_url if the source had one originally — avoids
      // accidentally setting it on a scrape-only source where the
      // field is irrelevant.
      if (source?.ical_url !== null && source?.ical_url !== undefined) {
        patch.ical_url = trimmedUrl || null;
      }
      await api.patch(`/api/sources/${id}`, patch);
      router.back();
    } catch (err) {
      setError(err.message || 'Could not save changes');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <ModalHeader title="Edit calendar" onClose={() => router.back()} />
        <View style={s.center}><ActivityIndicator color="#00d68f" size="large" /></View>
      </SafeAreaView>
    );
  }

  if (error && !source) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <ModalHeader title="Edit calendar" onClose={() => router.back()} />
        <View style={s.center}>
          <Text style={s.error}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ModalHeader title="Edit calendar" onClose={() => router.back()} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          {error ? <Text style={s.errorBanner}>{error}</Text> : null}

          <Text style={s.label}>Name *</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Emma's soccer"
            placeholderTextColor="#b8c4d8"
            autoCapitalize="sentences"
          />
          <Text style={s.help}>
            Just for your reference — this is how the calendar shows up in
            this list and in event details.
          </Text>

          {kids.length > 0 ? (
            <>
              <Text style={s.label}>Whose calendar is this?</Text>
              <View style={s.chipWrap}>
                {kids.map(kid => {
                  const on    = kidIds.includes(kid.id);
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
              <Text style={s.help}>
                Pick one or more. We use this to label events ("Emma — Soccer
                Practice") and to power the per-kid calendar links.
              </Text>
            </>
          ) : null}

          {/* iCal URL — editable for ical-based sources, read-only for
              scrape-only sources (no ical_url to begin with). */}
          {source?.ical_url !== null && source?.ical_url !== undefined ? (
            <>
              <Text style={s.label}>iCal URL</Text>
              <TextInput
                style={[s.input, s.urlInput]}
                value={icalUrl}
                onChangeText={setIcalUrl}
                placeholder="https://… or webcal://…"
                placeholderTextColor="#b8c4d8"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                multiline
              />
              <Text style={s.help}>
                The iCal link from your sports app. If a typo broke this,
                fix it here and we'll re-fetch the calendar.
              </Text>
            </>
          ) : source?.scrape_url ? (
            <View style={s.metaCard}>
              <Text style={s.metaLabel}>Source URL (scrape)</Text>
              <Text style={s.metaValue} numberOfLines={2}>
                {source.scrape_url}
              </Text>
              <Text style={s.metaHelp}>
                This calendar uses a scraping strategy that's web-only to
                edit. Remove and re-add via the setup helper if needed.
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color="#0f1629" />
              : <Text style={s.saveText}>Save changes</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#e8ecf4',
    backgroundColor: '#ffffff',
  },
  headerClose: { fontSize: 15, color: '#00d68f', fontWeight: '600' },
  headerTitle: { fontSize: 15, fontWeight: '600', color: '#0f1629' },

  body: { padding: 20, paddingBottom: 40 },
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
  // URL fields wrap in a monospace font + smaller size so long iCal
  // tokens are readable and the textarea doesn't dominate the screen.
  urlInput: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12, lineHeight: 18,
    minHeight: 60,
  },
  help: { fontSize: 12, color: '#8896b0', marginTop: 6, lineHeight: 16 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e8ecf4',
  },
  chipText: { fontSize: 13, color: '#0f1629', fontWeight: '500' },
  chipTextOn: { color: '#ffffff' },

  metaCard: {
    backgroundColor: '#ffffff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: '#e8ecf4', marginTop: 24,
  },
  metaLabel: {
    fontSize: 11, fontWeight: '600', color: '#8896b0',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6,
  },
  metaValue: {
    fontSize: 12, color: '#4a5670',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  metaHelp: { fontSize: 12, color: '#8896b0', marginTop: 8, lineHeight: 16 },

  errorBanner: {
    color: '#ff6b6b', fontSize: 13, padding: 10,
    backgroundColor: 'rgba(255,107,107,0.08)', borderRadius: 6,
  },
  error: { color: '#ff6b6b', fontSize: 14, textAlign: 'center' },
  saveBtn: {
    backgroundColor: '#00d68f', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 28,
  },
  saveText: { color: '#0f1629', fontSize: 15, fontWeight: '600' },
});
