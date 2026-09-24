# #455 chart text at the narrowest split — design

## Verified facts (triage, 2026-09-23, on base b03431d2)

Each fact names its evidence. Theory is marked as theory.

### The window caption

- **The caption is cut at 832 px on both sides of #433.** The #433
  before-and-after renders (`docs/scope/release-422-434-evidence/433/renders/`,
  433-A1 and 433-A2 at 832×720 and 832×560, store `basal-verdict-gallery`,
  Diagnose on 24 h) show the glucose overview's caption as "24 H 00:0", cut at
  the chart's right edge, after #433. Before #433 it is cut at the pane's edge
  instead, because the chart was then wider than the pane. At 1200×560,
  1280×720 and 1440×900 the same caption reads in full on one line:
  "24 H 00:00–24:00 · INSUFFICIENT SAMPLE — thinnest bin holds 0".
- **Why it is cut: a parked caption never checks that it fits.**
  `renderCanvas` (`frontend/diagnose-workstation-chart.js`, the block headed
  "window label: fit it to the window, or move it out") tries, in order:
  1. the head and its tail on one line inside the window, when the estimate
     plus `LABEL_PAD` (10) fits the window's width;
  2. the head alone inside the window, when the window is not thin and the head
     fits;
  3. otherwise, one line parked outside the window on the side with more plot
     room (`rightRoom >= leftRoom` picks the right), anchored at the window's
     edge 6 px out (`position: labelSide`, `distance: 6`), carrying the tail
     when the window is thin.

  Nothing checks that step 3's line fits its side. The chart's margins are
  `GRID = { left: 34, right: 52 }`, and at 832 wide `#chart` is 402 px, the
  pane's width after #433 (ADR 433, "Measured facts"), so the plot is 316 px.
  A 24 h window is the whole plot, so both sides have 0 px of plot room. The
  tie goes right, and the caption starts 6 px past the plot's right edge with
  46 px of chart left.
- **The estimate errs wide.** `estimateTextPx` puts the 24 h head at 107.2 px
  and its thin tail, separator included, at 232.2 px. That is 339.4 px, over
  the 316 px plot before the 10 px pad. The 1280×720 render paints the whole
  caption in about 316 px (x 258 to 574).
- **Theory: every preset caption on this store is thin.** In the renders the
  store's median line exists only near midnight, so every quarter window
  probably has a bin holding 0 and prints the notice too. S183 asserts what
  each preset actually paints and does not depend on this theory, except for
  its live-resize leg's fail-first on base (task 1.5).
- **ECharts' own wrap keeps words whole, with one trap.**
  `docs/scope/455-caption-wrap.spike.mjs` (port-free, exits 0) runs ZRender
  5.5's `parseRichText` with `width` and `overflow: 'break'`. It breaks only at
  spaces; the en dash, the em dash and the middle dot are in-word characters,
  so "00:00–24:00" never splits. The trap: with `overflow: 'break'` on, a
  newline that ends a plain segment is dropped, and the head fuses into the
  tail ("24:00INSUFFICIENT"). A newline that opens the tail's rich token
  (`{th|\n…}`) stacks correctly.
- **A label-level pad would not hug the text.** ZRender
  (`zrender/lib/graphic/helper/parseText.js`, `parseRichText`) sets a label's
  content width to its `width` whenever one is set, and draws a label-level
  `backgroundColor` at that full width. It draws a rich token's background at
  the token's own width, which is its text width plus its horizontal padding.
  The spike's second part lays the padded head and tail tokens out as
  `_renderRichText` does, with the label `width` at the region less 2 × 5 px.
  At 832 wide every pad stays inside its region in all five cases: a centred
  24 h caption, Evening and Afternoon parked left, Overnight parked right, and
  a head that itself wraps. The opening newline's empty first piece is not
  added to a line that already holds the head, so it moves nothing. ZRender
  reads padding in ECharts' normalized four-value form.

### The Spotlight's middle-rank verdict line

- **It loses its programmed rate at 832.** The same renders show the
  Spotlight's first line ending "SUPPORTED · 0.70 U/h · (0.70–0.70) ·
  programmed now" at 832×720 and 832×560. At 1200×560 it ends
  "… · programmed now 0.60" for the same slot. `basalEditorialOption`
  (`frontend/diagnose-evidence-charts.js`) draws that line whenever the seat
  is under `MIDDLE_RANK_WIDTH` (780), as one `graphic` text at `left: 14`, set
  in `600 11px` monospace, with no width and no fit rule. Its tally line does
  have one: it steps down from 10 px to 9 px type to stay inside
  `seatWidth − 2 × margin`. The middle-rank grid reserves `margin + 26` px on
  the right, the tile's Keep control column.
  Theory: the rate is painted under the Keep control or past the canvas edge;
  the fix is the same either way.
- **A smaller type cannot rescue that line.** The longest verdict the builder
  serves, as in the node fixture "INSUFFICIENT EVIDENCE · 0.74 U/h ·
  (0.60–0.92) · programmed now 0.60", is 68 characters. Even at 9 px
  monospace, about 5.4 px a character, that is about 367 px. The line's column
  at 832 is about 327 px (theory from the render: a seat of about 381 px, less
  the 14 px left margin and the 40 px right reserve).

### The canvas header at 832

- **The title draws nothing at 832.** In the 832×720 render the header shows
  "pooled from 30 captured CGM days · ±45 min" (x about 60 to 301) and the All
  charts control (x about 332 to 398), and no title, not even an ellipsis. The
  capture's page text still contains "Glucose by time of day".
- **Why.** `.canvas-pane > header.canvas-head` is one grid row,
  `minmax(0, 1fr) auto auto`, and it keeps the 12 px `gap` of `.pane > header`.
  Its padding is 34 px left and `--ck-pad` (12 px) right, so at 832 its content
  box is 402 − 46 = 356 px. The provenance (`#canvas-pool`, `nowrap`, 14 px
  left padding) and the control cluster (`#chart-headacts`, 14 px left margin)
  take their full width in their `auto` columns. The title's column takes what
  is left. Theory from the render and the rules: about 255 + 24 + 95 px, which
  is more than 356, so the title's column is 0. The owner ruling of
  2026-08-19, recorded on `.canvas-head h2`, says the header "stays one line at
  every width the two-pane split can produce" and gives way "by TRUNCATING,
  never by wrapping".
- **The control already carries its name.** `chartActionButton`
  (`frontend/diagnose-workstation.js`) sets the browse button
  (`#explorer-trigger`) `title` and `aria-label` to "All charts". Its visible
  word is a child `span` beside an `svg` face (`aria-hidden`). Hiding the span
  leaves the button's name and tooltip unchanged.
- **Theory: the title fits from about 994 px wide.** Diagnose's Findings rail
  is 430 px (HV2-05), so the pane is the viewport less 430. At 1024 wide
  (a 594 px pane) the title's column is about 174 px, against the title's
  about 144 px in the 1280 render. The only nearby breakpoint in the
  stylesheets (`desk.css`, 701–1100 px) sizes the paired Changes and Day
  panes, not Diagnose.

- **Measured: the header's widths (base leg, coordinator-run 2026-09-23).**
  S185 printed the same widths at 1280x720 and 1440x900 runs.
  - On base b03431d2 at 832×720 and 832×560 the title's box is 0 px wide
    (clientWidth 0, scrollWidth 144). The provenance is 255.14 px, the All
    charts control 76.86 px and its word 50.86 px.
  - At 1024×768, 1280×720 and 1440×900 the title prints whole (143.94 px box,
    scrollWidth 144), with the same provenance, control and word.
  - On the branch at 832 the title's box is 41.86 px (scrollWidth 144,
    truncated to a letter or two and an ellipsis), the control 21 px, and its
    word 0 px.
  - The title's theory above holds: at 1024 it prints whole.
- **Measured: the All charts control's box overhangs the header rail by
  3.5 px, and nothing of it is hidden.** On base and branch alike, at every
  size S185 visits, the control's box reaches 3.5 px past the header's box.
  The cause is in the cascade (read from the stylesheets):
  - chrome.css's shell floor `.v2-content button { min-height: 36px }`
    outranks `.chart-headacts button { height: 20px }`, because a larger
    `min-height` beats `height`. So the button is 36 px tall inside its 20 px
    cluster.
  - The rail is 30 px (`min-height`), with 4 px pads and a 1 px bottom rule, so
    its content box is 21 px. The cluster is centred in it.
  - The 36 px box therefore reaches (36 − 21) / 2 − 4 = 3.5 px above the rail
    and 2.5 px below it.

  It is not a visible clip. The header sets no overflow, and the button has a
  transparent ground and no border. Its 13 px icon and 11 px word are centred
  in the box, inside the rail. Only an empty box overhangs. Theory, not
  measured: it may also take a pointer in that strip where no later sibling
  covers it. S185
  therefore places the control by what the reader sees of it: its rendered
  icon and word. The box stays unchanged (coordinator ruling, 2026-09-23).

### Collisions at every size

- **The lowest y-axis label sits under the "70" numeral.** `renderCanvas`'s
  y-axis runs from `range[0]` to `range[1]` at `interval: 60`, with
  `axisLabel` at `fontSize: 10` and the `'{value}'` formatter. Its target
  numerals are the `markLine` labels at `position: 'start'`, `fontSize: 10`,
  `padding: [2, 4]`, on an opaque `colors.rail` pad. On this store the axis
  runs 60 to 200 (renders), so the "60" label sits 10 mg/dL under the "70"
  numeral. On a plot about 108 px tall for 140 mg/dL, that is about 8 px. The
  832, 1280 and 1440 renders all show the "60" half hidden under the "70"'s
  pad. The axis's "180" label sits exactly under the "180" numeral and is
  hidden whole.
- **The programmed rule runs through the tick labels.** In
  `basalEditorialOption`'s `furniture` series the rule is
  `box(ruleX - .75, head, 1.5, base + 24 - head, colors.basal)` at both ranks.
  The x axis draws its ticks 4 px long (`axisTick.length: 4`) and its labels
  6 px below the axis (`axisLabel.margin: 6`). So the rule's last 18 px cross
  the tick-label band, and any tick label at the programmed rate. The 832,
  1200, 1280 and 1440 renders all show "0.|60". ADR 205
  (`openspec/changes/archive/2026-08-31-205-basal-evidence-editorial/`) binds
  nothing about the rule's length below the axis.

### Resize

- **A resize rescales and does not re-lay out.** `observeResize`
  (`frontend/diagnose-workstation-chart.js`) calls only `chart.resize`. The
  overview (`observeResize(el('chart'), () => chart)`) and every evidence tile
  (`installTileMount`) use it. The window's own `resize` event repaints only
  the brace. Two layout choices are made at build time:
  - `renderCanvas` makes its caption decisions from `el.clientWidth`;
  - `mountDescriptorChart` builds each tile's option, including the basal
    rank choice, from its host's width.

  So after a live resize each chart keeps the layout chosen at the old width,
  until the next paint. Theory: going from 1280 to 832, an Evening caption
  parked left on one line runs past the chart's left edge. The Spotlight keeps
  its full layout in a middle-rank seat.

### Measurement

- **Painted chart text is measurable.** `assertResponseAnchorGeometry`
  (`frontend/diagnose-replay.mjs`) reads each painted text span from
  `chart.getZr().storage.getDisplayList()` (`type === 'tspan'`), applies its
  transform to `getBoundingRect()`, and compares the box with the host's
  `clientWidth`. Each span's `parent` is the text element that owns it, whose
  `style.text` is the whole formatted label. `laidOutBrace404`
  (`frontend/c4.replay.mjs`) presses a Window preset and waits until the chart
  and its brace are idle.
- **Paint order is not reading order.** ZRender's `_renderRichText`
  (`zrender/lib/graphic/Text.js`) places a line's right-aligned tokens from
  the line's right end, walking the tokens backwards. So a one-line caption
  parked left of its window (label `align: 'right'`) creates, and paints, its
  tail's span before its head's. Its words therefore read in reading order:
  line by line from the top, each line left to right. The coordinator's first
  branch leg showed the one-line Afternoon and Evening captions at 1280×720
  and 1440×900 as "0 painted captions". They were read tail first, the same as
  on base; the captions are unchanged there, as the 850 px node test pins.
- **No story measures any of this.** S151 checks `#chart`'s box inside the
  pane, not the text drawn in it. No story reads the Spotlight's verdict line,
  the header's title, or text overlaps in either chart.

## ADR 455 — The window caption stacks and wraps inside the chart when one line fits nowhere

**Decision.** Settled by coordinator ruling R455 under the release's Q3
delegation (Connor Griffin, 2026-09-23): "At 832 px the window label wraps
inside the chart bounds (words kept whole, nothing shortened); no change at
1280x720 or 1440x900. A replay check measures it."

`renderCanvas` keeps steps 1 and 2 above unchanged. Step 3 changes in two ways:

- **Parked on one line only when it fits.** The caption parks on one line on
  the side with more plot room, the same side as today, only when its
  estimated width fits that side's room:
  - on the right, from 6 px past the window's end to the chart's right edge,
    because the chart's right margin holds nothing;
  - on the left, from 6 px before the window's start to the plot's left edge,
    because the y-axis labels sit beyond it.

  Anchor, distance, offset and alignment stay as today.
- **Otherwise it wraps.** The caption goes inside whichever region is wider:
  the window, less `LABEL_PAD`, or that side's room. It gets:
  - a label `width` of that region less 2 × 5 px, the pad's two sides, and
    `overflow: 'break'`;
  - the head in its own rich token, `hd`, which restates the label's colour,
    10 px size, 700 weight and 0.5 letter spacing, so it paints as the head
    does today;
  - on a thin window, the tail in the `th` token on its own line: the
    formatter is `{hd|<head>}{th|\n<tail>}`, and the one-line separator
    " · " gives way to the line break. The newline opens the tail's token, per
    the spike;
  - on a window that is not thin, the `hd` token alone, which also breaks
    only between words;
  - the knock-out pad the target caption and the 70/180 numerals already use,
    on the tokens and never on the label: `hd` and `th` each carry
    `backgroundColor: colors.rail` and `padding: [2, 5]`. Each line's pad
    then hugs its own text, and none reaches past the region (the spike);
  - no explicit line height: each padded token's own height, about 14 px,
    sets the pitch, so two lines' pads abut without covering each other's
    text;
  - the same anchor as today for its region: the window area's `insideTop`
    label inside the window, or the parked `markPoint` outside it.
- **The target caption moves when the window caption wraps.** It takes its
  existing floor placement (`insideBottomLeft`, distance 0), the #370 escape it
  already uses when a gate strikes it. A wrapped caption fills the row under
  the plot's ceiling where the target caption otherwise sits.

Nothing reads a floor, a count or a verdict it did not already read: thinness
is the chart's existing `windowSupport` result, unchanged. On a window that is
not thin, a spread tail that does not fit keeps shedding as today (coordinator
ruling on Q3, "keep"): it is not the safety notice, and it also prints in the
header readout and the inspector.

**Why this and not the issue's other options.**

- Shortening it in the wearer's words: R455 says nothing is shortened.
- Moving it:
  - The header row above the chart is full at 832 (see the header ADR).
  - The chart's top gutter is one 20 px line. Growing it shrinks the plot and
    moves the brace grips, which are pinned to the plot's ceiling band.
- ZRender's first-fit wrap without stacking: it would split the notice
  mid-phrase, leaving "holds 0" alone on the second line with the separator
  mid-line above it. Stacking keeps the safety statement together.

**Consequences.**

- Where one line fits, nothing moves. At 1280×720 and 1440×900 every Window
  preset's caption on the replay's store fits, and S183 asserts one line
  there. The tightest is a thin Afternoon at 1280 wide: about 373 px estimated
  against about 380 px of room. A two-digit bin count would tip it into the
  wrap, which S183's desktop check would report.
- The rule belongs to the chart, not to one width. A caption that overruns
  today stacks at any size: at 1200 wide a thin Afternoon caption (about 373 px
  estimated, 340 px of room) that today runs into the y-axis labels; in the
  layouts below 832 px; and a thin, hand-drawn window at any size.
- Because the estimate errs wide, a caption within that error of its room
  stacks where the painted line might just have fit. It never clips.
- The midnight-crossing CONTINUES marker, the drag readout and every one-line
  placement are unchanged.
- The target caption's floor placement already ships. It is now also used
  whenever the window caption wraps.

## ADR 455 — The Spotlight's middle-rank verdict line breaks between its facts

**Decision.** Under the coordinator's scoping for #455 (every Diagnose chart
text that overruns at 832 px in the #433 renders is in scope) and R455's
standard (whole words, nothing shortened), in `basalEditorialOption`'s
middle-rank branch:

- **The facts and the column.** The verdict line's facts are the verdict word,
  the estimate (or "no estimate"), the range when served, and
  "programmed now <rate>" when a programmed rate exists. They are set in a
  column from the left margin to the plot's right edge:
  `seatWidth − L.margin − (L.margin + 26)`. That column ends where the Keep
  control's column begins.
- **One line when it fits.** When the joined line fits the column by the
  module's per-character estimate for the monospace face, it stays exactly as
  today.
- **Otherwise it breaks between facts.** A line break replaces the " · "
  separator at each break, and each line holds as many whole facts as fit.
  The text stays one `graphic` text with newline-separated lines and an
  explicit 14 px line height. ZRender's default line pitch equals the type
  size, which would crowd the lines. The tally line's `top` and the grid's
  `top` both move down 14 px for each added line. The footer band is
  unchanged.
- **The estimate.** The monospace per-character estimate is no smaller than
  0.62 of the type size. It errs wide, never short.

The tally line keeps its own fit rule, and the description, the facts and
their order are unchanged. The full layout, at seats of 780 px and wider, is
untouched.

**Why this and not a smaller type.** Settled by the coordinator's ruling on
Q2 ("accept"), 2026-09-23.

- A smaller type alone cannot fit the longest verdict at 832 (see the facts
  above).
- A hybrid is possible: step the verdict down to 9 px first, and break only
  when that still does not fit. It would fit the replay store's line on one
  line at 832, about 312 px estimated at 9 px against about 327 px of column,
  and keep the figure's height. But it sets the verdict, the tile's leading
  fact, below the tally line's 10 px, which inverts the two lines' rank. It
  also leaves two fit rules on one line.

**Consequences.**

- At 832 the replay store's slot reads on two lines:
  "SUPPORTED · 0.70 U/h · (0.70–0.70)", then "programmed now 0.60".
- The figure loses 14 px of height per added line. Theory, read from the
  renders:
  - At 832×720 the plot is about 145 px tall and keeps about 131.
  - At 832×560 the Spotlight sits at its 260 px floor, and its plot is only
    about 25 px tall; it keeps about 11. That is ADR 433's accepted short
    window, where the reader already scrolls the canvas pane. The fact the
    wearer reads, the programmed rate, is worth more there than 14 px of an
    already vestigial figure.
- A middle-rank cell in All charts, drawn at about 480 px at every desktop
  size, breaks the same way wherever its line does not fit today. The replay
  store's line fits a 480 px cell (56 characters, about 382 px estimated
  against a 426 px column), so its cells do not move.

## ADR 455 — At the narrowest split the All charts control shows its icon only

**Decision.** Coordinator ruling on Q1, option (b), under the Q3 delegation
(Connor Griffin, 2026-09-23). The 2026-08-19 owner ruling stands and is not
re-litigated: the header truncates and never wraps, and its provenance is never
hidden. So the header gets no second line.

- **The band.** Between 832 and 1023 px wide only, in one
  `@media (min-width: 832px) and (max-width: 1023px)` block in
  `frontend/diagnose-workstation.css`, the browse control (`#explorer-trigger`)
  hides its word's `span`. It keeps its icon, its `aria-label` and its `title`,
  "All charts", which `chartActionButton` already sets.
- **What the room does.** The freed room goes to the title's column. The title
  keeps its existing truncation (`overflow: hidden; text-overflow: ellipsis`),
  so it draws whole where it fits and truncates where it does not.
- **Why the band stops at 1023.** 1024 px is the tablet width the 2026-08-19
  ruling was made at, and from about 994 px wide the title fits beside the
  word (theory, see the facts). S185 pins the band's upper edge at 1024×768.

Theory: the word and its 5 px gap free about 60 px, so at 832 the title's
column grows from 0 to about 40 px and draws about "GLUCO…". S185 prints the
header's parts' widths, so the base leg records the measured numbers.

**Consequences.**

- At 1024 px wide and above, the header is byte-for-byte as today.
- Between 994 and 1023 px wide, where the title would fit anyway, the control
  also shows its icon only. The band is a width, not a measurement of the text.
- The All charts control in the fullscreen and All charts views is the Close
  control, which this rule does not touch.
- The header's hover readout also gains the room, but ADR 433 left it clipped
  at 832, and this change does not assert it.

## ADR 455 — Chart furniture yields to axis labels

**Decision.** Coordinator ruling on the findings, amending R455 (Connor
Griffin, Q3 delegation, 2026-09-23): "desktop sizes may change for exactly
these two collision fixes and nothing else".

- **A y-axis label yields to a target numeral.** `renderCanvas`'s y-axis label
  formatter prints nothing for a tick value whose label centre would lie within
  13 px of a target numeral's centre:
  - the distance is measured at the plot's height, `el.clientHeight` less the
    grid's 20 px top and 26 px bottom, over the axis range;
  - 13 px is half the tick label's 12 px line plus half the numeral's 14 px
    padded box;
  - `renderCanvas` reads `el.clientHeight` the way `plotBox` reads
    `clientWidth`;
  - the numeral wins because it names the target line there. The hidden tick's
    value is plain from its neighbours: 70, 120, 180 and 200 remain.

  On this store that hides the "60" under the "70" and the "180" exactly under
  the "180" numeral, and keeps "200", about 15 px above the "180".
- **The programmed rule ends at the axis tick.** In both ranks the rule runs
  from its head to `base + 4`, the x axis's own tick length, above the tick
  labels that start 6 px below the axis. It never enters the tick-label band.

**Why not the other way round.** Hiding the target numeral would drop the
chart's name for the target line. Padding the tick label would cover the rule,
which is the chart's statement of the programmed rate.

**Consequences.**

- At every size, including 1280×720 and 1440×900, the glucose axis prints one
  or two fewer tick labels on a store whose axis starts near a target bound.
- The Spotlight's rule is 20 px shorter below the axis.
- Neither fix reads a floor, a count or a verdict.

## ADR 455 — A chart re-lays out when its size changes

**Decision.** Recorded to R455's standard, "At 832 px the window label wraps
inside the chart bounds", as the default of this triage's Q4. That standard
holds only if narrowing the window reaches the narrow layout.

- **`observeResize` gains an optional relayout callback.** When the observed
  box changes size after its first report, it resizes the canvas as today and
  then calls the callback, in the same animation frame.
- **The overview's callback repaints the chart and its brace**, as the other
  paint paths do, except while a drag owns the chart (`dragActive`).
- **A descriptor tile's callback rebuilds its option.** `mountDescriptorChart`
  returns a rebuild that re-runs `optionForDescriptor` with the same inputs and
  the host's new width, plus the ≤480 px axis-name rule, then calls
  `setOption(option, true)`.
- **Unchanged.** The two hand-built stages (`renderBehavioralFullscreen`,
  `renderHighCarbStage`) and the row minis keep today's rescale-only resize.

**Why.** Every width-dependent choice this change adds, and the ones it
extends, is made at build time: the caption's fit, the target caption's
placement, the y-label rule and the Spotlight's rank and verdict line. Without
a relayout, a reader who narrows the window keeps the wide layout's text until
their next click. That is the cut caption R455 forbids, in a state one resize
reaches.

**Consequences.**

- A window resize re-renders the overview and the descriptor tiles once per
  animation frame while it lasts. The throttle already coalesces the
  observer's reports.
- A relayout during a drag is skipped. The drag's own paint path owns the
  chart until the drag finishes.
- The first report after mount does not relayout, so a mount still renders
  once.

## Revise preparation

- **Lifecycle.** `revise`. UI Craft routed it on 2026-09-23 with the inputs
  `shipped`, `runnable`, declaration `complete` and data source
  `manufactured`, and returned
  `{"mode":"revise","reason":"safe manufactured data source declared"}`.
  The work is convergent: R455 and the coordinator's rulings settle the
  direction, so no wireframe phase opens.
- **Safe start.** `AGENTS.md`, "The data boundary", the QA copy-then-serve
  command:
  `uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765`.
  It runs over a copy of `mockups/qa-e2e.synthetic/harmonic.sqlite`, or over a
  named case store from `scripts/gen_qa_e2e_db.py --case <name>`. The replay's
  case server (`frontend/replay-cases.mjs`) runs exactly that command.
- **Contract.** The frozen desk behavior ledger
  `mockups/harmonic-v2-desktop.behavior.md` and its replay
  `frontend/desk-behavior.replay.mjs`. This release re-runs no behavior sweep;
  the coordinator runs every port-bound leg.
- **Base.** origin/main b03431d2b937b46bdabbb2de1e6ba0ba6c6b57b1.
- **Inventory diff.** No story asserts any of these today:
  - the glucose overview's caption inside the chart with every word whole,
    drawn or resized to size;
  - no overprinted text in the glucose overview;
  - the Spotlight's verdict line inside the chart and clear of the Keep
    control;
  - the canvas header's title drawing at the narrowest split.

  Each becomes a new story: S183, S184 and S185. No existing story is amended
  or retired. The programmed rule's length is geometry the node tests compute,
  so it needs no story.
- **Sanctioned changes to shipped desk behavior.** Q3 delegation, Connor
  Griffin, 2026-09-23 ("figure it out yourself from here"); coordinator ruling
  R455, as amended for the two collision fixes. It covers these changes:
  - a window caption that fits on one line nowhere stacks and wraps inside the
    chart, on the knock-out pad, and the target caption takes its floor
    placement then;
  - the Spotlight's middle-rank verdict line breaks between facts where it
    does not fit, and its tally line and figure move down with it;
  - between 832 and 1023 px wide, the All charts control shows its icon only;
  - a y-axis label under a target numeral is not printed, at every size;
  - the Spotlight's programmed rule ends at its axis tick, at every size;
  - the overview and the evidence tiles re-lay out when their size changes.

  No shipped behavior is retired. At 1280×720 and 1440×900 only the two
  collision fixes are visible.
- **Story corrections after the coordinator's legs (coordinator-authorized,
  2026-09-23).** Both of the first branch leg's failures were story defects,
  not product defects.
  - S183 reads each caption in reading order, not paint order (see
    "Measurement").
  - S185 places the All charts control by its rendered icon and word, not by
    its box, which overhangs the rail by 3.5 px (see "The canvas header at
    832"). No product change follows from either, and R455 is not widened.
- **Ledger records.**
  - Following the release's freeze-header rule, this change records its
    stories in its own `## #455 amendment — 2026-09-23` section.
  - On this branch it moves only the numeric inventory literals in
    `acceptance.py` and `acceptance.test.py`.
  - These are coordinator-owned and written once on the integration branch:
    - the existing `★ FROZEN` blocks;
    - the header's inventory line;
    - ACCEPTANCE.md's count sentence;
    - the count literal in `mockups/INDEX.md`'s desk row;
    - the one release freeze block.
- **Render matrix owed.** These are synthetic before-and-after captures on
  `basal-verdict-gallery`, Diagnose at rest. The desk has one theme.
  - 832×720 and 832×560, for each Window preset (Overnight, Morning,
    Afternoon, Evening, 24 h). Before:
    - the caption is cut;
    - the Spotlight's rate is missing;
    - the header's title is absent;
    - "60" sits under "70".

    After, all four are whole or clear, and the target caption sits on the
    band's floor wherever the caption wraps.
  - 1200×736 on 24 h and on Afternoon. Before and after, 24 h keeps its one
    caption line and the Spotlight line stands on one line. On Afternoon the
    caption stacks after, where before it ran into the y-axis labels.
  - 1024×768 on 24 h: the header unchanged.
  - 1280×720 and 1440×900 on every preset: changed only where the "60" (and
    the hidden "180") tick label and the Spotlight rule's stub are concerned.
  - 832×720, a crop of the glucose overview with Evening pressed and one with
    Afternoon pressed. The parked caption is shown wrapped. Before, it runs
    past the chart's left edge. After, each line's pad hugs its own text
    inside the left margin, clear of the y-axis labels.
  - 1280×720 with Evening pressed, then narrowed to 832×720 with nothing
    pressed. Before, the parked caption is cut at the chart's left edge and
    the Spotlight keeps its full layout. After, both are laid out for 832.

## Risk contract

- **Must prevent:**
  - real glucose, insulin or schedule values in any committed fixture,
    capture, log or screenshot;
  - a caption or verdict line that splits, cuts or drops a word, or that
    prints a thin window's name without its insufficient-sample notice. That
    would be silent incorrect success: the notice is how the chart says it
    prints no precise median;
  - any caption, verdict-line or header-title text past its chart's or its
    header's bounds, or under the Keep control, in a state S183, S184 or S185
    covers, including one reached by resizing the window;
  - any text in the glucose overview overprinting other text there;
  - a caption's pad reaching past its region, straddling a window gate, or
    entering the y-axis label column;
  - the programmed rule crossing a tick label;
  - any change at 1280×720 or 1440×900 beyond the two collision fixes, in the
    states S183, S184 and S185 cover;
  - the All charts control losing its accessible name or tooltip;
  - any thinness, floor, verdict or staging decision moving or being re-derived
    in the frontend.
- **Must recover:** none.
- **Accepted failure:**
  - A caption within the estimate's error of its room stacks where one painted
    line might just have fit.
  - A caption parked beside a narrow window takes two or three lines over the
    dimmed remainder.
  - At 832 the Spotlight's figure is 14 px shorter. At 832×560 that leaves
    about 11 px of plot.
  - At 832 the header's title is truncated to a few letters and an ellipsis.
  - A window resize re-renders the overview and the descriptor tiles every
    frame while it lasts.
- **Unsupported:**
  - the canvas header's hover readout at the narrowest split;
  - the tally line's own fit rule;
  - the drag readout;
  - the two hand-built stages and the row minis on resize;
  - layouts below 832 px wide, which take the chart rules but which no story
    measures.
- **Evidence owed:**
  - On base b03431d2, with this branch's replay harness laid over it, task 1.5
    records:
    - S183 failing at 832×720 and 832×560 on the 24 h caption past `#chart`'s
      right edge;
    - S183 failing on the Evening caption after the live narrowing;
    - S183 failing at the run's own size only on y-axis labels overlapping
      target numerals;
    - S184 failing at 832;
    - S185 failing at 832 on the title, and passing at 1024×768 and the run's
      own size.

    On the branch all three pass at 1280×720 and at 1440×900. On the branch
    S183 also finds every wrapped caption's pad boxes inside their region,
    straddling no gate and clear of the y-axis label column. On base no
    caption wraps, so none is drawn.
  - Node tests through `renderCanvas`'s emitted option cover:
    - the stacked formatter, `{hd|…}{th|\n…}`, with the newline opening the
      tail's token;
    - the label width at the region less 10 px, and the break overflow;
    - the pad on the `hd` and `th` tokens and none on the label;
    - the target caption's floor placement;
    - one-line placements unchanged, both where they fit inside and where they
      park;
    - the y-axis formatter's yield to the target numerals.
  - Node tests through the basal editorial option cover:
    - the break between facts;
    - the tally and grid shift;
    - one line at a wide seat;
    - the rule ending at `base + 4` at both ranks.
  - A node test covers `observeResize`'s relayout on a size change, and none
    on its first report.
  - Fake-page node tests cover the three replay helpers.
  - The complete desk ledger passes at both sizes on the integrated commit.
- **Why:** the harm is a safety notice, or the programmed rate a basal
  suggestion is read against, that the reader cannot see at a supported
  window size. It is not downtime.
- **Disposition:** admitted here; the ticket's lock pins this file.
