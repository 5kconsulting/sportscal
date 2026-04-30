// Mobile SetupAgent — chat-style helper that walks parents through
// pasting their iCal URLs from sports apps. Mirrors the spirit of
// frontend/src/pages/SetupAgent.jsx but native-feeling on iOS:
//   - keyboard-avoiding chat input pinned to the bottom
//   - assistant / user bubbles
//   - inline system bubbles for "Added 'Tualatin Baseball' for Emma" notices
//
// All Anthropic calls go through POST /api/setup-agent/message — the API
// key lives on Railway, not in this bundle. PDF upload is intentionally
// skipped on mobile; the system prompt redirects users with PDFs to
// sportscalapp.com/setup on a computer.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Alert,
  ActionSheetIOS,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { api } from '../lib/api';

const API_BASE_URL = Constants.expoConfig?.extra?.apiUrl
  || 'https://sportscal-production.up.railway.app';

// ----- helpers --------------------------------------------------------------

function extractAction(text) {
  if (!text) return null;
  const match = text.match(/ACTION:(\{.*?\})/s);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

function stripAction(text) {
  if (!text) return '';
  return text.replace(/ACTION:\{.*?\}/s, '').trim();
}

// ----- screen ---------------------------------------------------------------

export default function SetupAgentScreen() {
  const router = useRouter();
  const scrollRef = useRef(null);
  const inputRef  = useRef(null);

  // messages: { role: 'user'|'assistant'|'system', content: string,
  //             display?: string, error?: boolean, _ingestionId?, _approvable? }
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [booting, setBooting]   = useState(true);
  const [kids, setKids]         = useState([]);

  // Tracks an in-flight ingestion (image upload -> Claude vision -> events).
  // We keep this in a ref so the polling loop has a stable handle even
  // across re-renders, and use the messages array to surface progress
  // bubbles to the user.
  const activeIngestionRef = useRef(null);
  const [busyIngestion, setBusyIngestion] = useState(false);

  // Bootstrap: fetch kids + sources, then drop in a tailored intro message.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let kidsList   = [];
      let sourceCount = 0;
      try {
        const [kidsRes, sourcesRes] = await Promise.all([
          api.get('/api/kids'),
          api.get('/api/sources'),
        ]);
        kidsList    = kidsRes.kids || [];
        sourceCount = (sourcesRes.sources || []).filter(s => s.name !== '__manual__').length;
      } catch {
        // Non-fatal — we can still chat even if we couldn't pre-load context.
      }
      if (cancelled) return;

      setKids(kidsList);

      const kidNames = kidsList.map(k => k.name).join(', ');
      const isNew    = sourceCount === 0;
      const intro = isNew
        ? `Hi${kidsList.length > 0 ? `, I see ${kidsList.length > 1 ? kidsList.length + ' kids' : '1 kid'}: ${kidNames}` : ''}! I'll help you connect your sports calendars. Which apps do you use? (TeamSnap, GameChanger, PlayMetrics, SportsEngine, and others — or paste an iCal URL if you already have one.)`
        : `Hi${kidsList.length > 0 ? ` — I see you already have ${sourceCount} source${sourceCount !== 1 ? 's' : ''} set up` : ''}! Want to add more? Which app are we working with?`;

      setMessages([{ role: 'assistant', content: intro, display: intro }]);
      setBooting(false);
      setTimeout(() => inputRef.current?.focus(), 250);
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-scroll to the newest message every render that changes it.
  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(id);
  }, [messages.length, loading]);

  const sendMessage = useCallback(async (text) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg = { role: 'user', content: trimmed };
    setInput('');
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      // Build the conversation we send to the model from the freshest
      // message list. The functional setMessages above hasn't necessarily
      // committed yet, so derive the API payload manually instead of
      // reading from state.
      const apiMessages = [...messages, userMsg]
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }));

      const { content } = await api.post('/api/setup-agent/message', {
        messages: apiMessages,
        platform: 'mobile',
      });

      const action  = extractAction(content);
      const display = stripAction(content) || (action ? 'Got it!' : 'Sorry, something went wrong. Please try again.');

      setMessages(prev => [...prev, { role: 'assistant', content, display }]);

      if (action) await runAction(action);
    } catch (err) {
      const msg = err.message || 'Setup agent had trouble — please try again.';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: msg,
        display: msg,
        error: true,
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [loading, messages]);

  // ----- Photo intake ------------------------------------------------------
  // User taps the camera icon -> action sheet (Camera / Photo Library /
  // Cancel) -> kid picker (auto-skipped if 1 kid) -> expo-image-picker ->
  // multipart upload to /api/ingestions -> poll for ready_for_review ->
  // confirm bubble with event count -> approve creates a manual source.
  //
  // We surface progress via system bubbles in the chat so the user has a
  // single timeline view of "we're scanning your photo." If anything fails
  // we drop a system bubble with role='system' and error=true.

  async function pickKidForUpload() {
    if (kids.length === 0) {
      Alert.alert(
        'Add a kid first',
        'Add at least one family member from Settings, then come back to scan a schedule.',
      );
      return null;
    }
    if (kids.length === 1) return kids[0];

    return new Promise((resolve) => {
      const options = kids.map(k => k.name).concat('Cancel');
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Whose schedule is this?',
          options,
          cancelButtonIndex: options.length - 1,
        },
        (idx) => {
          if (idx === options.length - 1) resolve(null);
          else resolve(kids[idx]);
        },
      );
    });
  }

  async function pickImageSource() {
    return new Promise((resolve) => {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Add a photo of a schedule',
          options: ['Take photo', 'Choose from library', 'Cancel'],
          cancelButtonIndex: 2,
        },
        (idx) => {
          if (idx === 0) resolve('camera');
          else if (idx === 1) resolve('library');
          else resolve(null);
        },
      );
    });
  }

  async function launchPicker(source) {
    // Permissions are auto-prompted by expo-image-picker on first call.
    // We re-encode to JPEG by passing mediaTypes=Images so iOS converts
    // HEIC photos to JPEG (Claude vision doesn't accept HEIC; the backend
    // would 415 otherwise).
    const opts = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: false,
      // exif: false keeps the upload smaller — we don't need camera metadata.
      exif: false,
      base64: false,
    };
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera access denied', 'Enable camera access in Settings to take a photo.');
        return null;
      }
      const r = await ImagePicker.launchCameraAsync(opts);
      return r.canceled ? null : r.assets?.[0];
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo library access denied', 'Enable photo access in Settings to pick an image.');
      return null;
    }
    const r = await ImagePicker.launchImageLibraryAsync(opts);
    return r.canceled ? null : r.assets?.[0];
  }

  function pushSystem(content, opts = {}) {
    setMessages(prev => [...prev, {
      role: 'system',
      content,
      error: !!opts.error,
      _ingestionId: opts.ingestionId,
      _approvable: !!opts.approvable,
      _eventCount: opts.eventCount,
    }]);
  }

  async function uploadPhotoForIngestion(asset, kid) {
    // expo-image-picker returns a `mimeType` of 'image/jpeg' by default
    // when mediaTypes=Images. Belt-and-suspenders: fall back to jpeg.
    const mime = asset.mimeType || 'image/jpeg';
    const ext  = mime === 'image/png' ? 'png' : 'jpg';

    const form = new FormData();
    form.append('file', {
      // RN's FormData accepts this object shape and pulls bytes from the uri.
      uri:  asset.uri,
      type: mime,
      name: 'schedule.' + ext,
    });
    form.append('kidId', kid.id);

    // The shared api.js helper is JSON-only; we hit fetch directly here so
    // we can send multipart. Auth header still has to come along — read
    // the token from secure storage via the lib's exported getter pattern.
    // Easiest: api.js stores _token internally; we recover it by issuing a
    // hand-rolled fetch that proxies the Authorization header from our lib.
    const tokenHeader = await api.authHeader();
    const res = await fetch(`${API_BASE_URL}/api/ingestions`, {
      method: 'POST',
      headers: {
        Authorization: tokenHeader,
        // Don't set Content-Type — fetch + FormData picks the boundary.
      },
      body: form,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      throw new Error(data.error || `Upload failed (HTTP ${res.status})`);
    }
    return data;
  }

  async function pollIngestion(ingestionId) {
    const startedAt = Date.now();
    // Cap polling at 90 seconds. PDF/image extraction usually completes
    // in <15s; if it goes much longer something's wrong.
    while (Date.now() - startedAt < 90_000) {
      if (activeIngestionRef.current !== ingestionId) {
        // The user kicked off a different ingestion — abandon this poll.
        return null;
      }
      const ing = await api.get(`/api/ingestions/${ingestionId}`);
      if (ing.status === 'ready_for_review') return ing;
      if (ing.status === 'failed') {
        const msg = ing.extraction_error || 'We couldn\'t extract events from that image.';
        throw new Error(msg);
      }
      await new Promise(r => setTimeout(r, 1500));
    }
    throw new Error('Scanning is taking longer than expected. Try again or use the website.');
  }

  async function handleCameraTap() {
    if (busyIngestion || loading || booting) return;

    const kid = await pickKidForUpload();
    if (!kid) return;
    const source = await pickImageSource();
    if (!source) return;
    const asset = await launchPicker(source);
    if (!asset) return;

    setBusyIngestion(true);
    pushSystem(`📷 Scanning ${kid.name}'s schedule…`);
    try {
      const ingestion = await uploadPhotoForIngestion(asset, kid);
      activeIngestionRef.current = ingestion.id;

      const ready = await pollIngestion(ingestion.id);
      if (!ready) return; // superseded

      const count = ready.event_count || (ready.extracted_events || []).length;
      if (count === 0) {
        pushSystem(
          'I couldn\'t find any schedulable events in that photo. Try a clearer shot, or paste an iCal URL instead.',
          { error: true },
        );
        return;
      }
      pushSystem(
        `Found ${count} event${count === 1 ? '' : 's'} in ${kid.name}'s photo. Tap "Add ${count} event${count === 1 ? '' : 's'}" below to save them.`,
        { ingestionId: ingestion.id, approvable: true, eventCount: count },
      );
    } catch (err) {
      pushSystem(err.message || 'Photo scan failed.', { error: true });
    } finally {
      setBusyIngestion(false);
      activeIngestionRef.current = null;
    }
  }

  async function approveIngestion(ingestionId, eventCount) {
    setBusyIngestion(true);
    try {
      const ing = await api.get(`/api/ingestions/${ingestionId}`);
      const events = ing.extracted_events || [];
      if (events.length === 0) {
        pushSystem('No events left to add.', { error: true });
        return;
      }
      await api.post(`/api/ingestions/${ingestionId}/approve`, { events });
      pushSystem(`✅ Added ${eventCount} event${eventCount === 1 ? '' : 's'} to your calendar.`);
    } catch (err) {
      pushSystem(err.message || 'Could not save events.', { error: true });
    } finally {
      setBusyIngestion(false);
    }
  }

  // Actions emitted by the model. Mobile only handles add_source today;
  // request_pdf_upload should never arrive (the system prompt forbids it
  // on mobile) but we defensively redirect just in case the model drifts.
  const runAction = useCallback(async (action) => {
    if (action.action === 'add_source') {
      try {
        const wantedNames = (action.kid_names || []).map(n => String(n).toLowerCase());
        const kidIds = wantedNames
          .map(name => kids.find(k => k.name.toLowerCase() === name))
          .filter(Boolean)
          .map(k => k.id);

        const { source } = await api.post('/api/sources', {
          name: action.name,
          app: action.app,
          fetch_type: 'ical',
          ical_url: action.ical_url,
          kid_ids: kidIds,
        });

        setMessages(prev => [...prev, {
          role: 'system',
          content: `Added "${source?.name || action.name}"`,
        }]);
      } catch (err) {
        setMessages(prev => [...prev, {
          role: 'system',
          content: `Could not add "${action.name}": ${err.message || 'unknown error'}`,
          error: true,
        }]);
      }
      return;
    }

    if (action.action === 'request_pdf_upload') {
      setMessages(prev => [...prev, {
        role: 'system',
        content: 'PDFs aren\'t supported in the mobile app yet. Open sportscalapp.com/setup on a computer to upload PDF schedules.',
        error: true,
      }]);
      return;
    }
  }, [kids]);

  function confirmDone() {
    Alert.alert(
      'Done with setup?',
      'You can come back to the helper anytime from Settings.',
      [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Done', style: 'default', onPress: () => router.back() },
      ],
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={confirmDone} hitSlop={16}>
          <Text style={s.headerClose}>Done</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Setup helper</Text>
        <View style={{ width: 56 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {booting ? (
            <View style={s.bootCenter}>
              <ActivityIndicator color="#00d68f" size="large" />
            </View>
          ) : (
            messages.map((m, i) => (
              <Bubble
                key={i}
                message={m}
                onApprove={m._approvable
                  ? () => approveIngestion(m._ingestionId, m._eventCount)
                  : null}
                approving={busyIngestion}
              />
            ))
          )}
          {loading && <Bubble message={{ role: 'assistant', display: 'Thinking…', _typing: true }} />}
        </ScrollView>

        <View style={s.composer}>
          <TouchableOpacity
            onPress={handleCameraTap}
            disabled={busyIngestion || loading || booting}
            style={[s.cameraBtn, (busyIngestion || loading || booting) && s.cameraBtnDisabled]}
            activeOpacity={0.7}
            accessibilityLabel="Scan a photo of a schedule"
          >
            <Text style={s.cameraBtnIcon}>📷</Text>
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Type a message…"
            placeholderTextColor="#8896b0"
            multiline
            editable={!booting && !loading}
            blurOnSubmit={false}
            returnKeyType="default"
          />
          <TouchableOpacity
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || loading || booting}
            style={[s.sendBtn, (!input.trim() || loading || booting) && s.sendBtnDisabled]}
            activeOpacity={0.7}
          >
            <Text style={s.sendBtnText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ----- bubble ---------------------------------------------------------------

function Bubble({ message, onApprove, approving }) {
  const { role, display, content, error, _typing, _eventCount } = message;
  const text = display || content || '';

  if (role === 'system') {
    return (
      <View style={[s.systemRow, error && s.systemRowError]}>
        <Text style={[s.systemText, error && s.systemTextError]}>{text}</Text>
        {onApprove ? (
          <TouchableOpacity
            style={[s.systemApprove, approving && { opacity: 0.6 }]}
            onPress={onApprove}
            disabled={approving}
            activeOpacity={0.8}
          >
            {approving ? (
              <ActivityIndicator color="#0f1629" size="small" />
            ) : (
              <Text style={s.systemApproveText}>
                Add {_eventCount || ''} event{_eventCount === 1 ? '' : 's'}
              </Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  const isUser = role === 'user';
  return (
    <View style={[s.bubbleRow, isUser ? s.bubbleRowRight : s.bubbleRowLeft]}>
      <View style={[
        s.bubble,
        isUser ? s.bubbleUser : s.bubbleAssistant,
        error && s.bubbleError,
      ]}>
        {_typing ? (
          <ActivityIndicator color="#8896b0" size="small" />
        ) : (
          <Text style={[s.bubbleText, isUser && s.bubbleTextUser]}>{text}</Text>
        )}
      </View>
    </View>
  );
}

// ----- styles ---------------------------------------------------------------

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

  scroll:        { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 20, gap: 8 },
  bootCenter:    { paddingTop: 80, alignItems: 'center' },

  bubbleRow:      { flexDirection: 'row', marginBottom: 2 },
  bubbleRowLeft:  { justifyContent: 'flex-start' },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleAssistant: {
    backgroundColor: '#ffffff',
    borderWidth: 1, borderColor: '#e8ecf4',
    borderTopLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: '#00d68f',
    borderTopRightRadius: 4,
  },
  bubbleError: {
    backgroundColor: 'rgba(255,107,107,0.12)',
    borderColor: 'rgba(255,107,107,0.4)',
  },
  bubbleText:     { fontSize: 15, color: '#0f1629', lineHeight: 21 },
  bubbleTextUser: { color: '#0f1629' },

  systemRow: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0,214,143,0.10)',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, marginVertical: 4, maxWidth: '92%',
    alignItems: 'center', gap: 8,
  },
  systemRowError: { backgroundColor: 'rgba(255,107,107,0.10)' },
  systemText:     { fontSize: 13, color: '#00845b', textAlign: 'center', fontWeight: '500' },
  systemTextError:{ color: '#c44949' },
  systemApprove: {
    backgroundColor: '#00d68f', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8, marginTop: 2,
  },
  systemApproveText: { color: '#0f1629', fontSize: 14, fontWeight: '600' },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 10, gap: 6,
    borderTopWidth: 1, borderTopColor: '#e8ecf4',
    backgroundColor: '#ffffff',
  },
  cameraBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#f4f6fa',
    borderWidth: 1, borderColor: '#e8ecf4',
    alignItems: 'center', justifyContent: 'center',
  },
  cameraBtnDisabled: { opacity: 0.5 },
  cameraBtnIcon:     { fontSize: 18 },
  input: {
    flex: 1,
    backgroundColor: '#f4f6fa', color: '#0f1629', fontSize: 15,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18,
    borderWidth: 1, borderColor: '#e8ecf4',
    maxHeight: 120, minHeight: 40,
  },
  sendBtn: {
    backgroundColor: '#00d68f', borderRadius: 18,
    paddingHorizontal: 18, paddingVertical: 10,
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#b8c4d8' },
  sendBtnText:     { color: '#0f1629', fontSize: 15, fontWeight: '600' },
});
