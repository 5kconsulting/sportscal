# Mobile Calendar Tab Overrides (iOS / Expo)

> **PROJECT:** SportsCal
> **Page Type:** Authenticated in-app calendar tab — the schedule on mobile
> **Surface:** `mobile/app/(tabs)/` + `mobile/components/EventCard.jsx`

> ⚠️ **IMPORTANT:** Rules here **override** `design-system/MASTER.md`.
> Only deviations are documented; for everything else, follow the Master.
> This is the signed-in calendar tab, **not** an App Store marketing page —
> ignore any device-mockup / screenshot-carousel / download-CTA / reviews
> patterns. There is no marketing funnel here.
>
> **Platform law:** Master rules are web-flavored. On native iOS the following
> replace their web equivalents — this is where cross-platform consistency is
> won or lost.

---

## Web-rule → Native-rule translations

| Master (web) rule | Native replacement |
|-------------------|--------------------|
| `cursor:pointer` on clickables | N/A — use `Pressable` with pressed feedback |
| Hover states | **No hover.** Pressed state via opacity/scale + optional haptic |
| Color/opacity hover shift | Press: subtle scale `0.97–0.98`, restore on release |
| Focus rings | VoiceOver focus + `accessibilityLabel`/`Role`/`State` |
| Responsive px breakpoints | Safe-area insets + Dynamic Type, single column |

---

## Page-Specific Rules

### Layout Overrides

- **Single column**, full device width minus safe-area insets. No max-width.
- **Safe areas are mandatory:** top header clears status bar / Dynamic Island;
  the schedule list adds bottom content inset so the last card isn't hidden
  behind the tab bar or the home-indicator gesture area.
- **Bottom tab bar** for top-level navigation, **≤5 items**, icon **+** text
  label, active tab highlighted with primary `#2563EB`. Never nest sub-nav in it.
- Day buckets mirror web: sticky day header + event cards, sorted by local day.

### Spacing Overrides (dense, touch-safe)

- High density like the web dashboard, **but never at the cost of touch size.**
- Cards may sit close (8–12px gaps) as long as every tappable element keeps a
  **≥44×44pt** hit area (use `hitSlop` when the visual glyph is smaller).

### Typography Overrides

- Master DM Sans, loaded via `expo-font` (same family as web → visual parity).
- **Support Dynamic Type** — layouts must not break or truncate critical text at
  the largest accessibility size; prefer wrapping over truncation.
- Event times use tabular figures so the time column stays aligned.

### Color Overrides

- Same tokens as Master/web dashboard so a parent moving phone↔laptop sees the
  **same colors** — per-kid accents, semantic sync/error colors identical.
- Design light **and** dark together (Master supports full dark). Verify text
  contrast independently in dark; borders/dividers must stay visible in both.

### Component / Interaction Overrides

- **EventCard:** `Pressable`; press = scale `0.97` + optional light haptic;
  opens the `event/[id]` modal (registered `presentation: 'modal'`). Gesture
  feedback must track the finger in real time.
- **Swipe actions** on cards must show a clear affordance (icon/label), never a
  hidden mystery gesture. Keep one primary gesture per region to avoid conflict
  with the system back-swipe.
- **Modals/sheets** (`event/[id]`, `contacts/picker`) animate from their trigger
  (slide/scale+fade) for spatial context; support swipe-down to dismiss; confirm
  before dismissing with unsaved changes.
- **Don't block system gestures** (Control Center, back-swipe, home indicator).
- Loading >300ms → skeleton/shimmer rows, not a blocking spinner.
- **Scope note (per CLAUDE.md):** the kid attendance toggle is deferred to M3 —
  do **not** add it here yet. Mobile assigns logistics only; it never triggers
  SMS/email (that's the web-first `notify` flow).

---

## Recommendations

- Motion tier: **subtle** (`--motion 4`). Spring/physics press feedback over
  linear; enter animations from below, exit faster than enter; all interruptible.
- Respect `prefers-reduced-motion` / Reduce Motion — drop scale + shimmer.
- Full-width primary action pinned above the safe-area inset when a screen has a
  single primary action; secondary actions visually subordinate.
- One icon family, consistent stroke width (`@expo/vector-icons`); no emoji as
  structural icons.
