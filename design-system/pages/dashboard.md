# Dashboard Page Overrides (Web)

> **PROJECT:** SportsCal
> **Page Type:** Authenticated product view — the unified multi-kid schedule
> **Surface:** `frontend/src/pages/Dashboard.jsx`

> ⚠️ **IMPORTANT:** Rules here **override** `design-system/MASTER.md`.
> Only deviations are documented; for everything else, follow the Master.
> This is a signed-in data view, **not** a landing/marketing page — ignore any
> hero / "how it works" / "start trial" patterns. There is no CTA funnel here.

---

## Page-Specific Rules

### Layout Overrides

- **Max width:** `1400px`, centered, with comfortable gutters (min `24px`).
- **Structure:** Vertical stream of **day buckets** (one section per local day),
  sorted by local day — never by event arrival order (see commit history:
  buckets sort by local day). Each bucket = a sticky day header + a list of
  event cards.
- **No 12-column marketing grid.** Event cards are a single readable column on
  small widths; may go 2-up only at ≥1024px if density warrants.

### Spacing Overrides (higher density than Master)

Override the Master `--space-*` scale toward a scannable data view:

| Token | Master | Dashboard |
|-------|--------|-----------|
| `--space-xs` | 4px | 4px |
| `--space-sm` | 8px | 8px |
| `--space-md` | 16px | **12px** (card interior) |
| `--space-lg` | 24px | **16px** (between cards) |
| `--space-xl` | 32px | **24px** (between day buckets) |

Goal: a parent scans a full week without excessive scrolling. Tight, not cramped.

### Typography Overrides

- Use Master DM Sans.
- **Event times and dates MUST use `font-variant-numeric: tabular-nums`** so
  times align vertically down the day column and don't reflow.
- Day-bucket headers: DM Sans 600, foreground `#0F172A`; show weekday + date
  (e.g. "Wed · Jul 22"). Today's header tinted primary `#2563EB`.

### Color Overrides

- Keep Master light background `#F8FAFC` — do **not** switch to a dark dashboard.
  Trust/calm brand > "ops console" aesthetic.
- **Per-kid color coding:** assign each kid a stable accent (a left border or
  small dot on the event card). Derive from a fixed palette, not random per
  render. Color is a *secondary* cue — always pair with the kid's name/label
  (never color alone).
- **Source/sync status uses semantic colors + icon + text:**
  - syncing / pending ingestion → muted/neutral, spinner or "Syncing…"
  - healthy feed → no chrome (absence of error is the success state)
  - failed/stale feed → destructive `#DC2626` with an icon and a retry affordance
- Manual events (the `__manual__` container) get no special color — they read as
  normal events; the "Manual events" distinction lives on the Sources page.

### Component Overrides

- **Event card:** compact. Row 1 = time (tabular) + title; row 2 = kid label +
  source. Left edge carries the per-kid accent. Whole card is a clickable region
  (`cursor:pointer`) opening detail/override — not a row of icon buttons.
- **Empty state (no events):** friendly, guiding — "No events this week" plus a
  path to add a source or a manual event. Never a blank column.
- **Loading state:** skeleton day buckets (shimmer rows), not a full-page
  spinner, when feeds are still resolving (>300ms).
- **Feed-still-syncing banner:** when a source was just added and hasn't
  produced events yet, show an inline reassurance ("New calendar is importing…")
  rather than an empty week that reads as broken.

---

## Recommendations

- Row highlight on hover (background shift only — no layout-shifting transforms).
- Smooth filter/transition when toggling kids or date ranges (150–200ms ease).
- Any analytics/charts (attendance, event counts) follow the `dataviz` skill and
  the Master accessible-color rules — legends visible, tooltips on interact,
  never color-alone.
- Respect `prefers-reduced-motion`: disable the skeleton shimmer and filter
  animations when requested.
