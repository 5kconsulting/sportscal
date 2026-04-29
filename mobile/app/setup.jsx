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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '../lib/api';

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
  //             display?: string, error?: boolean }
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [booting, setBooting]   = useState(true);
  const [kids, setKids]         = useState([]);

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
            messages.map((m, i) => <Bubble key={i} message={m} />)
          )}
          {loading && <Bubble message={{ role: 'assistant', display: 'Thinking…', _typing: true }} />}
        </ScrollView>

        <View style={s.composer}>
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

function Bubble({ message }) {
  const { role, display, content, error, _typing } = message;
  const text = display || content || '';

  if (role === 'system') {
    return (
      <View style={[s.systemRow, error && s.systemRowError]}>
        <Text style={[s.systemText, error && s.systemTextError]}>{text}</Text>
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
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, marginVertical: 4, maxWidth: '90%',
  },
  systemRowError: { backgroundColor: 'rgba(255,107,107,0.10)' },
  systemText:     { fontSize: 13, color: '#00845b', textAlign: 'center', fontWeight: '500' },
  systemTextError:{ color: '#c44949' },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
    borderTopWidth: 1, borderTopColor: '#e8ecf4',
    backgroundColor: '#ffffff',
  },
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
