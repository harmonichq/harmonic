# #433 basal strip on short windows — design

## Verified facts (triage, 2026-09-23, on base a4d374a7)

Each fact names its evidence. Theory is marked as theory.

- **The canvas pane's rows have fixed floors.** `.canvas-pane` is
  `grid-template-rows: minmax(260px, 1fr) auto 210px; overflow-x: clip`
  (`frontend/diagnose-workstation.css`, the "canvas pane" block). Row 1 is the
  Spotlight, row 2 the "Glucose by time of day" header rail, row 3 the chart
  body with the Basal slots strip (`#lane-wrap`: `#lane-key` above `#lane`) at
  its bottom.
- **The header rail is one line by design.** `.dw .pane > header` has
  `min-height: 30px` (`frontend/theme.css`). The canvas header's title and
  metadata truncate rather than wrap "at every width the two-pane split can
  produce" (`.canvas-head h2` and `.canvas-head .head-line .meta` rules).
- **Inside the 210px body the chart already yields first.** `.canvas-pane >
  .body` is `grid-template-rows: minmax(0, 1fr) auto`, with `#chart` in the
  first track and the lane in the `auto` track. Nothing in that body's height
  depends on the window's width.
- **The key is one unbreakable line that already overruns the pane at 832px.**
  `.lane-key` is `flex-wrap: nowrap; white-space: nowrap; overflow: visible`,
  between the canvas spine's side margins, `--ck-grid-left: 34px` and
  `--ck-grid-right: 52px` (`frontend/diagnose-workstation.css`). The archived
  #359 measurement
  (`openspec/changes/archive/2026-09-06-359-canvas-pane-overprint/design.md`)
  found the key's `b.t` count pair reaching x=422 at 832px wide, against a pane
  whose right edge is 402. The `b.t` pair is used only in the key
  (`renderLaneKey`). The pane's `overflow-x: clip` cuts it rather than letting
  it paint over the inspector. D6's entry adds roughly 90px more whenever it is
  shown. S113 checks only `#lane-key`'s own box, which stays inside the wrap
  while its entries spill past it.
- **Nothing at desktop widths lets the pane scroll.** The pane is
  `overflow-x: clip`, which leaves the vertical axis `visible`. Every ancestor
  hides overflow: `.dw`, `.v2-diagnose`, `.gf-main`, and `.cockpit-shell` down
  to `html, body`. Only the ≤831px layout gives this same element
  `overflow-x: hidden; overflow-y: auto` ("The pane keeps its established
  internal scroll"). The ≤480px layout sets it back to `overflow: visible`.
- **The height budget.** At viewport heights ≤860px the shell rows are
  38px / 1fr / 24px (`frontend/shell.css`; lock term HV2-04). Diagnose's
  instrument row is 42px (`.dw` rows `42px minmax(0, 1fr)`). So the canvas
  pane is the viewport height minus 104px. Its floor is 260 + 30 + 210 = 500px.
  The strip therefore clips when the viewport is shorter than about 604px.
- **The #413 capture agrees at 1280×720.**
  `docs/scope/413-desk-design-evidence/lane-after-1280x720.png` shows a 616px
  pane. The Spotlight is about 376px, the header 30px, and the body's 210px
  ends at the footer with the whole strip visible.
- **A true 1200×736 viewport does not clip (measured).** Its pane is 632px,
  132px above the floor, and the base measurement below confirms no clipping
  there. So the reported "1200×736 window" was the browser's outer window, or
  the page was zoomed, and its CSS viewport was under 604px tall. That is
  still inference, because the report's own viewport was not captured. The
  issue's own theory, that the header is taller at 1200px, is refuted: the
  header measures 30px at every size.
- **The existing checks never test the pane.** S113's assertions
  (`frontend/c4.replay.mjs` `assertBasalLaneGallery`) require the key inside
  `#lane-wrap` and above `#lane`, and each cell inside the lane's track. They
  never require the strip to be inside the canvas pane's visible box. The
  replay driver accepts only `VIEWPORT=1280x720|1440x900`
  (`frontend/desk-behavior.replay.mjs` `VIEWPORTS`), so other sizes are set
  inside a story with `page.setViewportSize`, as S10 already does.
- **A recurring-lows lower is its own served status.** `safety.Status.HARM_LOWER`
  has the value `"lower (recurring lows)"` (`ciq_autotune/safety.py`). It is
  served as a basal row's `safety_status`, with `direction: "lower"` and
  `asserts_move: true`. The slot panel already prints it as its verdict
  (`renderSlotLevel`: `verdict: canStage ? s.safety_status : …`). The lane
  counts it as a plain `down` (`buildSlotLane` in
  `frontend/diagnose-workstation-chart.js`), so the key calls it "lower".
- **Two committed QA recipes already serve it.** In `scripts/qa_e2e_cases.py`,
  `basal-recurring-low-no-clean-median` serves a 05:00 recurring-lows lower
  with 0 steady nights. `basal-recurring-low-lower` serves a 03:00 one with 30
  steady nights. No replay story uses either today. The gallery case
  `basal-verdict-gallery` serves a measured lower at 00:30, not a
  recurring-lows one.

## ADR 433 — The desktop canvas pane scrolls instead of clipping the basal lane

**Decision.** At desktop split widths, the canvas pane gains the vertical
scroll the ≤831px layout already gives it: `overflow-y: auto` on the same
element. The row tracks are unchanged. At 1280×720 and 1440×900 the three rows
sum exactly to the pane, because the Spotlight's `1fr` absorbs the remainder.
There is no scroll range, and nothing on screen moves. Below the floor, the
pane scrolls, and the strip, its key and every cell are reached with the
pane's own scroll.

Horizontally, the pane cannot scroll: its width backstop computes to
`hidden`, and a sideways scroll would pull the plot out of register with the
clock. So the key must fit its width instead. `.lane-key` wraps between whole
entries (`flex-wrap: wrap`), and each entry stays one unbroken
`inline-flex` span. Extra lines take their height from the chart inside the
210px body, whose track is `minmax(0, 1fr)`, and the pane scrolls if the body
still overruns.

**The wrap also brings the cells and the chart back inside (measured).** At
832 wide the base measurement puts the chart body at 0–402 but `#lane-wrap`
and `#chart` at 0–512.75, and the key and the lane at 34–460.75. The body's
single grid column has been widened to the key's unbreakable 426.75px plus
its 34px and 52px margins. The lane and the chart ride that widened column,
so their last 110.75px lie past the pane's edge. The cells overrun it by the
same 58.75px as the key's last entry.

Wrapping removes the key's unbreakable width, so the column returns to the
pane's width, carrying the cells and the chart back inside. No other width
guard is added: once the key wraps, nothing unbreakable is left in that
column. S151 checks every key entry, every cell and `#chart` horizontally, so
a column that stayed wide would fail it.

**Scoped to the split.** Both declarations, the pane's `overflow-y: auto` and
the key's `flex-wrap: wrap`, live in one `@media (min-width: 832px)` block.
The base `.canvas-pane` and `.lane-key` rules sit outside every media query,
so adding either declaration there would also reach the ≤831px and ≤480px
layouts. Scoped this way, those layouts stay byte-identical, which keeps this
change inside the Unsupported line below and the sanction list.

At 1280 and 1440 wide the key has at least 764px of line, against roughly
430px of entries for a five-verdict lane (read from the #413 capture), or about
520px with D6's entry as well. So it stays on one line and nothing moves at
the supported sizes. At 1200 wide it has 684px, so it also stays on one line.
It wraps only near the narrowest split. Task 1 measures all of this; S113 and
S151 assert it.

**Why this and not the issue's other two options.** The requirement is "fully
visible, or reachable by scrolling, at every desktop window the split layout
forms at". Only a scroll meets it at every height.
- Shrinking the 210px body's chart before the strip only moves the threshold.
  Inside the body the chart already yields to the strip, so the option really
  means shrinking the body itself. That squeezes the glucose overview below a
  readable height and still clips under the new, lower floor.
- Lowering the Spotlight's 260px floor also only moves the threshold. It
  shrinks the evidence the pane leads with, and it still clips below the new
  floor.

The ≤831px layout's scroll on this element is shipped precedent.

**Consequences.**
- Once one axis scrolls, CSS Overflow computes the other axis's `clip` to
  `hidden`. The #359 width backstop keeps clipping horizontally, but a
  `hidden` axis can still be scrolled by script or by focus. S151 therefore
  requires the pane's `scrollLeft` to stay 0.
- The #359 comment's premise ("would hand this pane a vertical scrollport it
  does not have") is exactly what this decision changes, so the comment is
  rewritten.
- The #413 comment on `.lane-key` ("one line, always: a wrapped key would grow
  the canvas pane's fixed rows") is rewritten too. A wrapped key now takes its
  extra line from the chart inside the fixed body, and the pane scrolls when
  needed; it grows no row.
- At 832px wide, #359 also measured the header's hover readout (`#rd-p-n`)
  overrunning the pane edge. That is chart-header furniture, outside the basal
  lane, and it stays clipped exactly as today.
- Both declarations sit in the `@media (min-width: 832px)` block, so only the
  ≥832px split changes. The ≤831px and ≤480px blocks and every value they
  compute stay byte-identical.
- The fullscreen and All charts states resize the pane's rows to
  `auto minmax(0, 1fr)`, which fits, so the pane scroll never engages there.
  All charts keeps its own inner scroll.

**Contingency.** Stop at task 1 and report to the coordinator before
implementing if either of these shows up in the base measurement:
- the strip clips at a true 1200×736 CSS viewport;
- any row resolves larger than its declared track: the header taller than its
  30px rail, or the Spotlight taller than `max(260px, leftover)`; or
- 1200×560 or 832×560, the short sizes the new stories use, does not clip on
  base by at least 20px; or
- the key's entries do not fit on one line at 1280×720 on base. The fix would
  then wrap the key at a supported size, which contradicts "nothing moves".

In any of these cases the cause is not the fixed floors alone. The pane scroll would
still make the strip reachable, but a mis-sized row is a separate defect, and
this order does not fix it blind.

## ADR 433 — A recurring-lows lower takes its own key word, read from the served status

**Decision.** Settled by Connor Griffin (operator, 2026-09-23, D6): "a 'lower'
slot backed by recurring lows but few nights gets its own word in the key."
The coordinator confirmed this reading of D6 on the same day, and the scope
ledger records the ruling verbatim: the word goes on every served
"lower (recurring lows)" slot, thin or thick.

Every slot served as `"lower (recurring lows)"` counts in the key under its own
entry, `lower · recurring lows`, and never under `lower`. A cell and its key
mark keep the lower paint and glyph, so D6 is a wording change only. Each such
cell's title and accessible name use the long form
`suggests a lower because lows keep happening at this hour`, which echoes the
served basal annotation for this status. A lane with no such slot renders its
key exactly as today.

**Why every recurring-lows lower, not only the thin ones.**
- Every thin lower is already one of them. `safety._sign_tails` gives a slot
  with fewer than eight informative nights no supported direction (AGENTS.md,
  "Safety invariants"), so such a slot can assert a move only through
  `HARM_LOWER`. The harm layer's docstring says a thin median "may still move
  the slot below its staging gate, but only downward".
- Naming only the thin ones would need the frontend to count nights against
  the floor, which AGENTS.md forbids ("The frontend re-derives no floor, no
  threshold and no direction"), or a new served field.
- The word is also true of a recurring-lows lower with many nights, whose panel
  already reads "lower (recurring lows)".

**Where it lives.** The split is computed once, in `buildSlotLane`, from the
served `safety_status` value, and it is tested through that function's output.
The key (`renderLaneKey`) and the cells (`renderLane`) render from that output.
Nothing reads `estimate.n`, a floor or a rate for it. Staging, the Stage change
control and the Plan are unchanged. The key keeps one entry per verdict and
reason, and each entry's count equals the cells that share that verdict and
reason.

## Measurement (task 1 — coordinator-run, before implementation)

A worker may not bind a port in this release, so the coordinator runs this on
base a4d374a72c8048d9d93ee4925805b91cf5674835 and hands the numbers to `start`.

- **Surface and data.** The built base shell, served through the replay's own
  synthetic case server, which is AGENTS.md's copy-then-serve route
  (`--no-fetch`, `--token ''`, port 8765). The case is `basal-verdict-gallery`.
- **States.** Two:
  - Diagnose at rest on the 24 h window.
  - S113's drilled state, reached by `C2_STORIES.openBasalLane`.
- **Viewports.** 1440×900, 1280×720, 1200×736, 1200×700, 1200×650, 1200×620,
  1200×604, 1200×600, 1200×590, 1200×560, 1200×520, 832×720 and 832×560. At
  widths 1440, 1280, 1200 and 832, a height search finds the largest clipped
  height and the smallest clear height, between 400px and 900px.
- **Readings at each viewport:**
  - `innerWidth`, `innerHeight` and `devicePixelRatio`;
  - the resolved `gridTemplateRows` of `.cockpit-shell`, `.dw` and
    `.canvas-pane`;
  - the boxes of `.canvas-pane`, `#tile-field`, `#canvas-head`,
    `.canvas-pane > .body`, `#chart`, `#lane-wrap`, `#lane-key` and `#lane`;
  - the lowest cell bottom;
  - how far `#lane-wrap` and the lowest cell overrun the pane's bottom;
  - the pane's computed overflow, `scrollHeight` and `clientHeight`;
  - every overflow-clipping ancestor, with its bottom, its `scrollTop` and
    whether it clips the strip;
  - the document's scroll extent;
  - the key's text;
  - horizontally, for every key entry (`#lane-key > span`, the lead word
    included): its left and right edges and its top; the pane's right edge and
    its client right edge; how far the rightmost entry overruns each of them;
    the key's line count and its `scrollWidth` against its `clientWidth`; and
    how far the rightmost cell overruns the pane's right edge.

  The horizontal readings that decide are the ones at 832 and 1200 wide.
- **What decides.** Read the contingency above. The theory holds when all of
  these are true:
  - 1200×736 does not clip;
  - the clip threshold is near 604px at every split width;
  - the rows resolve to `max(260, leftover) / 30 / 210`;
  - the key is one line that fits inside the pane at 1200, 1280 and 1440 wide;
  - its rightmost entry overruns the pane's right edge at 832 wide, as #359
    recorded. The key wrap is what fixes that overrun.

The measurement asserts nothing and writes no repository file.

## Measured facts

The coordinator ran the measurement on 2026-09-23 with `measure-433.mjs` at
3f450e3c, whose frontend is byte-identical to base a4d374a7, on
`basal-verdict-gallery`. The rest state and S113's drilled state read the same
at every viewport. Task 1.1 commits the JSON verbatim under
`docs/scope/433-basal-strip-short-window-evidence/`.

Each row gives the pane's rows, then how far the strip overruns the pane's
bottom (lane), then how far the rightmost key entry and the rightmost cell
overrun its right edge (key, cells). Negative means inside.

| Viewport | Pane rows | Lane | Key | Cells |
|---|---|---|---|---|
| 1440×900 | 550 / 30 / 210 | 0 | −549.25 | −52 |
| 1280×720 | 376 / 30 / 210 | 0 | −389.25 | −52 |
| 1200×736 | 392 / 30 / 210 | 0 | −309.25 | −52.02 |
| 1200×604 | 260 / 30 / 210 | 0 | −309.25 | −52.02 |
| 1200×600 | 260 / 30 / 210 | 4 | −309.25 | −52.02 |
| 1200×590 | 260 / 30 / 210 | 14 | −309.25 | −52.02 |
| 1200×560 | 260 / 30 / 210 | 44 | −309.25 | −52.02 |
| 1200×520 | 260 / 30 / 210 | 84 | −309.25 | −52.02 |
| 832×720 | 376 / 30 / 210 | 0 | +58.75 | +58.75 |
| 832×560 | 260 / 30 / 210 | 44 | +58.75 | +58.75 |

- **Clip threshold.** At widths 1440, 1280, 1200 and 832 alike, 603px tall
  clips and 604px is clear.
- **Key.** It is one line at every size. At 1200, 1280 and 1440 its
  `scrollWidth` equals its `clientWidth` (684, 764 and 924). At 832 its entries
  need 427px against 316px of line.
- **Pane.** Its computed `overflow-y` is `visible` at every size, and the
  header is 30px at every size.
- **Contingency: not met.** 1200×736 does not clip. Every row resolves to
  `max(260, leftover) / 30 / 210`. 1200×560 and 832×560 each clip by 44px.
  The key fits on one line at 1280×720. The overrun at 832 wide was expected,
  and the key wrap fixes it, including the cells and the chart that ride the
  widened column.

## Revise preparation

- **Lifecycle.** `revise`. UI Craft routed it on 2026-09-23 with the inputs
  `shipped`, `runnable`, declaration `complete` and data source
  `manufactured`, and returned
  `{"mode":"revise","reason":"safe manufactured data source declared"}`. The
  work is convergent: the direction is settled, so no wireframe phase opens.
- **Safe start.** `AGENTS.md`, "The data boundary", the QA copy-then-serve
  command:
  `uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765`,
  run over a copy of `mockups/qa-e2e.synthetic/harmonic.sqlite`, or over a
  named case store from `scripts/gen_qa_e2e_db.py --case <name>`. The replay's
  case server (`frontend/replay-cases.mjs`) runs exactly that command.
- **Contract.** The frozen desk behavior ledger
  `mockups/harmonic-v2-desktop.behavior.md` and its replay
  `frontend/desk-behavior.replay.mjs`, left as frozen. This release re-runs no
  behavior sweep; the coordinator runs every port-bound leg.
- **Base.** origin/main a4d374a72c8048d9d93ee4925805b91cf5674835.
- **Inventory diff.** No story asserts any of these today:
  - the strip lies inside the canvas pane's visible box;
  - every key entry lies horizontally inside the pane;
  - the strip is reachable on a window shorter than the pane's floor;
  - a counted verdict agrees with its slot's panel;
  - the key names a recurring-lows lower.

  Each becomes a story here: S151, S152 and S153, plus an amendment to S113.
- **Sanctioned changes to shipped desk behavior.** Connor Griffin ·
  2026-09-23 · "Q1 A, Q2 A, defaults all fine, go". This is the answer to Q2,
  the standing sanction for every change the release's 13 issue checklists
  call for. It covers three changes:
  - On a desktop split window too short for its floors, the canvas pane
    scrolls, where it used to clip the strip.
  - Near the narrowest split, the key wraps between whole entries, where it
    used to cut its last entries off at the pane's edge. With it, the lane's
    cells and the glucose chart above them come back inside the pane. At 832
    wide their last 110.75px used to lie past the edge.
  - The key moves recurring-lows lowers out of "lower" into
    "lower · recurring lows" (D6, same date).

  No shipped behavior is retired.
- **Ledger records.**
  - Following the coordinator's freeze-header rule, this change records its
    stories in its own `## #433 amendment — 2026-09-23` section.
  - On this branch it moves only the numeric inventory literals in
    `acceptance.py` and `acceptance.test.py`.
  - The existing `★ FROZEN` blocks, the header's inventory line,
    ACCEPTANCE.md's count sentence, the count literal in `mockups/INDEX.md`'s
    desk row and the one release freeze block are coordinator-owned. They are
    written once on the integration branch.
- **Render matrix owed.** Synthetic before-and-after captures. The desk has one
  theme.
  - The canvas pane at 1200×560: before, the strip is cut; after, it is reached
    by the pane's scroll.
  - The canvas pane at 1280×720 and 1440×900: unchanged.
  - The canvas pane at 832×560: before, the key's last entries, the lane's
    right cells and the chart's right edge are cut at the pane's edge; after,
    the key wraps, and every entry, every cell and the whole chart lie inside.
  - The `basal-recurring-low-no-clean-median` lane key at 1280×720: before,
    "lower 1"; after, "lower · recurring lows 1".

## Risk contract

- **Must prevent:**
  - real glucose, insulin or schedule values in any committed fixture,
    capture, log or screenshot;
  - a lane key word or count that differs from the served verdicts, which
    would be silent incorrect success;
  - a key entry cut off or split, or a cell or the chart cut, at the pane's
    edge at any split width;
  - any staging, verdict, floor or direction decision moving into the
    frontend;
  - the canvas pane gaining a scroll range, or moving anything, at 1280×720 or
    1440×900.
- **Must recover:** none.
- **Accepted failure:** on a window shorter than the pane's floor, the strip is
  not visible at rest. The reader scrolls the canvas pane to reach it, and the
  Spotlight stays at its 260px floor.
- **Unsupported:**
  - layouts below 832px wide, which already scroll or flow and are unchanged;
  - making the strip visible at rest on every short window;
  - the chart header's hover readout at the narrowest split, which stays
    clipped as today.
- **Evidence owed:**
  - On base, S151 and S152 fail at the short sizes for the clipping reason,
    with S151 also failing on the key entries', the cells' and the chart's
    horizontal overrun at 832 wide, all in its one failure message. S113's
    recurring-lows variant fails on the key word. All three pass on the branch.
  - S153 passes on base and on the branch.
  - S113's pane checks and one-line key check pass at both supported sizes.
  - Node tests cover `buildSlotLane`'s recurring-lows split and `renderLane`'s
    cell names.
  - The complete desk ledger passes at both sizes on the pushed commit.
- **Why:** the strip carries the only stageable advice on a data set like the
  report's, so the harm is advice the reader cannot reach, or a key word that
  claims something the backend did not serve. It is not downtime.
- **Disposition:** admitted here; the ticket's lock pins this file.
