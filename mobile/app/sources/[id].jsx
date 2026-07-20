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

import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { useTheme } from '../../lib/theme';

export default function EditSource() {
  const { id }  = useLocalSearchParams();
  const router  = useRouter();
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const [source, setSource]   = useState(null);
  const [name, setName]       = useState('');
  const [icalUrl, setIcalUrl] = useState('');
  const [kids, setKids]       = useState([]);
  // Rich kid assignments: [{ kid_id, title_contains }]. title_contains is
  // empty when the kid attends every event from this source. Non-empty
  // means "this kid only on events whose title contains the substring."
  // See db/index.js filterKidsByEventTitle for the matching semantics.
  const [kidAssignments, setKidAssignments] = useState([]);
  const [showSplit, setShowSplit] = useState(false);
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
        const initialAssignments = (src.kids || []).map(k => ({
          kid_id:         k.id,
          title_contains: k.title_contains || '',
        }));
        setKidAssignments(initialAssignments);
        // Default the split section open if the source already has
        // per-kid patterns — otherwise the user wouldn't realize
        // they're set.
        setShowSplit(initialAssignments.some(a => a.title_contains));
        setKids(kidsRes.kids || []);
      })
      .catch(err => { if (!cancelled) setError(err.message || 'Could not load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  function isKidSelected(kidId) {
    return kidAssignments.some(a => a.kid_id === kidId);
  }

  function toggleKid(kidId) {
    setKidAssignments(prev => prev.some(a => a.kid_id === kidId)
      ? prev.filter(a => a.kid_id !== kidId)
      : [...prev, { kid_id: kidId, title_contains: '' }]);
  }

  function setKidPattern(kidId, pattern) {
    setKidAssignments(prev => prev.map(a =>
      a.kid_id === kidId ? { ...a, title_contains: pattern } : a
    ));
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
        name:            name.trim(),
        // Rich shape: kid + optional per-event title pattern. Empty
        // pattern → backend stores NULL → kid attends every event.
        kid_assignments: kidAssignments.map(a => ({
          kid_id:         a.kid_id,
          title_contains: a.title_contains.trim() || null,
        })),
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
        <View style={s.center}><ActivityIndicator color={t.accent} size="large" /></View>
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
            placeholderTextColor={t.slateLight}
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
                  const on    = isKidSelected(kid.id);
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
                      <View style={s.chipInner}>
                        {on ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                        <Text style={[s.chipText, on && s.chipTextOn]}>
                          {kid.name}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={s.help}>
                Pick one or more. We use this to label events ("Emma — Soccer
                Practice") and to power the per-kid calendar links.
              </Text>

              {/* Per-kid title pattern split. Only matters when 2+ kids are
                  on the source — for one kid there's nothing to split.
                  Collapsed by default since most users have one team per
                  calendar and never need this. */}
              {kidAssignments.length >= 2 ? (
                <>
                  <TouchableOpacity
                    onPress={() => setShowSplit(v => !v)}
                    activeOpacity={0.7}
                    style={{ marginTop: 14 }}
                  >
                    <View style={s.disclosureRow}>
                      <Ionicons
                        name={showSplit ? 'chevron-down' : 'chevron-forward'}
                        size={13}
                        color={t.accent}
                      />
                      <Text style={s.disclosure}>
                        Multi-kid feed? Split events by title
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {showSplit ? (
                    <View style={s.splitCard}>
                      <Text style={s.splitHelp}>
                        If this feed mixes events for multiple kids (like a club
                        calendar with both teams), enter a unique substring from
                        each team's title. Example: "BU13" for your son's team,
                        "GU15" for your daughter's. Leave blank if a kid attends
                        every event.
                      </Text>
                      {kidAssignments.map(a => {
                        const kid = kids.find(k => k.id === a.kid_id);
                        if (!kid) return null;
                        const color = kid.color || '#6366f1';
                        return (
                          <View key={a.kid_id} style={s.splitRow}>
                            <Text style={[s.splitKidLabel, { color }]} numberOfLines={1}>
                              {kid.name}
                            </Text>
                            <TextInput
                              style={s.splitInput}
                              value={a.title_contains}
                              onChangeText={t => setKidPattern(a.kid_id, t)}
                              placeholder="e.g. BU13 (or blank)"
                              placeholderTextColor={t.slateLight}
                              autoCapitalize="characters"
                              autoCorrect={false}
                            />
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </>
              ) : null}
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
                placeholderTextColor={t.slateLight}
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
              ? <ActivityIndicator color={t.ctaText} />
              : <Text style={s.saveText}>Save changes</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
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
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: t.border,
      backgroundColor: t.surface,
    },
    headerClose: { fontSize: 15, color: t.accent, fontWeight: '600' },
    headerTitle: { fontSize: 15, fontWeight: '600', color: t.navy },

    body: { padding: 20, paddingBottom: 40 },
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
    // URL fields wrap in a monospace font + smaller size so long iCal
    // tokens are readable and the textarea doesn't dominate the screen.
    urlInput: {
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 12, lineHeight: 18,
      minHeight: 60,
    },
    help: { fontSize: 12, color: t.slate, marginTop: 6, lineHeight: 16 },

    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
      backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    },
    chipInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    chipText: { fontSize: 13, color: t.navy, fontWeight: '500' },
    chipTextOn: { color: '#ffffff' },

    // Per-kid title pattern split UI — collapsed by default, expands to a
    // boxed help text + one input row per assigned kid.
    disclosureRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    disclosure: {
      fontSize: 13, color: t.accent, fontWeight: '600',
    },
    splitCard: {
      marginTop: 10,
      backgroundColor: t.surface,
      borderRadius: 10,
      borderWidth: 1, borderColor: t.border,
      paddingHorizontal: 14, paddingVertical: 12,
    },
    splitHelp: {
      fontSize: 12, color: t.slate, lineHeight: 17, marginBottom: 10,
    },
    splitRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      marginTop: 8,
    },
    splitKidLabel: {
      width: 84, fontSize: 14, fontWeight: '600',
    },
    splitInput: {
      flex: 1,
      backgroundColor: t.bg,
      borderWidth: 1, borderColor: t.border,
      borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 8,
      fontSize: 13, color: t.navy,
    },

    metaCard: {
      backgroundColor: t.surface, borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 12,
      borderWidth: 1, borderColor: t.border, marginTop: 24,
    },
    metaLabel: {
      fontSize: 11, fontWeight: '600', color: t.slate,
      textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6,
    },
    metaValue: {
      fontSize: 12, color: t.slate,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    metaHelp: { fontSize: 12, color: t.slate, marginTop: 8, lineHeight: 16 },

    errorBanner: {
      color: t.danger, fontSize: 13, padding: 10,
      backgroundColor: 'rgba(255,107,107,0.08)', borderRadius: 6,
    },
    error: { color: t.danger, fontSize: 14, textAlign: 'center' },
    saveBtn: {
      backgroundColor: t.cta, borderRadius: 10,
      paddingVertical: 14, alignItems: 'center', marginTop: 28,
    },
    saveText: { color: t.ctaText, fontSize: 15, fontWeight: '600' },
  });
}
