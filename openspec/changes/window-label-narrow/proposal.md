# #455 chart text at the narrowest split

## Status

The triage source for #455, an ordinary ticket change. It extends the shipped
desk's revise contract: the frozen desk behavior ledger
`mockups/harmonic-v2-desktop.behavior.md` and its replay
`frontend/desk-behavior.replay.mjs`. It adds three fail-first stories,
S183–S185, under the release's Q3 delegation and coordinator ruling R455 as
amended (Connor Griffin, 2026-09-23).

## Why

At an 832 px wide window, the narrowest at which Diagnose forms its two-pane
split, the glucose overview's window caption runs past the chart's right edge
and is cut off. On a thin window the cut takes the insufficient-sample notice
with it, and that notice is a safety statement: it is how the chart says it
prints no precise median.

The #433 renders show more text lost or struck in the same pane:

- At 832 px the Spotlight's compact verdict line ends at "programmed now", and
  the programmed rate it names is gone.
- At 832 px the canvas header's own title, "Glucose by time of day", draws
  nothing.
- At every size, the glucose overview's lowest y-axis label sits half hidden
  under the "70" target numeral.
- At every size, the Spotlight's programmed-rate rule runs through the axis
  label at that rate ("0.|60").

A chart laid out at one width also keeps that layout when the window is
resized, until something repaints it. A reader who narrows the window to 832 px
therefore gets the wider layout's text, cut.

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
  line in the compact Spotlight, the line breaks between those facts. The tally
  line and the figure move down to make room. Where the line fits, as at
  1200 px wide, nothing moves.
- **The canvas header keeps its title at the narrowest split.** Between 832 and
  1023 px wide, the All charts control shows its icon only, keeping its
  accessible name and tooltip. The freed room lets the title draw, truncating
  with an ellipsis if it must. The header stays one line.
- **Axis labels are no longer struck.** A y-axis label that would sit under a
  target numeral is not printed, because the numeral names the line there. The
  Spotlight's programmed-rate rule ends at the axis tick instead of running
  through the tick labels. Both fixes apply at every size.
- **Charts re-lay out when the window is resized.** When the glucose overview or
  an evidence chart changes size, its layout is re-run for the new size, not
  only rescaled. A narrowed window gets the narrow layout.
- **Otherwise nothing changes at 1280×720 or 1440×900.** Every caption fits on
  one line there, the Spotlight uses its full layout, and the header is as
  before. The two collision fixes are the only changes there (R455 as amended).
- **The records follow.** Three new desk ledger stories with their replays, the
  pinned ledger inventory, and DESIGN.md entries.

## Not in this change

- Any classifier, cap, floor, staging predicate, ranking, served field or
  payload.
- The canvas header's hover readout, which ADR 433 left clipped at 832 px.
- The two hand-built evidence stages, the behavioral fullscreen and the
  high-carb stage. Each keeps its own resize handling.
- Pump writes, real-data reads and vendor fetches.

## Impact

- `frontend/diagnose-workstation-chart.js`:
  - `renderCanvas`: the caption's placement, the target caption's placement
    when the caption wraps, and the y-axis labels;
  - `observeResize`: re-run the layout on a size change.
- `frontend/diagnose-evidence-charts.js` (`basalEditorialOption`): the
  middle-rank verdict line, and the programmed rule's length.
- `frontend/diagnose-workstation.js`: the overview and the evidence tiles
  re-lay out on a size change.
- `frontend/diagnose-workstation.css`: the All charts control at the narrowest
  split.
- The desk replay (`frontend/c4.replay.mjs`,
  `frontend/desk-behavior.replay.mjs`, `frontend/replay-cases.mjs`), the node
  tests beside each changed module, the desk ledger, the ledger inventory pins
  in `mockups/sweep/harmonic-v2-desktop/`, and DESIGN.md.
- Specs: `surfaces`, four ADDED requirements. No existing requirement is
  modified or removed.
