// ============================================================
// Skin / theme tokens.
//
// The mobile app has no CSS cascade, so — unlike web's [data-skin]
// remap — colors must flow through this JS palette and re-render on
// toggle. "classic" reproduces the current hardcoded palette exactly;
// "beta" is the opt-in design system (design-system/MASTER.md).
//
// Persisted per-device via expo-secure-store under `sc_skin`, mirroring
// lib/tutorialSeen.js (no new native module). Default is classic, so
// nothing changes until the user opts in from Settings.
//
// Consume with:
//   const t = useTheme();                    // active palette
//   const s = useMemo(() => makeStyles(t), [t]);
// or read { skin, setSkin, toggleSkin } from useSkin().
// ============================================================
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

const KEY = 'sc_skin';

// Shared across skins — the dark chrome navy stays navy in both (matches
// web, where --navy is not remapped under the beta skin), and near-black
// body text reads as navy on both light grounds.
const shared = {
  navy:  '#0f1629',
  white: '#ffffff',
  surface: '#ffffff',
};

const classic = {
  ...shared,
  bg:           '#f4f6fa',
  navyMid:      '#243050',
  slate:        '#8896b0',
  slateLight:   '#b8c4d8',
  border:       '#e8ecf4',
  accent:       '#00d68f', // highlights, active, links, spinners
  accentDim:    '#00b377',
  accentOnDark: '#00d68f', // accent used on the navy chrome
  onAccent:     '#0f1629', // text/icon on an accent fill
  cta:          '#00d68f', // primary action buttons
  ctaText:      '#0f1629',
  danger:       '#ef4444',
};

const beta = {
  ...shared,
  bg:           '#F8FAFC',
  navyMid:      '#334155',
  slate:        '#64748B',
  slateLight:   '#94A3B8',
  border:       '#E4ECFC',
  accent:       '#2563EB', // trust blue
  accentDim:    '#1D4ED8',
  accentOnDark: '#60A5FA', // legible blue on the navy chrome
  onAccent:     '#ffffff', // white on a blue fill
  cta:          '#B45309', // deeper amber — white label text clears WCAG AA (~5:1)
  ctaText:      '#ffffff',
  danger:       '#DC2626',
};

export const palettes = { classic, beta };

const SkinContext = createContext({
  skin: 'classic',
  theme: classic,
  setSkin: () => {},
  toggleSkin: () => {},
});

export function SkinProvider({ children }) {
  const [skin, setSkinState] = useState('classic');

  // SecureStore is async, so the first paint is always classic; if the
  // user opted into beta, we flip once the read resolves (a brief, one-
  // time flash at cold launch only).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const v = await SecureStore.getItemAsync(KEY);
        if (alive && v === 'beta') setSkinState('beta');
      } catch {
        // Non-fatal — fall back to classic.
      }
    })();
    return () => { alive = false; };
  }, []);

  function setSkin(next) {
    setSkinState(next);
    SecureStore.setItemAsync(KEY, next).catch(() => {});
  }

  const value = useMemo(() => ({
    skin,
    theme: palettes[skin] || classic,
    setSkin,
    toggleSkin: () => setSkin(skin === 'beta' ? 'classic' : 'beta'),
  }), [skin]);

  return <SkinContext.Provider value={value}>{children}</SkinContext.Provider>;
}

export function useSkin()  { return useContext(SkinContext); }
export function useTheme() { return useContext(SkinContext).theme; }
