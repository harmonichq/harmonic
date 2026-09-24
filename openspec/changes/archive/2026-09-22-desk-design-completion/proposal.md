# #413 desk design completion

## Status

**Triage source for #413.** An ordinary ticket change, re-triaged on 2026-09-22
after #418 (ADR 416) retired v1 and made the desk the only shell. The inherited
desk revise contract (`mockups/harmonic-v2-desktop.behavior.md` and its replay
`frontend/desk-behavior.replay.mjs`) stays frozen; this change adds fail-first
app-only stories beside it and amends the stories whose behavior Connor ruled
changed.

This change supersedes the completion claim of task 3.3 in
`openspec/changes/archive/2026-09-24-v2-findings-ledger/tasks.md` for parent-owned Pattern members,
the basal legend and verdict paint, and skeleton loading. That record is left as
written; #413's audit and this change are the correction.

## Why

#411 closed #404 with the basal lane key rendered but clipped out of view and
hold slots unpainted, Pattern members still listed as sibling rail rows each
with its own mini, and a blank block where the cold loading skeleton was asked
for. A grounded audit on 2026-09-14 added four defects of the same round: three
different rail minis, one blue; two count grammars, the Pattern's words decided
in the app; no urgency in a rail whose rows share one tier; and a desk that
opens on Overnight when the reader asked for 24 h. Connor locked the design on
#413 the same day.

## What changes

- The backend serves one count sentence, `n of d noun outcome`, on every Pattern
  and Cause row. The desk prints it and keeps no word list of its own; the
  frontend Pattern word constant is deleted.
- A Pattern owns its causes in the rail: members fold under the parent on its
  spine, one line each, behind a toggle that names their count; open on the
  first ranked row, closed below it. Members carry no mini. Drills are unchanged.
- The first tier's caption paints in primary and its rows carry a rank stripe.
  Tier and rank are served.
- Every ranked row's mini is one instrument in the rail's cohort palette.
- The basal lane's key sits on the lane's head row above the cells, in the
  served verdict short forms with counts, and every verdict paints.
- Diagnose opens on the 24 h window.
- A destination that is loading cold shows a count-free skeleton of rail rows
  and stage instruments.

## Not in this change

Payload and window retention, the record-open loading state and roster cleanup
(#414, merged). A served ranking reason line under each row. Pump-profile values
in the footer and historical Focus-title migration (#404 Q4, Q5). Classifier,
cap, floor, tier, rank and staging rules. Design-token values in
`frontend/theme.css`. Pump writes, real data reads, vendor fetches.
