# #433 basal strip on short windows

## Status

The triage source for #433, an ordinary ticket change. It extends the
shipped desk's revise contract, `mockups/harmonic-v2-desktop.behavior.md` and
its replay `frontend/desk-behavior.replay.mjs`. It adds three fail-first
stories (S151–S153) and amends S113 under the release's standing Q2 sanction
(Connor Griffin, 2026-09-23).

## Why

On a desktop window too short for the Diagnose canvas pane's fixed row floors,
the Basal slots strip at the pane's bottom is cut off, and nothing lets the
reader scroll to it. On the data behind the report, that strip held the only
stageable advice in the app, two overnight lowers, and on a short window it
was out of reach.

The report also showed the key saying "lower 2" while the slot the reader
opened was a held neighbour. The key was correct, but the cut-off strip made
it unreadable. And a reader who opens a recurring-lows lower is surprised by
its small night count, because the key calls it a plain "lower".

## What Changes

- **The strip is reachable on short windows.** At desktop split widths, the
  canvas pane gets the vertical scroll the narrow layout already gives it. At
  1280×720 and 1440×900 nothing moves, because the pane's rows fit exactly and
  there is no scroll range. On a shorter window, the strip, its key and every
  cell are reached with the pane's own scroll, and every raise or lower slot
  can be selected with the pointer and staged. Near the narrowest split, the
  key wraps between whole entries instead of cutting its last ones off at the
  pane's edge. At the supported sizes it stays on one line.
- **The key names a recurring-lows lower apart from a measured lower.** A
  slot the backend serves as "lower (recurring lows)" counts under
  "lower · recurring lows", with the same paint. The name is read from the
  served status alone, and staging stays the backend's decision (operator
  decision D6).
- **The key is pinned to what each slot's panel says.** Every raise or lower
  slot opens with a Recommended value and a Stage change control. Every hold,
  insufficient or no-data slot says no direction is asserted.
- **The records follow.** New and amended desk ledger stories, the pinned
  ledger inventory, and DESIGN.md's basal lane entry are updated.

## Not in this change

- Why the finding tied to those slots ranked sixth in Findings. That belongs
  to the sibling issue on lows being under-ranked.
- Any classifier, cap, floor, staging-predicate or queue-ranking change, and
  any new served field.
- The Spotlight's floor, the chart body's height, and the layouts below 832px
  wide.
- Pump writes, real-data reads and vendor fetches.

## Impact

- `frontend/diagnose-workstation.css`: the desktop canvas pane rule.
- `frontend/diagnose-workstation-chart.js` (`buildSlotLane`) and
  `frontend/diagnose-workstation.js` (`renderLaneKey`, `renderLane`): the key
  word and the cell names.
- The desk replay (`frontend/c4.replay.mjs`,
  `frontend/desk-behavior.replay.mjs`, `frontend/replay-cases.mjs`), its node
  tests, the desk ledger, and the ledger inventory pins in
  `mockups/sweep/harmonic-v2-desktop/`.
- Specs: `surfaces`, three ADDED requirements. No existing requirement is
  modified.
