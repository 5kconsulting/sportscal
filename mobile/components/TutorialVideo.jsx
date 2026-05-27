// ============================================================
// TutorialVideo — short looping onboarding clip rendered inline
// inside the SetupAgent chat.
//
// Per-app videos live in mobile/assets/tutorials/*.mp4 and are
// bundled with the app (each clip ~600KB, so 5-6 clips adds a few
// MB to the binary — worth it for offline-first playback). The
// catalog maps an appKey to the require'd asset; missing entries
// just render nothing (the Bubble component gracefully degrades
// to text-only instructions).
//
// Playback:
//   - autoplay + loop muted (no user gesture needed on iOS)
//   - native controls hidden so the bubble stays clean
//   - aspect ratio preserved; we cap height so a portrait phone
//     screenshot doesn't dominate the chat
// ============================================================

import { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

// Bundled-asset map. require() at module load so Metro picks them
// up at bundle time; refs are static for the bundle's lifetime.
export const TUTORIAL_VIDEOS = {
  teamsnap: require('../assets/tutorials/onboarding-teamsnap.mp4'),
  // Add other apps' tutorials here as we record them.
  // gamechanger: require('../assets/tutorials/onboarding-gamechanger.mp4'),
  // playmetrics: require('../assets/tutorials/onboarding-playmetrics.mp4'),
};

export function hasTutorial(appKey) {
  return !!TUTORIAL_VIDEOS[appKey];
}

export default function TutorialVideo({ appKey, maxHeight = 360 }) {
  const source = TUTORIAL_VIDEOS[appKey];
  // If we don't have a video for this app yet, render nothing so
  // the surrounding bubble can fall back to text-only instructions.
  if (!source) return null;

  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  // Defensive cleanup: when the component unmounts (e.g. modal
  // dismissal), pause so background audio resources are released.
  useEffect(() => {
    return () => { try { player.pause(); } catch {} };
  }, [player]);

  return (
    <View style={[styles.wrapper, { maxHeight }]}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    aspectRatio: 9 / 19.5, // matches iPhone Pro Max portrait
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0f1629',
    marginVertical: 4,
  },
  video: {
    width: '100%',
    height: '100%',
  },
});
