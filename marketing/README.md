# Marketing assets

App Store Connect screenshots, generation scripts, and notes.

## Layout

```
marketing/
├── screenshots/
│   ├── final/      # raw 1320×2868 iPhone screenshots (post-redaction)
│   ├── framed/     # composited marketing screenshots (uploaded to App Store)
│   ├── raw/        # discarded staging captures from initial session
│   ├── compose.sh  # final/ → framed/ (adds brand canvas + headlines)
│   └── redact-token.sh  # scrubs PII from raw → final/
```

## Pipeline

1. Capture raw iPhone screenshots from simulator (1320×2868 native iPhone 17 Pro Max).
2. Run `redact-token.sh` to scrub PII (inbound tokens, personal emails, phone numbers).
3. Run `compose.sh` to add the dark navy `#0f1629` canvas + headline copy.
4. Drag `framed/*.png` into App Store Connect's 6.9" Display screenshot slot.

`redact-token.sh` is idempotent — safe to re-run.
`compose.sh` reads from `final/` and writes to `framed/`. Safe to re-run.

## Captured 2026-05-26

iPhone 17 Pro Max simulator, iOS 26.3, dogfood account "John" with 22 events,
3 kids (Emma/Liam/Olivia), 5 ride contacts.

