#!/bin/sh
# Spiked during #105 triage and executed on the ticket branch's base (origin/main
# 7cddfe9), where it reported: next free S72, both preconditions ABSENT, 89
# stories. Run from the repository root of the integration tip.
#
# 1. NEXT FREE REPLAY STORY ID. #100 and #101 each drafted their first new story
#    as "S72", so the ids they actually landed on the integration branch must be
#    read off the tip, never copied from a work order.
NEXT=$(grep -o 'export const S[0-9]\{1,\}' frontend/diagnose-workstation-behavior.replay.mjs \
  | grep -o '[0-9]\{1,\}' | sort -n | tail -1)
echo "highest existing S id: S$NEXT -> next free: S$((NEXT + 1))"

# 2. PRECONDITION A — #101's render-path focus restore is present. This is the
#    definitive one: the selector form is unique to that restore.
echo "--- #101 focus restore onto a roster row (must print a line):"
grep -n 'case-occurrence\[data-occurrence-id' frontend/diagnose-workstation.js || echo "ABSENT"

# 3. PRECONDITION B — the roster stepping handler takes Up/Down. Scoped to the
#    handler itself: a whole-file grep for ArrowUp/ArrowDown false-positives on
#    the Filter menu's roving focus (lines 2083-2084 on the 7cddfe9 base).
echo "--- roster stepping handler (must show ArrowUp/ArrowDown, not ArrowLeft/Right):"
grep -n -B 8 'siblings\[next\]\.id' frontend/diagnose-workstation.js \
  | grep -n 'Arrow' || echo "ABSENT"

# 4. Story count the replay will report at the tip, for the +1 expectation.
node -e "import('./frontend/diagnose-workstation-behavior.replay.mjs').then(m=>console.log('STORIES at tip:', m.STORIES.length))"
