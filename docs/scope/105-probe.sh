#!/bin/sh
# Spiked during #105 triage. Run from the repository root of the INTEGRATION TIP
# (the branch already carrying #100, #96 and #101).
#
# Executed on this branch's base (origin/main 7cddfe9, no frontend delta) it
# printed, verbatim:
#   highest existing S id: S71 -> next free: S72
#   roster stepping handler: PRE-#101 (still Left/Right) -> #101 has NOT landed
#   focus call sites in diagnose-workstation.js: 1989 2017 2055 2095
#   no roster focus restore found
#   STORIES at tip: 89
# Every one of those is a BASE reading. Re-run it; never quote it.

echo "--- 1. next free replay story id"
# #100 and #101 EACH drafted their first new story as S72, so whoever landed
# second renumbered. The tip is the only authority on what is free.
NEXT=$(grep -o 'export const S[0-9]\{1,\}' frontend/diagnose-workstation-behavior.replay.mjs \
  | grep -o '[0-9]\{1,\}' | sort -n | tail -1)
echo "highest existing S id: S$NEXT -> next free: S$((NEXT + 1))"

echo "--- 2. PRECONDITION: has #101's roster stepping landed?"
# Scoped to the roster keydown, anchored on the guard #101's order commits to
# keeping (`f.k !== 'factor' || !f.selectedId`, line 2575 at base). A whole-file
# grep for ArrowUp/ArrowDown is NOT discriminating: the Filter menu's roving
# focus matches it at 2083-2084 on the unfixed base.
HANDLER=$(grep -A 12 "f.k !== 'factor' || !f.selectedId" frontend/diagnose-workstation.js)
if [ -z "$HANDLER" ]; then
  echo "roster stepping handler: NOT FOUND -> stop, the anchor moved; read the file"
elif echo "$HANDLER" | grep -q 'ArrowLeft\|ArrowRight'; then
  echo "roster stepping handler: PRE-#101 (still Left/Right) -> #101 has NOT landed"
elif echo "$HANDLER" | grep -q 'ArrowUp' && echo "$HANDLER" | grep -q 'ArrowDown'; then
  echo "roster stepping handler: POST-#101 (Up/Down, no Left/Right) -> #101 has landed"
else
  echo "roster stepping handler: UNRECOGNISED -> stop and read it"
fi

echo "--- 3. LOCATE the surviving focus consumer (informational, not a gate)"
# #100's order puts the consumer in applyPendingFocus() at the END of paint();
# #101's order puts it at the END of paintLevel's case-file branch. Those two
# CONFLICT, so integration reconciled them somehow and only the tip knows how.
# Read these sites before touching anything. At base the only four are the
# Filter menu's.
echo "focus call sites in diagnose-workstation.js:"
grep -n '\.focus(' frontend/diagnose-workstation.js || echo "  none"
echo "roster focus restore (selector form), if any:"
grep -n 'case-occurrence\[data-occurrence-id\|applyPendingFocus' frontend/diagnose-workstation.js \
  || echo "  no roster focus restore found"

echo "--- 4. story count the replay will report at the tip"
node -e "import('./frontend/diagnose-workstation-behavior.replay.mjs').then(m=>console.log('STORIES at tip:', m.STORIES.length))"
