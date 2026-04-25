# SportsCal — Agent Context

You are working on **SportsCal**, a live multi-tenant B2C SaaS that aggregates
youth sports schedules into unified iCal feeds for parents. Deployed on
Railway, serving real users. Sole developer: Patton (5K Consulting LLP).

Companion product **SchoolCal** (B2B white-label for schools) is scoped but
not yet built.

---

## Repo layout

```
~/sportscal
├── backend/                Node.js + Express (ESM) — API + BullMQ workers
│   └── src/
│       ├── server.js
│       ├── db/
│       │   ├── index.js    pool, query/queryOne helpers, runMigrations()
│       │   └── schema.sql  SOURCE OF TRUTH. Edit this, not migrations.
│       ├── routes/         auth, kids, sources, events, manual,
│       │                   ingestions, contacts, logistics, overrides,
│       │                   calendar, billing, admin, passwordReset,
│       │                   emailVerification
│       ├── middleware/auth.js       requireAuth — sets req.user (full obj)
│       ├── emails/templates.js      welcome / digest / reminder, TZ-aware
│       ├── normalizer.js            buildDisplayTitle()
│       └── workers/
│           ├── queue.js    shared BullMQ connection + enqueue helpers
│           ├── icalWorker.js
│           ├── scrapeWorker.js
│           ├── emailWorker.js
│           ├── scheduler.js
│           └── healthWorker.js
├── frontend/               React + Vite, served via Express proxy
│   ├── server.cjs          Express: proxy /api/*, serve dist + landing/
│   ├── landing/            Static landing, pricing, ToS, privacy
│   └── src/
│       ├── main.jsx
│       ├── hooks/          useAuth.jsx, useIngestion.js
│       ├── lib/api.js      JWT in localStorage under 'sc_token'
│       ├── components/     AddEventModal, IngestionReviewModal,
│       │                   ReplacePdfButton
│       └── pages/          Dashboard, Sources, Kids, Settings,
│                           SetupAgent, Login, Signup
└── mobile/                 Expo SDK 54, iOS target
    ├── app.json            bundle: com.fivekconsulting.sportscal
    ├── app/                Expo Router: login, (tabs)/, event/[id],
    │                       contacts/picker
    ├── components/EventCard.jsx
    └── lib/                api.js (Keychain via expo-secure-store),
                            auth.js, selectionStore.js
```

---

## Hard rules — do not violate these

### Auth middleware sets `req.user`, NOT `req.userId`
Single most expensive bug pattern in this codebase. Every protected route
reads `req.user.id`. Check this on every new route before shipping.

### Schema changes go in `backend/src/db/schema.sql`
There is no separate migration runner. `runMigrations()` wraps the entire
schema in a transaction and applies it on every backend boot. Everything
in the file must be **idempotent**: `CREATE TABLE IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS`, and CHECK constraints via drop-and-recreate
(`ALTER TABLE ... DROP CONSTRAINT IF EXISTS; ALTER TABLE ... ADD CONSTRAINT`).

If a migration fails, backend boot fails loudly — that is intentional.

### BullMQ v5 job ID rules
- Never use `:` in jobIds — v5 reserves it. Use hyphens: `ical-${id}`.
- Default (stable) jobIds dedupe. For force-refresh paths, suffix with a
  timestamp so BullMQ treats them as new: `ical-${id}-${Date.now()}`.

### `query()` returns `result.rows` directly
Don't unwrap further. `queryOne()` returns the first row or `null`.

### Adding a new source app = one-line edit
Add the app string to the `sources_app_check` IN list in `schema.sql`.
Deploy. Done. Don't invent a new table or table-driven lookup.

### Never commit backup files
Filters like `Dashboard.jsx.bak`, `Dashboard.jsx.pre-fix`, `Kids.jsx.fixbak`
are already in `.gitignore`. If a refactor script creates one, delete it
before committing.

---

## Copyright, no exceptions

- Never reproduce song lyrics, poems, or haikus in any code or UI output.
- Never reproduce >15 consecutive words from any external source.
- When summarizing web content, paraphrase in original wording.

---

## Standing gotchas

- `DATABASE_URL` on Railway is `.railway.internal` — only resolves inside
  Railway. For local-to-prod DB access, use `DATABASE_PUBLIC_URL` or run
  `railway connect Postgres` (tunneled psql).
- Postgres password rotation: use the **Postgres service Config tab**, not
  the Variables Generator. The Generator only updates the stored reference,
  not the actual DB password.
- Frontend env vars (`VITE_*`) are compiled in at build time — changing
  them requires a redeploy, not a restart.
- `ANTHROPIC_API_KEY` lives on the backend Railway service.
  `VITE_ANTHROPIC_API_KEY` lives on the frontend Railway service.
  Both must be set; one does not imply the other.
- Railway auto-deploys on `git push` to `main`. Check Railway dashboard
  after every push.
- Deploys can also be triggered via Railway Command Palette (`CMD+K` →
  "Deploy Latest Commit").
- `railway logs` shows live logs for the currently-selected service.

---

## The three kinds of sources

This is not obvious from schema alone:

1. **Automated feeds** — `fetch_type IN ('ical','scrape','ical_with_scrape_fallback')`,
   various `app` values. Pollable, auto-refresh on scheduler cadence.
2. **PDF-ingested** — `fetch_type = 'manual'`, `app = 'pdf_upload'`.
   Created by `routes/ingestions.js` approve flow. Point-in-time, no refresh.
3. **Manual events container** — `fetch_type = 'ical'`, `app = 'custom'`,
   `name = '__manual__'`. One per user, holds events created by the user
   via the "+ Add event" button. Lives under the hood; surfaced in the UI
   via the "Manual events" section of the Sources page.

The `app` value `email_forward` is reserved in `sources_app_check` but
email forwarding is not yet implemented. (Planned: Resend Inbound.)

---

## Plan limits (`plan_limits` view)

- **Free:** 2 kids, 2 sources, no digest
- **Premium monthly ($10/mo), annual ($100/yr):** 8 kids, 24 sources, digest
- **Grandfathered:** $5/mo premium for users who signed up before the
  pricing overhaul (Apr 2026). Don't change their billing without
  explicit user consent.

---

## Mobile app specifics

- Expo Router file-based routing. Modal routes (`event/[id]`, `contacts/picker`)
  registered in `app/_layout.jsx` with `presentation: 'modal'`.
- Auth uses `expo-secure-store` (iOS Keychain) under key `sc_token`.
  Mirrors web's `localStorage.getItem('sc_token')` pattern.
- `api` client in `mobile/lib/api.js` has an `onUnauthorized` hook that
  `AuthProvider` wires to auto-clear token and bounce to login on 401.
- Modal → picker data handoff uses `lib/selectionStore.js` (tiny pub-sub
  keyed by session ID) to avoid URL-param serialization of non-trivial
  objects.
- Mobile does NOT set `notify` on logistics assignment — M2 assigns only,
  never triggers SMS/email to the contact. That's a web-first flow.
- Kid attendance toggle is deliberately NOT yet in mobile — deferred to M3.

---

## Frontend conventions

- **Inline styles over CSS imports** for modal components. Matches app
  convention, avoids missing-import regressions.
- **Complex files get full rewrites**, not diff patches. When editing a
  large existing file, prefer a targeted `sed`-friendly replacement over
  a drop-in rewrite only if the change is truly small.
- **Never use browser storage in artifacts** (localStorage/sessionStorage)
  — they're blocked in Claude.ai artifacts. Use React state.
- **Emoji-in-JSX rule:** don't add emoji to UI text unless the user asks
  or the existing component already uses them. The codebase uses them
  sparingly in some places (Setup agent status pills); match surrounding
  code.

---

## Working style (Patton's preferences)

- **Paste grep output and full function bodies** — don't guess at file
  contents; grep from the user's Mac is the source of truth. Claude's
  local copies go stale fast.
- **Prefer `nano` for multi-line edits over multi-line `sed`** — zsh
  quoting bites. For anything non-trivial, generate a Python script or
  full-file rewrite instead.
- **Test builds locally before pushing.** `npm run build` in `frontend/`
  catches the vast majority of Railway deploy failures before they
  happen. This is mandatory for frontend changes.
- **Complete file replacements over targeted diffs when files get complex.**
- **Full rewrites delivered as downloadable outputs** — not pasted into
  chat.
- **Commits should be single-purpose.** Don't stack unrelated fixes into
  one commit. History is cheap; bisecting is expensive.

---

## Frequent commands

```bash
# Inspect the live DB from laptop
railway connect Postgres                 # tunneled psql

# Tail a service's logs
railway logs --service sportscal-backend
railway logs --service sportscal-frontend

# Rebuild the frontend locally to catch errors pre-push
cd ~/sportscal/frontend && npm run build

# Start the mobile app
cd ~/sportscal/mobile && npx expo start --ios --clear

# Force a Railway deploy without new commits
# (Command Palette: CMD+K → Deploy Latest Commit)
```

---

## Domains

- App: `www.sportscalapp.com`
- Email (outbound): `mail.sportscalapp.com` via Resend
- Email (inbound, planned): `ingest.sportscalapp.com` via Resend Inbound
- Railway internal: `sportscal-production.up.railway.app`

---

## Files to ignore for most changes

These exist but are rarely the right place to edit:

- `package-lock.json` — never edit by hand; let npm manage it
- `frontend/dist/` — build artifact, regenerated on every deploy
- `backend/node_modules/`, `frontend/node_modules/`, `mobile/node_modules/`
- Any `*.bak`, `*.pre-fix`, `*.fixbak` — refactor script backups,
  should not exist long term
