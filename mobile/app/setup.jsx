// Mobile SetupAgent — chat-style helper that walks parents through
// pasting the calendar link from their team app. A pasted link is checked
// and added straight away (server: lib/calendarLink.js); "whose schedule
// is this?" comes after, as tappable names. Mirrors the spirit of
// frontend/src/pages/SetupAgent.jsx but native-feeling on iOS:
//   - keyboard-avoiding chat input pinned to the bottom
//   - assistant / user bubbles
//   - inline system bubbles for "Added 'Tualatin Baseball' for Emma" notices
//
// All Anthropic calls go through POST /api/setup-agent/message — the API
// key lives on Railway, not in this bundle. The app can't open PDFs, so
// the chat sends them to the user's forwarding address (add+<token>@…),
// which reads PDF attachments and emails back a review link.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Alert,
  ActionSheetIOS, Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useShareIntentContext } from 'expo-share-intent';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { track } from '../lib/analytics';
import { useTheme } from '../lib/theme';

// Colors handed to kids created from inside the chat, in order.
const KID_PALETTE = ['#ef4444','#3b82f6','#22c55e','#8b5cf6','#f97316','#06b6d4','#ec4899','#eab308'];

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
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
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
  // add+<token>@inbox… — where PDFs go from the phone. Bubbles that show
  // it get a Share / copy button.
  const [inboundAddress, setInboundAddress] = useState('');

  // Tracks an in-flight ingestion (image upload -> Claude vision -> events).
  // We keep this in a ref so the polling loop has a stable handle even
  // across re-renders, and use the messages array to surface progress
  // bubbles to the user.
  const activeIngestionRef = useRef(null);
  const [busyIngestion, setBusyIngestion] = useState(false);

  // The calendar most recently added in this chat. "Whose schedule is
  // this?" — answered by tapping a name or typing one — applies to it.
  const lastSourceRef = useRef(null);
  const addedCountRef = useRef(0);
  // Kids, kept in a ref as well: several async steps (photo upload, the
  // model's follow-up action) create a kid and then need the fresh list
  // before React has re-rendered.
  const kidsRef = useRef([]);
  useEffect(() => { kidsRef.current = kids; }, [kids]);

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
  const FEATURED_APPS = ['teamsnap', 'gamechanger', 'playmetrics', 'parentsquare', 'sportsyou'];

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
        api.get('/api/auth/inbound-address')
          .then(r => { if (!cancelled && r?.address) setInboundAddress(r.address); })
          .catch(() => {});
      } catch {
        // Non-fatal — we can still chat even if we couldn't pre-load context.
      }
      if (cancelled) return;

      setKids(kidsList);
      kidsRef.current = kidsList;

      const isNew = sourceCount === 0;
      setIsFreshUser(isNew);
      track('setup_opened', {
        entry: hasShareIntent ? 'share' : deepLinkScreenshot ? 'screenshot' : deepLinkApp ? `app:${deepLinkApp}` : 'direct',
        first_calendar: isNew,
      });

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
        ? `Hi${kidsList.length > 0 ? `, I see ${kidsList.length > 1 ? kidsList.length + ' kids' : '1 kid'}: ${kidNames}` : ''}! I'll help you add your kids' team schedules. Which app does the team use? (TeamSnap, GameChanger, PlayMetrics, SportsEngine and others.) If you already have the calendar link, just paste it.`
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
      `Here's how to get your ${info.label} calendar link:\n\n` +
      `${numberedSteps}${noteLine}\n\n` +
      `Paste the link here and I'll add it.\n\n` +
      `Can't find it? Tap the camera button below and send a screenshot of the schedule instead.`;
    track('setup_app_steps_shown', { app: appKey });

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
    const pdfLine = inboundAddress
      ? `Got a PDF schedule? Email it to ${inboundAddress} and I'll read it.`
      : 'Got a PDF schedule? Email it to your SportsCal address (in Settings) and I\'ll read it.';
    const intro = `Hi${kids.length > 0 ? `, I see ${kids.length > 1 ? kids.length + ' kids' : '1 kid'}: ${kidNames}` : ''}! Tell me which app your team uses, or paste its calendar link if you have it.\n\nNo team app? Tap the camera button below and send a photo or screenshot of the schedule.\n\n${pdfLine}`;
    track('setup_other_chosen');
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

      const { content, assigned } = await api.post('/api/setup-agent/message', {
        messages: apiMessages,
        platform: 'mobile',
      });

      const action  = extractAction(content);
      const display = stripAction(content) || (action ? 'Got it!' : 'Sorry, something went wrong. Please try again.');

      setMessages(prev => [...prev, { role: 'assistant', content, display }]);

      // A typed answer to "whose schedule is this?" is carried out by the
      // server (lib/assignKids.js); it tells us what it did so we can drop
      // the name buttons and pick up any kid it created.
      if (assigned?.source_id) {
        setMessages(prev => prev.map(m => (m._kidPickerFor === assigned.source_id ? { ...m, _kidPickerFor: null } : m)));
        api.get('/api/kids')
          .then(({ kids: fresh }) => { if (fresh) { kidsRef.current = fresh; setKids(fresh); } })
          .catch(() => {});
      }

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

  // Ask for a first name with the system text prompt (iOS only).
  function askKidName() {
    return new Promise((resolve) => {
      if (Platform.OS !== 'ios' || !Alert.prompt) { resolve(null); return; }
      Alert.prompt(
        'Whose schedule is this?',
        "Your child's first name",
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
          { text: 'Continue', onPress: (value) => resolve((value || '').trim() || null) },
        ],
        'plain-text',
      );
    });
  }

  // Names → kid ids, creating any kid we don't have yet. A parent should
  // never have to leave what they're doing to "add a kid first".
  async function resolveKidIds(names) {
    const wanted = (names || []).map(n => String(n).trim()).filter(Boolean);
    const live = [...kidsRef.current];
    const ids = [];
    for (const name of wanted) {
      const existing = live.find(k => k.name.toLowerCase() === name.toLowerCase());
      if (existing) { ids.push(existing.id); continue; }
      try {
        const { kid: created } = await api.post('/api/kids', {
          name,
          color: KID_PALETTE[live.length % KID_PALETTE.length],
        });
        ids.push(created.id);
        live.push(created);
      } catch (createErr) {
        setMessages(prev => [...prev, {
          role: 'system',
          content: `Couldn't add "${name}": ${createErr.message || 'unknown error'}`,
          error: true,
        }]);
      }
    }
    if (live.length !== kidsRef.current.length) {
      kidsRef.current = live;
      setKids(live);
    }
    return { ids, kids: live.filter(k => ids.includes(k.id)) };
  }

  async function pickKidForUpload() {
    const current = kidsRef.current;
    if (current.length === 0) {
      // Brand-new account: ask for a first name right here and create the
      // kid, instead of sending them off to Settings.
      track('photo_asked_kid_name');
      const name = await askKidName();
      if (!name) {
        if (Platform.OS !== 'ios') {
          Alert.alert('One thing first', 'Type your child\'s first name in the chat, then send the photo again.');
        }
        return null;
      }
      const { kids: made } = await resolveKidIds([name]);
      return made[0] || null;
    }
    if (current.length === 1) return current[0];
    const kids = current;

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
    track('photo_started');
    try {
      const ingestion = await uploadPhotoForIngestion(asset, kid);
      activeIngestionRef.current = ingestion.id;

      const ready = await pollIngestion(ingestion.id);
      if (!ready) return; // superseded

      const count = ready.event_count || (ready.extracted_events || []).length;
      track('photo_scanned', { events: count });
      if (count === 0) {
        pushSystem(
          'I couldn\'t find any events in that photo. Try a clearer shot, or paste the team\'s calendar link instead.',
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
      track('photo_failed', { reason: String(err.message || '').slice(0, 80) });
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
      addedCountRef.current += 1;
      track('photo_approved', { events: eventCount });
      pushSystem(`✅ Added ${eventCount} event${eventCount === 1 ? '' : 's'} to your calendar.`);
    } catch (err) {
      pushSystem(err.message || 'Could not save events.', { error: true });
    } finally {
      setBusyIngestion(false);
    }
  }

  // Put a calendar under one or more kids (by name; unknown names become
  // new kids). Used by the name buttons under "Whose schedule is this?".
  // (A name typed into the chat instead is handled by the server.)
  async function assignKidsToSource(source, names, via) {
    const { ids, kids: assigned } = await resolveKidIds(names);
    if (ids.length === 0) return false;
    try {
      await api.patch(`/api/sources/${source.id}`, { kid_ids: ids });
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'system',
        content: `Couldn't set whose calendar that is: ${err.message || 'unknown error'}`,
        error: true,
      }]);
      return false;
    }
    // Retire the name buttons for this calendar.
    setMessages(prev => prev.map(m => (m._kidPickerFor === source.id ? { ...m, _kidPickerFor: null } : m)));
    track('kid_assigned', { via, kids: assigned.length });
    return assigned.map(k => k.name);
  }

  // A name button was tapped. Shown in the chat as the parent's own reply
  // so the conversation (and what the model sees next turn) stays in step.
  async function chooseKidForSource(sourceId, name, via = 'button') {
    const source = lastSourceRef.current?.id === sourceId ? lastSourceRef.current : { id: sourceId };
    const done = await assignKidsToSource(source, [name], via);
    if (!done) return;
    const reply = `Done. That's ${done.join(' and ')}'s schedule. Got another team to add? Paste its link, or tell me the app.`;
    setMessages(prev => [...prev,
      { role: 'user', content: name },
      { role: 'assistant', content: reply, display: reply },
    ]);
  }

  async function chooseNewKidForSource(sourceId) {
    const name = await askKidName();
    if (name) return chooseKidForSource(sourceId, name, 'new_name');
    if (Platform.OS !== 'ios') setTimeout(() => inputRef.current?.focus(), 50);
  }

  // Actions emitted by the helper (the server's link fast path, or the
  // model). request_pdf_upload should never arrive on mobile (the system
  // prompt forbids it) but we defensively redirect just in case.
  const runAction = useCallback(async (action) => {
    if (action.action === 'add_source') {
      try {
        // Names → ids; names we don't have yet become new kids, so nobody
        // has to "add a kid first".
        const { ids: kidIds } = await resolveKidIds(action.kid_names);

        const { source } = await api.post('/api/sources', {
          name: action.name,
          app: action.app,
          fetch_type: 'ical',
          ical_url: action.ical_url,
          kid_ids: kidIds,
        });

        lastSourceRef.current = source;
        addedCountRef.current += 1;
        track('calendar_added', { app: action.app, has_kid: kidIds.length > 0 });
        const added = [{
          role: 'system',
          content: `✅ Added "${source?.name || action.name}"`,
        }];
        // Added first, asked second: if we don't know whose it is yet,
        // offer the family's names as buttons (typing a name works too).
        if (kidIds.length === 0 && source?.id) {
          added.push({
            role: 'system',
            content: kidsRef.current.length > 0
              ? 'Whose schedule is it? Tap a name.'
              : 'Whose schedule is it? Type their first name below, or tap Add a name.',
            _kidPickerFor: source.id,
          });
        }
        setMessages(prev => [...prev, ...added]);
      } catch (err) {
        track('calendar_add_failed', { app: action.app, reason: String(err.message || '').slice(0, 80) });
        setMessages(prev => [...prev, {
          role: 'system',
          content: `That didn't get added. ${err.message || 'Please try again.'}`,
          error: true,
        }]);
      }
      return;
    }

    if (action.action === 'request_pdf_upload') {
      const text = `Email the PDF to ${inboundAddress || 'your SportsCal address (in Settings)'} and I'll read it. You'll get a link to check the events before anything is added.`;
      setMessages(prev => [...prev, { role: 'assistant', content: text, display: text }]);
      return;
    }
  }, [inboundAddress]);

  function confirmDone() {
    Alert.alert(
      'Done with setup?',
      'You can come back to the helper anytime from Settings.',
      [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Done', style: 'default', onPress: () => {
          track('setup_closed', { added: addedCountRef.current });
          router.back();
        } },
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
              <ActivityIndicator color={t.accent} size="large" />
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
                inboundAddress={inboundAddress}
                kidChoices={m._kidPickerFor ? kids : null}
                onChooseKid={m._kidPickerFor ? (name) => chooseKidForSource(m._kidPickerFor, name) : null}
                onNewKid={m._kidPickerFor ? () => chooseNewKidForSource(m._kidPickerFor) : null}
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
            <Ionicons name="camera-outline" size={20} color={t.navy} />
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Type a message…"
            placeholderTextColor={t.slate}
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

function Bubble({ message, onApprove, approving, inboundAddress, kidChoices, onChooseKid, onNewKid }) {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const { role, display, content, error, _typing, _eventCount } = message;
  const text = display || content || '';
  // Replies that hand over the forwarding address get the same share
  // sheet as Settings (Copy, Mail, …) so it can go straight into a forward.
  const showsAddress = role === 'assistant' && !!inboundAddress && text.includes(inboundAddress);
  async function shareAddress() {
    try { await Share.share({ message: inboundAddress, url: `mailto:${inboundAddress}` }); } catch {}
  }

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
              <ActivityIndicator color={t.ctaText} size="small" />
            ) : (
              <Text style={s.systemApproveText}>
                Add {_eventCount || ''} event{_eventCount === 1 ? '' : 's'}
              </Text>
            )}
          </TouchableOpacity>
        ) : null}
        {kidChoices ? (
          <View style={s.kidChoiceRow}>
            {kidChoices.map(k => (
              <TouchableOpacity
                key={k.id}
                style={[s.kidChoice, { borderColor: k.color || t.accent }]}
                onPress={() => onChooseKid(k.name)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`This is ${k.name}'s schedule`}
              >
                <View style={[s.kidDot, { backgroundColor: k.color || t.accent }]} />
                <Text style={s.kidChoiceText}>{k.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[s.kidChoice, s.kidChoiceNew]}
              onPress={onNewKid}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text style={s.kidChoiceText}>{kidChoices.length > 0 ? 'Someone else' : 'Add a name'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  }

  const isUser = role === 'user';
  return (
    <View style={[s.bubbleRow, isUser ? s.bubbleRowRight : s.bubbleRowLeft]}>
      {!isUser && (
        <Image source={require('../assets/coach.png')} style={s.aiAvatar} accessibilityLabel="Assistant" />
      )}
      <View style={[
        s.bubble,
        isUser ? s.bubbleUser : s.bubbleAssistant,
        error && s.bubbleError,
      ]}>
        {_typing ? (
          <ActivityIndicator color={t.slate} size="small" />
        ) : (
          <Text selectable style={[s.bubbleText, isUser && s.bubbleTextUser]}>{text}</Text>
        )}
        {showsAddress ? (
          <TouchableOpacity onPress={shareAddress} activeOpacity={0.7} style={s.addressBtn}>
            <Ionicons name="share-outline" size={15} color={t.accent} />
            <Text style={s.addressBtnText}>Share / copy address</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

// ----- styles ---------------------------------------------------------------

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
    fontSize: 22, fontWeight: '600', color: t.navy,
    marginBottom: 24, letterSpacing: -0.3,
  },
  chipBtn: {
    backgroundColor: t.navy,
    paddingHorizontal: 22, paddingVertical: 20,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chipBtnText:  { color: t.accentOnDark, fontSize: 17, fontWeight: '600' },
  chipBtnArrow: { color: t.accentOnDark, fontSize: 17, opacity: 0.7 },

  bubbleRow:      { flexDirection: 'row', marginBottom: 2 },
  aiAvatar:       { width: 30, height: 30, marginRight: 8, alignSelf: 'flex-end', marginBottom: 2 },
  bubbleRowLeft:  { justifyContent: 'flex-start' },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleAssistant: {
    backgroundColor: t.surface,
    borderWidth: 1, borderColor: t.border,
    borderTopLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: t.accent,
    borderTopRightRadius: 4,
  },
  bubbleError: {
    backgroundColor: 'rgba(255,107,107,0.12)',
    borderColor: 'rgba(255,107,107,0.4)',
  },
  bubbleText:     { fontSize: 15, color: t.navy, lineHeight: 21 },
  bubbleTextUser: { color: t.onAccent },
  addressBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    marginTop: 10, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999,
    borderWidth: 1, borderColor: t.border, backgroundColor: t.surface,
  },
  addressBtnText: { fontSize: 13, fontWeight: '600', color: t.accent },

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
    backgroundColor: t.cta, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8, marginTop: 2,
  },
  systemApproveText: { color: t.ctaText, fontSize: 14, fontWeight: '600' },
  // Name buttons under "Whose schedule is it?"
  kidChoiceRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  kidChoice: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: t.surface, borderWidth: 1.5, borderRadius: 999,
    paddingHorizontal: 14, minHeight: 40,
  },
  kidChoiceNew:  { borderColor: t.border, borderStyle: 'dashed' },
  kidDot:        { width: 10, height: 10, borderRadius: 5 },
  kidChoiceText: { fontSize: 15, fontWeight: '600', color: t.navy },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 10, gap: 6,
    borderTopWidth: 1, borderTopColor: t.border,
    backgroundColor: t.surface,
  },
  cameraBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: t.bg,
    borderWidth: 1, borderColor: t.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cameraBtnDisabled: { opacity: 0.5 },
  input: {
    flex: 1,
    backgroundColor: t.bg, color: t.navy, fontSize: 15,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18,
    borderWidth: 1, borderColor: t.border,
    maxHeight: 120, minHeight: 40,
  },
  sendBtn: {
    backgroundColor: t.cta, borderRadius: 18,
    paddingHorizontal: 18, paddingVertical: 10,
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: t.slateLight },
  sendBtnText:     { color: t.ctaText, fontSize: 15, fontWeight: '600' },
  });
}
