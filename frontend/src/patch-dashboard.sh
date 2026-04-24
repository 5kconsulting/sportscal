#!/bin/bash
# patch-dashboard.sh
#
# Updates pages/Dashboard.jsx to use the shared AddEventModal component
# instead of the inline one. Run from inside ~/sportscal/frontend/src.
#
# Two changes:
#   1. Insert an import of AddEventModal near the top
#   2. Delete the inline function AddEventModal { ... } block
#
# The script is idempotent: running it twice is a no-op after the first run.

set -e

FILE="pages/Dashboard.jsx"

if [ ! -f "$FILE" ]; then
  echo "ERROR: $FILE not found. Run this from ~/sportscal/frontend/src."
  exit 1
fi

cp "$FILE" "$FILE.bak"
echo "Backup: $FILE.bak"

# --- Change 1: insert import -----------------------------------------------
# Only insert if not already present.
if grep -q "from '../components/AddEventModal'" "$FILE"; then
  echo "Import already present — skipping insert."
else
  # Insert after the useAuth import, which we know exists in Dashboard.jsx
  python3 - "$FILE" <<'PY'
import sys, re
path = sys.argv[1]
src = open(path).read()
# Find a reasonable anchor: the useAuth import line
m = re.search(r"^(import .*from '\.\./hooks/useAuth\.jsx';\s*)$", src, re.M)
if not m:
    # Fallback: insert after the first block of imports
    m = re.search(r"((?:^import .*\n)+)", src, re.M)
    if not m:
        print("Could not find an import block — aborting")
        sys.exit(1)
    insert_at = m.end()
else:
    insert_at = m.end()
new_line = "\nimport { AddEventModal } from '../components/AddEventModal.jsx';\n"
out = src[:insert_at] + new_line + src[insert_at:]
open(path, 'w').write(out)
print("Added import of AddEventModal")
PY
fi

# --- Change 2: delete inline function definition ---------------------------
if ! grep -q "^function AddEventModal" "$FILE"; then
  echo "Inline AddEventModal already removed — skipping."
else
  # Delete from "function AddEventModal" up to and including the matching "^}"
  # that closes it. We use a python script because sed struggles with nested
  # braces, and AddEventModal has plenty of them.
  python3 - "$FILE" <<'PY'
import sys
path = sys.argv[1]
src = open(path).read()
lines = src.split('\n')

start = None
for i, line in enumerate(lines):
    if line.startswith('function AddEventModal'):
        start = i
        break
if start is None:
    print('No inline AddEventModal — nothing to delete')
    sys.exit(0)

# Walk forward counting braces. The function opens with `function X(...) {`
# on its first line, so we start the depth counter at 0 and increment when
# we see the first `{`, then look for the matching `}`.
depth = 0
seen_open = False
end = None
for i in range(start, len(lines)):
    for ch in lines[i]:
        if ch == '{':
            depth += 1
            seen_open = True
        elif ch == '}':
            depth -= 1
            if seen_open and depth == 0:
                end = i
                break
    if end is not None:
        break

if end is None:
    print('Could not find end of AddEventModal — aborting without change')
    sys.exit(1)

# Also trim one blank line after the closing brace if present, to avoid
# leaving a double blank gap.
del_end = end + 1
if del_end < len(lines) and lines[del_end].strip() == '':
    del_end += 1

out = '\n'.join(lines[:start] + lines[del_end:])
open(path, 'w').write(out)
print(f'Deleted inline AddEventModal (lines {start+1}..{end+1})')
PY
fi

echo ""
echo "Done. Diff summary:"
diff -u "$FILE.bak" "$FILE" | head -40 || true
echo ""
echo "If anything looks wrong: mv $FILE.bak $FILE"
