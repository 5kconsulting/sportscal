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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useShareIntentContext } from 'expo-share-intent';
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

// Distance from the top of our custom header to its bottom border. Used
// below to compute KeyboardAvoidingView's offset; iOS measures KAV
// position from the screen top, so we have to add status-bar inset +
// header height so the keyboard doesn't push the composer off-screen.
const HEADER_HEIGHT = 49;

export default function SetupAgentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Deep-link from the Calendar tab's app chips routes to /setup with
  // ?app=teamsnap (or gamechanger / playmetrics). When set + valid +
  // user is fresh, we auto-tap that chip on mount so the user lands
  // already inside the step-list — saves one redundant tap.
  const params = useLocalSearchParams();
  const deepLinkApp = typeof params.app === 'string' ? params.app : null;
  // ?screenshot=1 from the Calendar tab's "Screenshot of a calendar"
  // chip — auto-fires the photo-library picker on mount so the user
  // skips the chat intro entirely.
  const deepLinkScreenshot = params.screenshot === '1';
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

  // iOS Share Extension hand-off — a parent in Safari/Mail/Photos hits
  // share -> SportsCal. _layout.jsx routes them here; we read the
  // payload from the same global context and process it like a typed
  // message (URL) or a camera capture (image). consumedShareRef ensures
  // we only process each share once even if React re-runs the effect.
  const { shareIntent, hasShareIntent, resetShareIntent } = useShareIntentContext();
  const consumedShareRef = useRef(null);

  // Fresh-user chip-picker state. Mirrors the web /setup pattern: when
  // the user has zero calendars connected AND isn't arriving via a
  // share-intent payload, show 4 big tappable chips (TeamSnap /
  // GameChanger / PlayMetrics / Other-PDF) before the chat starts.
  // Returning users skip straight to the chat intro.
  const [isFreshUser, setIsFreshUser] = useState(null);
  const [appCatalog, setAppCatalog]   = useState(null);
  const FEATURED_APPS = ['teamsnap', 'gamechanger', 'playmetrics', 'parentsquare'];

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

      const isNew = sourceCount === 0;
      setIsFreshUser(isNew);

      // Fresh users see the chip welcome instead of an immediate chat
      // intro. We hold off seeding messages so the welcome renders.
      // Share-intent users skip the chip welcome — they explicitly
      // came here to drop a payload, so jump straight into chat flow.
      if (isNew && !hasShareIntent) {
        setBooting(false);
        return;
      }

      const kidNames = kidsList.map(k => k.name).join(', ');
      const intro = isNew
        ? `Hi${kidsList.length > 0 ? `, I see ${kidsList.length > 1 ? kidsList.length + ' kids' : '1 kid'}: ${kidNames}` : ''}! I'll help you connect your sports calendars. Which apps do you use? (TeamSnap, GameChanger, PlayMetrics, SportsEngine, and others — or paste an iCal URL if you already have one.)`
        : `Hi${kidsList.length > 0 ? ` — I see you already have ${sourceCount} calendar${sourceCount !== 1 ? 's' : ''} set up` : ''}! Want to add more? Which app are we working with?`;

      // Drop a one-time tip about the iOS Share Extension as a system
      // bubble after the intro. Suppress it when the user is arriving
      // *via* a share — they already discovered it. Most parents won't
      // notice the SportsCal target in the share sheet on their own;
      // this hint is the difference between adoption and "oh, I didn't
      // know it could do that."
      const initialMessages = [{ role: 'assistant', content: intro, display: intro }];
      if (!hasShareIntent) {
        initialMessages.push({
          role: 'system',
          content: '💡 Tip: in Safari, Photos, or Mail, tap iOS\'s share button → SportsCal. We\'ll grab the URL or photo and add it for you.',
        });
      }
      setMessages(initialMessages);
      setBooting(false);
      setTimeout(() => inputRef.current?.focus(), 250);
    })();
    return () => { cancelled = true; };
  }, []);

  // Lazy-load the per-app catalog only when we're going to render the
  // chip welcome. Fetched from /api/setup-agent/apps, populated server-
  // side from APP_INSTRUCTIONS in lib/setupAgentPrompt.js — same source
  // of truth as the web variant.
  useEffect(() => {
    if (isFreshUser !== true || appCatalog) return;
    api.get('/api/setup-agent/apps')
      .then(({ apps }) => setAppCatalog(apps))
      .catch(() => setAppCatalog({}));
  }, [isFreshUser, appCatalog]);

  // Deep-link auto-tap: if the Calendar tab sent us here with
  // ?app=teamsnap (etc.), skip the chip welcome and seed the chat
  // with the matching step-list immediately. Guarded on all the
  // preconditions for startWithApp to succeed so we don't fire it
  // with stale state.
  const autoTappedRef = useRef(false);
  useEffect(() => {
    if (autoTappedRef.current) return;
    if (!deepLinkApp || !appCatalog?.[deepLinkApp]) return;
    if (isFreshUser !== true) return;
    if (messages.length > 0) return;
    autoTappedRef.current = true;
    startWithApp(deepLinkApp);
  }, [deepLinkApp, appCatalog, isFreshUser, messages.length]);

  // Screenshot deep-link: the Calendar tab's "Screenshot of a calendar"
  // chip routes here with ?screenshot=1 — auto-fire the photo-library
  // picker so the user skips the chat intro entirely. They already know
  // they want to upload an image; presenting the chip welcome would be
  // an extra tap for nothing. After the picker returns, ingestImageAsset
  // takes over and the user lands in the chat with the upload in flight.
  const autoScreenshotRef = useRef(false);
  useEffect(() => {
    if (autoScreenshotRef.current) return;
    if (!deepLinkScreenshot) return;
    // Wait for bootstrap to finish so kids list is populated (needed
    // for the pickKidForUpload step inside ingestImageAsset).
    if (booting) return;
    autoScreenshotRef.current = true;
    // We bypass pickImageSource (Camera vs Library action sheet) and
    // go straight to the library — the chip is screenshot-specific.
    // ingestImageAsset handles kid-picking and upload internally.
    (async () => {
      const asset = await launchPicker('library');
      if (!asset) return;
      await ingestImageAsset(asset);
    })();
  }, [deepLinkScreenshot, booting]);

  // Chip tap → seed chat with a user message naming the app + an
  // assistant message containing the deterministic step list. Then
  // transition to normal chat flow (the agent has the full
  // APP_INSTRUCTIONS in its system prompt so follow-ups stay coherent).
  function startWithApp(appKey) {
    const info = appCatalog?.[appKey];
    if (!info) return;
    const numberedSteps = (info.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n');
    const noteLine = info.note ? `\n\nTip: ${info.note}` : '';
    const assistantText =
      `Perfect — here's how to find your ${info.label} iCal URL:\n\n` +
      `${numberedSteps}${noteLine}\n\n` +
      `Paste the URL here when you've got it and I'll add it to your account.`;

    setMessages([
      { role: 'user',      content: `I use ${info.label}.` },
      { role: 'assistant', content: assistantText, display: assistantText },
    ]);
    setIsFreshUser(false); // transitions render to the chat view
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  // "Other / PDF" chip tap — drops them into the chat with the
  // standard returning-user prompt so they can type/paste/share
  // whatever they have.
  function startWithChat() {
    const kidNames = kids.map(k => k.name).join(', ');
    const intro = `Hi${kids.length > 0 ? `, I see ${kids.length > 1 ? kids.length + ' kids' : '1 kid'}: ${kidNames}` : ''}! Tell me which app you use or paste an iCal URL — I can also read a PDF schedule if you have one.`;
    const initialMessages = [{ role: 'assistant', content: intro, display: intro }];
    if (!hasShareIntent) {
      initialMessages.push({
        role: 'system',
        content: '💡 Tip: in Safari, Photos, or Mail, tap iOS\'s share button → SportsCal. We\'ll grab the URL or photo and add it for you.',
      });
    }
    setMessages(initialMessages);
    setIsFreshUser(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  // Auto-scroll to the newest message every render that changes it.
  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(id);
  }, [messages.length, loading]);

  // Consume an incoming Share Extension payload once the chat has booted
  // (so kids and the intro message are both ready). URL → simulated user
  // message; image → existing ingestion pipeline. We always call
  // resetShareIntent() in finally so a failure doesn't trap the user in a
  // permanent "open the share again" loop.
  useEffect(() => {
    if (booting || !hasShareIntent || !shareIntent) return;
    // The share-intent context can re-fire while we're mid-process; key
    // off the payload identity to ignore the redundant runs. Falls back
    // to a JSON stringify so an exotic payload still gets de-duped.
    const key = shareIntent.webUrl
      || shareIntent.files?.[0]?.path
      || shareIntent.text
      || JSON.stringify(shareIntent);
    if (consumedShareRef.current === key) return;
    consumedShareRef.current = key;

    (async () => {
      try {
        if (shareIntent.webUrl) {
          // URL share — let the agent handle it as if the user typed it.
          // The system prompt's URL-detection logic will pick it up and
          // emit an add_source ACTION on the next turn.
          await sendMessage(shareIntent.webUrl);
        } else if (shareIntent.files?.[0]) {
          // Photo share — adapt the Share Extension's `path`+`mimeType`
          // shape into the `uri`+`mimeType` asset shape that the rest of
          // the photo pipeline already expects.
          const f = shareIntent.files[0];
          await ingestImageAsset({
            uri:      f.path,
            mimeType: f.mimeType || 'image/jpeg',
          });
        } else if (shareIntent.text) {
          // Plain-text share with no extracted URL — drop it into the
          // chat as a user message; the agent often pulls a URL out of
          // surrounding text on its own.
          await sendMessage(shareIntent.text);
        }
      } finally {
        resetShareIntent();
      }
    })();
  }, [shareIntent, hasShareIntent, booting]);

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

  // Shared between the camera-button flow and the iOS Share Extension
  // hand-off (a parent shares a photo from Photos.app into SportsCal).
  // Caller has already produced an asset with `{ uri, mimeType }`.
  async function ingestImageAsset(asset) {
    const kid = await pickKidForUpload();
    if (!kid) return;

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

  async function handleCameraTap() {
    if (busyIngestion || loading || booting) return;

    const source = await pickImageSource();
    if (!source) return;
    const asset = await launchPicker(source);
    if (!asset) return;

    await ingestImageAsset(asset);
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
        // Resolve kid names → kid IDs. For names that don't match any
        // existing kid, auto-create the kid inline so first-time users
        // never need to "add a kid first" as a separate step — they
        // just answer the agent's "whose schedule?" question and we
        // take care of the rest. Default color is cycled from a small
        // palette based on current kid count; user can change in
        // Settings → Kid calendars later.
        const wantedNames = (action.kid_names || [])
          .map(n => String(n).trim())
          .filter(Boolean);
        const kidIds = [];
        const liveKids = [...kids];
        const palette = ['#ef4444','#3b82f6','#22c55e','#8b5cf6','#f97316','#06b6d4','#ec4899','#eab308'];
        for (const wantedName of wantedNames) {
          const existing = liveKids.find(k => k.name.toLowerCase() === wantedName.toLowerCase());
          if (existing) {
            kidIds.push(existing.id);
            continue;
          }
          try {
            const { kid: newKid } = await api.post('/api/kids', {
              name:  wantedName,
              color: palette[liveKids.length % palette.length],
            });
            kidIds.push(newKid.id);
            liveKids.push(newKid);
          } catch (createErr) {
            setMessages(prev => [...prev, {
              role: 'system',
              content: `Couldn't add "${wantedName}": ${createErr.message || 'unknown error'}`,
              error: true,
            }]);
            // Continue — at least save the source with whatever kids we
            // did resolve, so the user doesn't lose their iCal URL.
          }
        }
        // Refresh local kids state so future actions in this session
        // see the newly-created kids without a page reload.
        if (liveKids.length !== kids.length) setKids(liveKids);

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

  // Chip welcome — fresh users (zero calendars connected) who haven't
  // arrived via share-intent. Matches the web /setup chip-picker
  // pattern: 4 big tappable buttons (TeamSnap / GameChanger /
  // PlayMetrics / Other-PDF) skip the "what do I type?" friction.
  // Returning users + share-intent arrivals fall through to the
  // standard chat view below.
  if (!booting && isFreshUser === true && messages.length === 0) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={confirmDone} hitSlop={16}>
            <Text style={s.headerClose}>Done</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Setup helper</Text>
          <View style={{ width: 56 }} />
        </View>

        <ScrollView contentContainerStyle={s.chipBody} keyboardShouldPersistTaps="handled">
          <Text style={s.chipHeadline}>Which app does your team use?</Text>

          {appCatalog ? (
            <View style={{ flexDirection: 'column', gap: 12 }}>
              {FEATURED_APPS.map(key => {
                const info = appCatalog[key];
                if (!info) return null;
                return (
                  <TouchableOpacity
                    key={key}
                    style={s.chipBtn}
                    onPress={() => startWithApp(key)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.chipBtnText}>{info.label}</Text>
                    <Text style={s.chipBtnArrow}>→</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={s.chipBtn}
                onPress={startWithChat}
                activeOpacity={0.8}
              >
                <Text style={s.chipBtnText}>Other / PDF</Text>
                <Text style={s.chipBtnArrow}>→</Text>
              </TouchableOpacity>
            </View>
          ) : (
            // Reserve the chips' vertical space while the catalog
            // loads (usually <100ms) so the layout doesn't jump.
            <View style={{ height: 280 }} />
          )}
        </ScrollView>
      </SafeAreaView>
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
        // iOS measures keyboardVerticalOffset from the top of the screen
        // to the top of the KAV. The KAV sits below the safe-area top
        // inset + our custom header, so without this the keyboard pushes
        // the composer (camera + input + send) off-screen entirely. The
        // `+ 8` is the small breathing-room buffer we used to have.
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + HEADER_HEIGHT + 8 : 0}
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
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#e8ecf4',
    backgroundColor: '#ffffff',
  },
  headerClose: { fontSize: 15, color: '#00d68f', fontWeight: '600' },
  headerTitle: { fontSize: 15, fontWeight: '600', color: '#0f1629' },

  scroll:        { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 20, gap: 8 },
  bootCenter:    { paddingTop: 80, alignItems: 'center' },

  // Fresh-user chip welcome (mirrors web /setup chip variant). Big
  // tappable buttons, navy-on-mint accent, vertically stacked. No
  // robot illustration, no descriptive paragraphs — just the H1
  // question, 4 chips, that's it.
  chipBody: {
    padding: 24,
    paddingTop: 32,
  },
  chipHeadline: {
    fontSize: 22, fontWeight: '600', color: '#0f1629',
    marginBottom: 24, letterSpacing: -0.3,
  },
  chipBtn: {
    backgroundColor: '#0f1629',
    paddingHorizontal: 22, paddingVertical: 20,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chipBtnText:  { color: '#00d68f', fontSize: 17, fontWeight: '600' },
  chipBtnArrow: { color: '#00d68f', fontSize: 17, opacity: 0.7 },

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

  // Light-green pill for status messages and the share-extension tip.
  // #d8f5e6 + #047a47 from the design mockups — warm muted mint with
  // strong-enough contrast that the green text reads cleanly on it.
  // The bubble visually distinguishes "system / progress" content from
  // the white assistant bubbles around it.
  systemRow: {
    alignSelf: 'center',
    backgroundColor: '#d8f5e6',
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 14, marginVertical: 4, maxWidth: '92%',
    alignItems: 'center', gap: 10,
  },
  systemRowError: { backgroundColor: 'rgba(255,107,107,0.10)' },
  systemText:     { fontSize: 14, color: '#047a47', textAlign: 'center', fontWeight: '500', lineHeight: 19 },
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
