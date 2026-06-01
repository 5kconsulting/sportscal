// ============================================================
// Tutorial video player — full-screen modal route.
//
// Triggered by chip taps elsewhere in the app. URL pattern:
//   /tutorial/<key>?next=<encoded-route>
// e.g. /tutorial/teamsnap?next=%2Fsetup%3Fapp%3Dteamsnap
//
// On video end (or user tapping Skip), router.replace's into
// the `next` route — `replace` (not `push`) so the back stack
// doesn't accumulate tutorial screens.
//
// Videos live in mobile/assets/tutorials/<key>.mp4 and are
// bundled via require() in TUTORIAL_VIDEOS below. If a chip is
// wired to a key that doesn't have a video yet, this route
// short-circuits straight to `next` without rendering anything
// visible — that lets us launch the routing infrastructure
// before every per-app recording is in.
// ============================================================

import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { markTutorialSeen, ONCE_TUTORIALS } from '../../lib/tutorialSeen';

// expo-video adds a native module that's only present in dev clients
// built AFTER 2026-05-31. Older dev clients (and Expo Go) crash on
// import; wrap so the route degrades gracefully to an immediate
// redirect when the module isn't available. Production builds ship
// with the real module, so playback works there.
let VideoView, useVideoPlayer;
try {
  const v = require('expo-video');
  VideoView      = v.VideoView;
  useVideoPlayer = v.useVideoPlayer;
} catch (err) {
  console.warn('[tutorial] expo-video unavailable — videos will skip:', err.message);
}

// Bundled asset map. require()s resolve at Metro bundle time, so the
// .mp4 ends up in the binary. Keep this colocated with the player so
// adding a new tutorial is a single-file diff.
const TUTORIAL_VIDEOS = {
  teamsnap:     require('../../assets/tutorials/onboarding-teamsnap.mp4'),
  gamechanger:  require('../../assets/tutorials/onboarding-gamechanger.mp4'),
  playmetrics:  require('../../assets/tutorials/onboarding-playmetrics.mp4'),
  'add-driver': require('../../assets/tutorials/add-driver.mp4'),
  'setup-team': require('../../assets/tutorials/setup-team.mp4'),
};

export default function TutorialPlayer() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const key  = typeof params.key  === 'string' ? params.key  : null;
  const next = typeof params.next === 'string' ? params.next : '/(tabs)';

  const source = key ? TUTORIAL_VIDEOS[key] : null;
  // canPlay collapses two skip reasons (no native module on older
  // dev clients, no asset for this key) into a single boolean. Both
  // result in an immediate redirect to `next`.
  const canPlay = !!source && !!useVideoPlayer;

  // Mark one-shot tutorials as seen the moment we render them — even
  // if the user skips before the end, we don't want to repeat. The
  // tutorial fires from a "fresh feature" tap; seeing it counts as
  // seeing it, since the user can always re-trigger by re-tapping.
  useEffect(() => {
    if (key && ONCE_TUTORIALS.has(key)) {
      markTutorialSeen(key);
    }
  }, [key]);

  // If no video exists (or no native module), skip straight to next.
  // This lets us ship the routing infrastructure before every per-app
  // recording exists, and keeps older dev clients from crashing.
  useEffect(() => {
    if (!canPlay) {
      router.replace(next);
    }
  }, [canPlay, next]);

  // useVideoPlayer is only callable when expo-video is loaded.
  // React's rules-of-hooks normally forbid conditional hook calls,
  // but here the condition is determined at module load (whether
  // expo-video resolved or not), not per-render, so it's stable
  // across the component's entire lifetime.
  const player = canPlay
    ? useVideoPlayer(source, (p) => {
        if (!p) return;
        p.muted = true;
        p.loop  = false; // single play, then auto-dismiss
        p.play();
      })
    : null;

  // Auto-dismiss on playbackStatus reaching the end. expo-video emits
  // a `playToEnd` event for this.
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener('playToEnd', () => {
      router.replace(next);
    });
    return () => sub?.remove?.();
  }, [player, next]);

  if (!canPlay) {
    // Brief flash before the redirect effect fires; show a spinner so
    // the screen isn't blank.
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color="#00d68f" size="large" />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        nativeControls={false}
      />
      {/* Skip button — bottom-center, large hitSlop. Top-right would
          collide with the iPhone notch/Dynamic Island on most devices. */}
      <SafeAreaView style={styles.skipWrap} edges={['bottom']} pointerEvents="box-none">
        <Pressable
          onPress={() => router.replace(next)}
          style={({ pressed }) => [styles.skip, pressed && { opacity: 0.7 }]}
          hitSlop={16}
          accessibilityLabel="Skip tutorial"
        >
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1629',
  },
  video: {
    flex: 1,
    width: '100%',
  },
  loading: {
    flex: 1,
    backgroundColor: '#0f1629',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 24,
  },
  skip: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 24,
  },
  skipText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
