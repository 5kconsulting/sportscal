# SportsCal — Redesign Plan (preview look → real app)

**Goal:** make the app actually look like `design-system/preview.html`, not just recolored.
**Status of what exists:** the opt-in **beta skin** swaps *color tokens only* — no
structure, spacing, typography, or layout changed. That's why beta reads as
"classic + 2 colors." The preview look is a **structural** change; this plan covers it.

---

## 1. The reframe

| | Skin (done) | Redesign (this plan) |
|---|---|---|
| Changes | color hex values | card layout, hierarchy, spacing, type, icons, motion, states |
| Scope | ~1 CSS block (web) / palette (mobile) | shared primitives + every screen |
| Risk | ~zero | real — touches live UI |

**Recolor is ~done. Structure is the work.** Most of the "preview feeling" comes from a
handful of **shared primitives** + one hero component (the event card). Redesign those
first and most screens move most of the way on their own.

---

## 2. Design-language delta (the rules that = "the preview look")

Apply these everywhere; they define done:

1. **Event card** → per-kid **full-height left stripe** (not a dot), **time-forward**
   (time promoted, `tabular-nums`), title, `kid · source` subline. Whole card is one
   tap/click target — **no row of icon-buttons**.
2. **Day bucket** → sticky header, `Today · Wed Jul 22` format, **"Today" gets a tinted
   background block**, not just tinted text.
3. **Spacing** → 8pt rhythm (dense on data screens per `pages/dashboard.md`).
4. **Type** → DM Sans scale; **all times/dates `tabular-nums`**.
5. **Cards** → soft-flat (subtle shadow + hairline border). **No gradients** (kill the
   web UpgradeBanner gradient).
6. **Buttons** → one **amber** primary CTA per surface; **blue** for nav / links / active
   / "Today"; secondary = blue outline.
7. **Status** → semantic **chip = SVG icon + text** (syncing / synced / failed), never an
   emoji glyph.
8. **Loading** → **skeleton** placeholders, not a full-page spinner.
9. **Icons** → SVG (web) / Ionicons (mobile) **only**. Purge emoji-as-icons app-wide
   (the single most pervasive anti-pattern in both codebases).
10. **Motion** → no layout-shifting `scale` transforms; press feedback via opacity/
    elevation (mobile may use press-scale + haptic); modals animate from trigger +
    swipe-to-dismiss (mobile).

---

## 3. Highest-leverage shared work — DO FIRST

### Web (`frontend/src`)
- **`index.css` primitives**: refine `.card` (soft-flat), `.btn*` (amber CTA / blue
  secondary), `.input`/`.field` (blue focus), **replace `.spinner` usage with skeletons**.
- **Shared `<Modal>` shell** — removes ~6 inline copies (AddEventModal, LogisticsModal,
  SubscribeGuide, SourceHelpModal, DeleteAccountModal, contact form).
- **Extract `EventCard` + `DayGroup`** out of Dashboard.jsx into shared components.
- **One `SectionHeader` + `EmptyState`** (currently re-implemented per screen).
- **SVG icon set** to replace emoji everywhere.

### Mobile (`mobile/`)
- **Extract shared, themed primitives** into `components/`: `ModalHeader` (copy-pasted
  inline in ~10 screens), `Button`, `Input`, `Chip`, `SectionCard`, `Avatar` — all
  routed through `useTheme()`.
- **Redesign `EventCard`** → left-stripe / time-forward; **`DayHeader` "Today" pill**.
- **Route the ~14 still-hardcoded screens through `t.*` tokens** (they don't react to the
  beta toggle at all today — mechanical once the primitives exist).
- **Ionicons** for the app-wide emoji purge.

> Ordering rule: **primitives → hero card → mechanical token routing → bespoke screens →
> motion polish → risk-critical screens last.**

---

## 4. Per-screen inventory

### Web
| Screen | Effort | Risk | Structural gap (beyond color) |
|---|---|---|---|
| **Dashboard** | M | **High** (live hub, 3 modals, attendance/logistics state) | Closest to target. `tabular-nums`; **Today = tinted block**; sticky headers + `Wed · Jul 22`; **skeleton** load; kill the right-side icon-button/emoji row (card = one region); semantic status chips; 8pt. |
| **Sources** | M | Mod (refresh/classify logic) | Flatten cards; **semantic sync/error chips (SVG)**; **remove UpgradeBanner gradient**; 8pt; shared SectionHeader/EmptyState/Modal. |
| **Kids** | S | Low | Flatten; fix **scale-transform** swatch selection; blue/amber buttons; shared EmptyState; emoji purge. |
| **Contacts** | M | Mod (dense, roster parser) | Flatten dense cards; 8pt; emoji→SVG; shared Modal; remove press-scale. |
| **Settings** | S–M | Low | Restyle only; emoji purge; amber PRO chips; blue focus. **Hosts the beta toggle.** |
| **SetupAgent** | **L** | **High** (ingestion/magic-link state machine) | **Net-new chat vocabulary** (bubbles/composer/status) — preview has no chat spec; flat treatment; emoji→SVG; remove scale. |
| **Login / Signup** | S each | Low (Signup consent copy/pixels **untouchable**) | Minor restyle; blue links / amber CTA; 8pt. |
| **Layout (nav)** | S | Low (global frame) | Already SVG nav. Verify active = blue (not amber); footer emoji → SVG. |
| **AddEventModal** | S–M | Mod (used by 2 screens) | Onto shared `<Modal>`; chip/day-toggle blue; ✓-emoji → SVG. |
| **IngestionReviewModal** | M–L | Mod–High (own style system, destructive replace) | Biggest **off-system** outlier — bring onto shared primitives/tokens; ⚠️→SVG; `tabular-nums`. |

### Mobile
| Screen | Effort | Risk | Notes |
|---|---|---|---|
| **EventCard** | M | — (core, high propagation) | Dot → **left-stripe / time-forward**; press-scale + haptic; swipe affordance. |
| **(tabs)/index Calendar** | M | Mod (date/fetch/onboarding logic) | DayHeader **Today pill**; emoji empty state → icon; amber CTA. Themed already. |
| **(tabs)/contacts** | M | Mod | Full detheme + emoji purge; section cards/rows to tokens. |
| **(tabs)/settings** | **L** | Low (big surface) | Many one-off row styles; detheme all; emoji purge. |
| **(tabs)/_layout tab bar** | S | Low | Essentially done. |
| **login / signup** | M each | Mod (auth; App Store consent copy) | Dark-navy auth → design light ground + blue/amber; custom checkbox. |
| **setup** | **L** | **High** (share-intent/polling/ImagePicker, ~945 lines) | Visual-only, but easy to regress; chat vocabulary. |
| **upgrade** | M | **HIGH — IAP / App Store** | Visual only. **Do not touch purchase logic**; preserve price-before-button, Restore, disclosure wording, Terms/Privacy links. |
| **event/[id]** | L | Mod–High (teams/contacts pickers, SMS, overrides) | Detheme; LogisticsSlot + attendance switches + status dots → tokens; `tabular-nums`; modal enter/swipe-dismiss. |
| **event/new** | M | Mod | Inputs/switches/chips/pickers → tokens; amber CTA. |
| **sources/index** | M | Mod (refresh polling) | Cards/badges/kid-chips; **semantic status chips**; emoji→icons. |
| **sources/[id]** | M | Mod (title_contains logic) | Detheme; disclosure carets; split card. |
| **kids/new** | S | Low | Swatch grid / preview / CTA. |
| **kids/[id]** | S | Low | Near-dup of kids/new → **share a `KidForm`**. |
| **contacts/new** | S | Low | Cleanest form — pure detheme. |
| **contacts/picker** | M | Mod (selectionStore/notify load-bearing) | Detheme rows/search/inline form. |

---

## 5. Build order (phased)

- **Phase 0 — Foundations.** Shared primitives (web `<Modal>`/primitives/icon-set +
  extract EventCard/DayGroup; mobile primitives + Ionicons). *Highest leverage, unblocks
  everything.*
- **Phase 1 — Hero surface.** The calendar/dashboard card + day-bucket (mobile EventCard
  redesign, web Today-block/skeleton/tabular). **This is what makes it "look like the
  preview."** First thing worth screenshotting.
- **Phase 2 — Mechanical rollout.** Route remaining screens through tokens/primitives +
  emoji purge (Kids, Contacts, Sources, Settings, forms). Mostly S/M, low risk.
- **Phase 3 — Bespoke screens.** SetupAgent chat, IngestionReviewModal, event/[id] —
  need net-new component design; slower.
- **Phase 4 — Interaction polish.** Skeletons, press/haptic, swipe, modal transitions.
- **Phase 5 — Risk-critical, visual-only, last.** `upgrade` (IAP), auth consent screens.
- **Phase 6 — Rollout decision** (see §6).

Rough magnitude: Phase 0 is the multiplier; Phases 1–2 cover most screens at S/M; Phase 3
holds the two L web + two L mobile heavy screens.

---

## 6. Rollout decision (needs your call)

Everything currently hinges on the opt-in `data-skin="beta"` toggle (web) / `sc_skin`
(mobile). The redesign changes **structure**, not just color — so unlike the recolor, it's
harder to fully gate behind a per-device flag (especially on mobile, where layout isn't
token-driven).

Two options:
- **A — Build behind the beta flag, promote beta → default at the very end** after full
  QA. Safest; classic stays the live look until we flip.
- **B — Redesign *is* the app** (no dual skins): commit structure changes directly, drop
  the classic/beta split once done. Less bookkeeping; no "keep two layouts alive."

**Recommendation: A** — keep the flag as the safety net through the build, flip to default
once Phases 0–2 land and you've run it.

---

## 7. Suggested start

**Phase 0 + Phase 1 on mobile first** — mobile is furthest from the preview (the dot-card),
and you can run it in the simulator to see the real result. Concretely:
1. Extract mobile primitives (`Button`, `Input`, `Chip`, `ModalHeader`, `SectionCard`, `Avatar`).
2. Redesign `EventCard` → left-stripe/time-forward + `DayHeader` "Today" pill.
3. You run `npx expo start --ios`, confirm it matches the preview, then we roll Phase 2.

Web Phase 0/1 (Modal shell + Dashboard Today-block/skeleton/tabular) can run in parallel
or right after.
