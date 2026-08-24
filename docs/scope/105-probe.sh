#!/bin/sh
# Spiked during #105 triage. Run from the repository root of the INTEGRATION TIP
# (the branch already carrying #100, #96 and #101).
#
# Executed on this branch's base (origin/main 7cddfe9, no frontend delta) it
# printed, verbatim:
#   highest existing S id: S71 -> next free: S72
#   roster stepping handler: PRE-#101 (Left/Right) -> #101's KEYS have NOT landed
#   roster focus restore: NOT FOUND -> the sibling FOCUS mechanism has NOT landed
#   focus call sites in diagnose-workstation.js: 1989 2017 2055 2095
#   STORIES at tip: 89
# Every one of those is a BASE reading. Re-run it; never quote it.

echo "--- 1. next free replay story id"
# #100 and #101 EACH drafted their first new story as S72, so whoever landed
# second renumbered. The tip is the only authority on what is free.
NEXT=$(grep -o 'export const S[0-9]\{1,\}' frontend/diagnose-workstation-behavior.replay.mjs \
  | grep -o '[0-9]\{1,\}' | sort -n | tail -1)
echo "highest existing S id: S$NEXT -> next free: S$((NEXT + 1))"

echo "--- 2. GATE A: has #101's roster STEPPING landed?"
# Scoped to the roster keydown, anchored on the guard #101's order commits to
# keeping (`f.k !== 'factor' || !f.selectedId`, line 2575 at base). A whole-file
# grep for ArrowUp/ArrowDown is NOT discriminating: the Filter menu's roving
# focus matches it at 2083-2084 on the unfixed base. Comments are stripped
# before classifying, and the POST test runs FIRST, so a comment mentioning the
# withdrawn Left/Right model cannot make a fixed tip read as unfixed.
HANDLER=$(grep -A 12 "f.k !== 'factor' || !f.selectedId" frontend/diagnose-workstation.js \
  | sed 's,//.*,,')
has() { echo "$HANDLER" | grep -q "$1"; }
if [ -z "$HANDLER" ]; then
  echo "roster stepping handler: NOT FOUND -> stop, the anchor moved; read the file"
elif has 'ArrowUp' && has 'ArrowDown' && ! has 'ArrowLeft' && ! has 'ArrowRight'; then
  echo "roster stepping handler: POST-#101 (Up/Down only) -> #101's KEYS have landed"
elif has 'ArrowLeft' || has 'ArrowRight'; then
  echo "roster stepping handler: PRE-#101 (Left/Right) -> #101's KEYS have NOT landed"
else
  echo "roster stepping handler: UNRECOGNISED -> stop and read it"
fi

echo "--- 3. GATE B: has the sibling FOCUS mechanism landed, able to target a roster row?"
# Gate A proves the KEYS, not the focus restore, and step 4 of the work order
# presupposes an existing consumer and flag. #100's order puts the consumer in
# applyPendingFocus() at the END of paint(); #101's order puts it at the END of
# paintLevel's case-file branch. Those two CONFLICT, so integration reconciled
# them somehow and only the tip knows how — hence a gate on either shape.
RESTORE=$(grep -n 'case-occurrence\[data-occurrence-id\|applyPendingFocus' frontend/diagnose-workstation.js)
if [ -z "$RESTORE" ]; then
  echo "roster focus restore: NOT FOUND -> the sibling FOCUS mechanism has NOT landed"
else
  echo "roster focus restore: PRESENT"
  echo "$RESTORE"
fi

echo "--- 3b. LOCATOR (informational, not a gate): every focus call site"
grep -n '\.focus(' frontend/diagnose-workstation.js || echo "  none"

echo "--- 4. story count the replay will report at the tip"
node -e "import('./frontend/diagnose-workstation-behavior.replay.mjs').then(m=>console.log('STORIES at tip:', m.STORIES.length))"
