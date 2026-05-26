#!/usr/bin/env bash
# ============================================================
# SportsCal App Store marketing screenshot composer
#
# For each entry in SHOTS, takes a raw iPhone screenshot from
# final/<file>, composites it on a #0f1629 canvas with a brand
# headline at the top, and writes the result to framed/<file>.
#
# Output: 1320x2868 PNGs ready for App Store Connect upload
# (Apple's 6.9" Display device class, current required size).
# ============================================================

set -euo pipefail
cd "$(dirname "$0")"

BG="#0f1629"
HEADLINE_COLOR="white"
SUBHEAD_COLOR="#9aa9c4"
BOLD="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
REG="/System/Library/Fonts/Supplemental/Arial.ttf"

mkdir -p framed

# Each entry: <raw_file>|<headline>|<subhead>
SHOTS=(
  "01-hero-calendar.png|Every kid. Every game.\nOne calendar.|Built for parents juggling more than one schedule."
  "02-ride-coordination.png|Coordinate rides\nper event.|Pickup. Dropoff. One tap each."
  "03-ride-contacts.png|Your carpool,\norganized.|Family, teammates, neighbors — all in one place."
  "04-kid-sharing.png|Every kid gets\ntheir own feed.|Share to their phone in one tap."
  "05-email-forwarding.png|Forward team emails.\nWe grab the schedule.|No copy-paste. No setup. Just forward."
)

for entry in "${SHOTS[@]}"; do
  IFS='|' read -r file headline subhead <<< "$entry"
  in="final/$file"
  out="framed/$file"

  echo ">>> $file"

  # Step 1: Scale screenshot down to fit below the text area.
  # Canvas 1320x2868. Reserve top 720px for headline + subhead.
  # Available height for screenshot: 2148px. Scale factor: 2148/2868 = 0.749.
  # Scaled width: 1320 * 0.749 = ~989px (centered with 165px margins).
  scaled_w=989
  scaled_h=2148
  shot_x=$(( (1320 - scaled_w) / 2 ))
  shot_y=720

  # Step 2: Build a single composite in one magick invocation.
  # - xc: solid-fill background canvas
  # - first composite: the scaled screenshot, positioned shot_x/shot_y from NW
  # - second composite: headline caption (centered horizontally, top-anchored)
  # - third composite: subhead caption
  magick \
    -size 1320x2868 "xc:$BG" \
    \( "$in" -resize "${scaled_w}x${scaled_h}" \) \
      -gravity northwest -geometry "+${shot_x}+${shot_y}" -composite \
    \( -background none -fill "$HEADLINE_COLOR" -font "$BOLD" -pointsize 96 \
       -size 1180x -gravity center caption:"$(printf "$headline")" \) \
      -gravity north -geometry "+0+200" -composite \
    \( -background none -fill "$SUBHEAD_COLOR" -font "$REG" -pointsize 42 \
       -size 1180x -gravity center caption:"$subhead" \) \
      -gravity north -geometry "+0+560" -composite \
    "$out"

  echo "  → $out"
done

echo ""
echo "Done. 5 framed screenshots written to framed/"
ls -la framed/
