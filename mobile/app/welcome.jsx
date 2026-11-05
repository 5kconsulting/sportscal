// ============================================================
// Welcome carousel — shown once per device on first launch after
// sign-in (see the effect in app/(tabs)/_layout.jsx), and replayable
// from Settings → "Watch the intro".
//
// Each slide is a short muted looping clip recorded from the real app
// (or a mock, for flows that happen outside it, like the iMessage half
// of a group ride ask). Recorder scripts live in
// marketing/video-recorder/videos/welcome-*.js.
//
// Only the visible slide plays; neighbors are mounted (so the swipe
// lands on a ready frame) but paused; everything further away renders
// a static placeholder so we never hold five decoders at once.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';
import { api } from '../lib/api';
import { markTutorialSeen } from '../lib/tutorialSeen';

// Same guard as app/tutorial/[key].jsx: dev clients built before
// expo-video landed crash on import, so degrade to icon placeholders.
let VideoView, useVideoPlayer;
try {
  const v = require('expo-video');
  VideoView      = v.VideoView;
  useVideoPlayer = v.useVideoPlayer;
} catch {}

const SLIDES = [
  {
    key: 'meet',
    icon: 'calendar-outline',
    title: 'Every kid. Every game.\nOne calendar.',
    body: 'SportsCal pulls every team app into one family calendar — and flags it when two kids need to be in two places at once.',
    video: require('../assets/tutorials/welcome-meet.mp4'),
  },
  {
    key: 'calendar',
    icon: 'link-outline',
    title: "Add your team's calendar",
    body: 'Paste the link from TeamSnap, GameChanger, PlayMetrics, or any team app. Takes about a minute.',
    video: require('../assets/tutorials/welcome-calendar.mp4'),
  },
  {
    key: 'coparent',
    icon: 'people-outline',
    title: 'Bring in your co-parent',
    body: 'Invite them by email. You both see the same kids, calendars, and events.',
    video: require('../assets/tutorials/welcome-coparent.mp4'),
  },
  {
    key: 'ride',
    icon: 'car-outline',
    title: 'Ask the team for a ride',
    body: 'One text to every parent on the team. The first yes gets the ride.',
    video: require('../assets/tutorials/welcome-ride.mp4'),
  },
  {
    key: 'bedtime',
    icon: 'moon-outline',
    title: 'Know tomorrow, tonight',
    body: "An 8 PM heads-up with tomorrow's schedule. Time to pack the cleats.",
    video: require('../assets/tutorials/welcome-bedtime.mp4'),
  },
];

export default function Welcome() {
  const router = useRouter();
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const { width, height } = useWindowDimensions();
  const listRef = useRef(null);
  const [index, setIndex] = useState(0);
  // null = still checking; true/false once /api/sources answers.
  const [hasCalendars, setHasCalendars] = useState(null);

  // Mark seen on open, not on finish: someone who swipes away halfway
  // has still seen it, and re-showing it on every launch would be worse.
  useEffect(() => { markTutorialSeen('welcome'); }, []);

  // The last button depends on where the user is: new accounts go
  // straight to adding a calendar; existing users just get dismissed.
  useEffect(() => {
    api.get('/api/sources')
      .then(({ sources }) => {
        setHasCalendars((sources || []).some(x => x.name !== '__manual__'));
      })
      .catch(() => setHasCalendars(true));
  }, []);

  // Phone-shaped 9:16 frame sized to leave room for the copy + buttons.
  const frameW = Math.round(Math.min(width * 0.62, height * 0.5 * (9 / 16)));
  const frameH = Math.round(frameW * (16 / 9));

  const isLast = index === SLIDES.length - 1;

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }

  function goTo(i) {
    listRef.current?.scrollToIndex({ index: i, animated: true });
    setIndex(i);
  }

  function onPrimary() {
    if (!isLast) return goTo(index + 1);
    if (hasCalendars === false) router.replace('/setup');
    else close();
  }

  const primaryLabel = !isLast
    ? 'Next'
    : hasCalendars === false ? 'Add your first calendar' : "Let's go";

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.topBar}>
        {!isLast ? (
          <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Skip intro">
            <Text style={s.skip}>Skip</Text>
          </Pressable>
        ) : <View />}
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        extraData={index}
        renderItem={({ item, index: i }) => (
          <View style={[s.slide, { width }]}>
            <View style={[s.frame, { width: frameW, height: frameH }]}>
              {useVideoPlayer && Math.abs(i - index) <= 1
                ? <SlideVideo source={item.video} active={i === index} />
                : <View style={s.placeholder}><Ionicons name={item.icon} size={44} color={t.slateLight} /></View>}
            </View>
            <Text style={s.title}>{item.title}</Text>
            <Text style={s.body}>{item.body}</Text>
          </View>
        )}
      />

      <View style={s.footer}>
        <View style={s.dots}>
          {SLIDES.map((x, i) => (
            <Pressable key={x.key} onPress={() => goTo(i)} hitSlop={6}
              accessibilityLabel={`Go to slide ${i + 1}`}>
              <View style={[s.dot, i === index && s.dotOn]} />
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={onPrimary}
          style={({ pressed }) => [s.primary, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Text style={s.primaryText}>{primaryLabel}</Text>
        </Pressable>
        {isLast && hasCalendars === false ? (
          <Pressable onPress={close} hitSlop={8} style={s.later}>
            <Text style={s.laterText}>Maybe later</Text>
          </Pressable>
        ) : <View style={s.laterSpacer} />}
      </View>
    </SafeAreaView>
  );
}

function SlideVideo({ source, active }) {
  const player = useVideoPlayer(source, (p) => {
    p.muted = true;
    p.loop = true;
  });

  useEffect(() => {
    if (!player) return;
    if (active) {
      player.currentTime = 0;
      player.play();
    } else {
      player.pause();
    }
  }, [player, active]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

function makeStyles(t) {
  return StyleSheet.create({
    root:    { flex: 1, backgroundColor: t.bg },
    topBar:  { height: 44, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
    skip:    { fontSize: 15, fontWeight: '600', color: t.slate },
    slide:   { alignItems: 'center', paddingHorizontal: 28, paddingTop: 4 },
    frame:   {
      borderRadius: 26, overflow: 'hidden', backgroundColor: t.surface,
      borderWidth: 5, borderColor: t.navy, marginBottom: 24,
      shadowColor: '#0F172A', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 10 },
    },
    placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    title:   { fontSize: 24, fontWeight: '700', color: t.navy, textAlign: 'center', letterSpacing: -0.4, lineHeight: 30 },
    body:    { fontSize: 15, color: t.slate, textAlign: 'center', lineHeight: 22, marginTop: 10, maxWidth: 340 },
    footer:  { paddingHorizontal: 24, paddingBottom: 8, alignItems: 'center' },
    dots:    { flexDirection: 'row', gap: 8, marginBottom: 18 },
    dot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: t.border },
    dotOn:   { width: 22, backgroundColor: t.cta },
    primary: { alignSelf: 'stretch', backgroundColor: t.cta, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    primaryText: { color: t.ctaText, fontSize: 16, fontWeight: '700' },
    later:   { paddingVertical: 12 },
    laterText: { fontSize: 14, color: t.slate, fontWeight: '500' },
    laterSpacer: { height: 44 },
  });
}
