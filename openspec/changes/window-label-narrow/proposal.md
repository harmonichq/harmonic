# #455 chart text at the narrowest split

## Status

The triage source for #455, an ordinary ticket change. It extends the shipped
desk's revise contract: the frozen desk behavior ledger
`mockups/harmonic-v2-desktop.behavior.md` and its replay
`frontend/desk-behavior.replay.mjs`. It adds two fail-first stories, S183 and
S184, under the release's Q3 delegation and coordinator ruling R455
(Connor Griffin, 2026-09-23).

## Why

At an 832 px wide window, the narrowest at which Diagnose forms its two-pane
split, the glucose overview's window caption runs past the chart's right edge
and is cut off. On a thin window the cut takes the insufficient-sample notice
with it, and that notice is a safety statement: it is how the chart says it
prints no precise median. The same #433 renders show a second loss in the
same pane at that width: the Spotlight's compact verdict line ends at
"programmed now", and the programmed rate it names is gone. Both texts are cut
on the base as well; #433 fixed the basal lane beside them and left them as
they were.

## What Changes

- **The window caption wraps inside the chart when one line fits nowhere.**
  Where the caption fits on one line today, inside its window or beside it, it
  stays exactly where it is. Where it fits in neither place, it stacks: the
  window's name on one line and the insufficient-sample notice on the next,
  each breaking further only between whole words, inside whichever is wider,
  the window or its roomier margin. No word is split, cut or dropped. The
  wrapped caption sits on the same knock-out pad as the target caption, and
  the target caption drops to the band's floor, a placement it already uses,
  so the two never overprint.
- **The Spotlight's compact verdict line breaks between its facts.** When the
  verdict, the estimate, its range and the programmed rate do not fit on one
  line in the compact Spotlight, the line breaks between those facts, and the
  tally line and the figure move down to make room. Where the line fits, as at
  1200 px wide, nothing moves.
- **At 1280×720 and 1440×900 nothing changes.** Every caption on the replay's
  store fits on one line there, and the Spotlight uses its full layout, which
  this change does not touch.
- **The records follow.** Two new desk ledger stories with their replays, the
  pinned ledger inventory, and two DESIGN.md entries.

## Not in this change

- The canvas header's title, which also disappears at 832 px wide. Fixing it
  means amending a standing one-line ruling on that header, so it went to the
  release coordinator for a ruling.
- The y-axis minimum label half-hidden under the "70" target numeral, and the
  Spotlight's programmed-rate tick crossed by its rule. Both happen at every
  size, and R455 rules out changes at 1280×720 and 1440×900. Both went to the
  release coordinator as findings.
- Any classifier, cap, floor, staging predicate, ranking, served field or
  payload.
- The chart header's hover readout, which ADR 433 left clipped at 832 px.
- Pump writes, real-data reads and vendor fetches.

## Impact

- `frontend/diagnose-workstation-chart.js` (`renderCanvas`): the window
  caption's placement, and the target caption's placement when the window
  caption wraps.
- `frontend/diagnose-evidence-charts.js` (`basalEditorialOption`, compact
  branch): the verdict line's layout.
- The desk replay (`frontend/c4.replay.mjs`,
  `frontend/desk-behavior.replay.mjs`, `frontend/replay-cases.mjs`), the node
  tests beside each changed module, the desk ledger, the ledger inventory pins
  in `mockups/sweep/harmonic-v2-desktop/`, and DESIGN.md.
- Specs: `surfaces`, two ADDED requirements. No existing requirement is
  modified or removed.
