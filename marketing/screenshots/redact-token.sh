#!/usr/bin/env bash
# ============================================================
# Redacts the real inbound-token email address from raw
# marketing screenshots before they go to the App Store.
#
# Why: the `add+1a57cba2@inbox.sportscalapp.com` shown in the
# Settings card is Patton's real per-user routing token. App
# Store screenshots are public; anyone copying that exact
# string would forward mail into his account forever.
# Replaced with `add+demo7x9c@inbox.sportscalap…` (visibly
# placeholder, same length/shape so the redaction matches the
# real UI's truncation).
#
# Re-runnable. Writes back into final/<file>, so re-run
# compose.sh afterward to regenerate the framed versions.
# ============================================================

set -euo pipefail
cd "$(dirname "$0")"

MONO_FONT="/System/Library/Fonts/Menlo.ttc"

# Token entries: <file>|<rect-x1,y1,x2,y2>|<text-x,y>
TOKEN_TARGETS=(
  "final/04-kid-sharing.png|135,685,870,790|160,760"
  "final/05-email-forwarding.png|135,1820,870,1925|160,1895"
)

TOKEN_REPLACEMENT="add+demo7x9c@inbox.sportscalap…"

for entry in "${TOKEN_TARGETS[@]}"; do
  IFS='|' read -r file rect text_pos <<< "$entry"
  IFS=',' read -r x1 y1 x2 y2 <<< "$rect"
  IFS=',' read -r tx ty <<< "$text_pos"

  echo ">>> Redacting token in $file"

  magick "$file" \
    -fill "#ffffff" \
    -draw "rectangle $x1,$y1 $x2,$y2" \
    -font "$MONO_FONT" \
    -pointsize 38 \
    -fill "#0d0d10" \
    -annotate "+${tx}+${ty}" "$TOKEN_REPLACEMENT" \
    "$file"
  echo "  → $file (token in place)"
done

# Personal-email entry — only in screenshot 5 (Settings shows "Signed in as
# John / john_patton@mac.com"). Replace with a clearly-placeholder address.
echo ">>> Redacting personal email in final/05-email-forwarding.png"
magick "final/05-email-forwarding.png" \
  -fill "#ffffff" \
  -draw "rectangle 90,540 720,590" \
  -font "/System/Library/Fonts/HelveticaNeue.ttc" \
  -pointsize 38 \
  -fill "#7587a1" \
  -annotate "+110+580" "john@example.com" \
  "final/05-email-forwarding.png"
echo "  → final/05-email-forwarding.png (email in place)"

# Phone numbers in screenshot 2 — pickup/dropoff contact cards show
# real-looking Oregon-area-code numbers. Replace with 555-prefix
# placeholders (Hollywood-reserved range, universally understood as fake).
echo ">>> Redacting phone numbers in final/02-ride-coordination.png"
magick "final/02-ride-coordination.png" \
  -fill "#ffffff" \
  -draw "rectangle 100,1130 500,1185" \
  -fill "#ffffff" \
  -draw "rectangle 100,1465 500,1520" \
  -font "/System/Library/Fonts/HelveticaNeue.ttc" \
  -pointsize 36 \
  -fill "#7587a1" \
  -annotate "+110+1170" "+15550101010" \
  -annotate "+110+1505" "+15550102020" \
  "final/02-ride-coordination.png"
echo "  → final/02-ride-coordination.png (phones in place)"

echo ""
echo "Done. Now re-run compose.sh to regenerate the framed versions."
