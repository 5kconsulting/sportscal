#!/bin/bash
# Render header.html to the App Store product page header PNG (3840 x 1646, no alpha).
#   ./render.sh            -> header-3840x1646.png
#   ./render.sh guides out.png  -> same render with safe-area guides, to out.png
set -euo pipefail
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
HASH=""; OUT="$PWD/header-3840x1646.png"
if [ "${1:-}" = "guides" ]; then HASH="#guides"; OUT="${2:-$PWD/header-guides.png}"; fi
PROFILE="$(mktemp -d)"
RAW="$(mktemp -t header).png"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run \
  --user-data-dir="$PROFILE" --force-device-scale-factor=1 \
  --window-size=3840,1646 --virtual-time-budget=3000 \
  --screenshot="$RAW" "file://$PWD/header.html$HASH" >/dev/null 2>&1
rm -rf "$PROFILE"
# Apple: creative assets can't have an alpha channel.
python3 - "$RAW" "$OUT" <<'EOF'
import sys
from PIL import Image
im = Image.open(sys.argv[1])
assert im.size == (3840, 1646), im.size
im.convert("RGB").save(sys.argv[2], optimize=True)
print(sys.argv[2], im.size)
EOF
rm -f "$RAW"
