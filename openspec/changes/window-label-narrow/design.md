# #455 chart text at the narrowest split — design

## Verified facts (triage, 2026-09-23, on base b03431d2)

Each fact names its evidence. Theory is marked as theory.

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
  caption in about 316 px (x 258 to 574), the head in about 91.
- **Theory: every preset caption on this store is thin.** In the renders the
  store's median line exists only near midnight, so every quarter window
  probably has a bin holding 0 and prints the notice too. At 832 each such
  caption parks beside a quarter-width window with less room than it needs.
  S183 asserts what each preset actually paints and does not depend on this
  theory.
- **The Spotlight's middle-rank verdict line loses its programmed rate at
  832.** The same renders show the Spotlight's first line ending
  "SUPPORTED · 0.70 U/h · (0.70–0.70) · programmed now" at 832×720 and
  832×560. At 1200×560 it ends "… · programmed now 0.60" for the same slot.
  `basalEditorialOption` (`frontend/diagnose-evidence-charts.js`) draws that
  line whenever the seat is under `MIDDLE_RANK_WIDTH` (780), as one
  `graphic` text at `left: 14`, set in `600 11px` monospace, with no width and
  no fit rule. Its tally line does have one: it steps down from 10 px to 9 px
  type to stay inside `seatWidth − 2 × margin`. The middle-rank grid reserves
  `margin + 26` px on the right, the tile's Keep control column.
  Theory: the rate is painted under the Keep control or past the canvas edge;
  S184 on base tells which, and the fix is the same either way.
- **A smaller type cannot rescue that line.** The longest verdict the builder
  serves, as in the node fixture "INSUFFICIENT EVIDENCE · 0.74 U/h ·
  (0.60–0.92) · programmed now 0.60", is 68 characters. Even at 9 px
  monospace, about 5.4 px a character, that is about 367 px. The line's column
  at 832 is about 327 px (theory from the render: a seat of about 381 px, less
  the 14 px left margin and the 40 px right reserve).
- **ECharts' own wrap keeps words whole, with one trap.**
  `docs/scope/455-caption-wrap.spike.mjs` (port-free, exits 0) runs ZRender
  5.5's `parseRichText` with `width` and `overflow: 'break'`. It breaks only at
  spaces; the en dash, the em dash and the middle dot are in-word characters,
  so "00:00–24:00" never splits. The trap: with `overflow: 'break'` on, a
  newline that ends a plain segment is dropped, and the head fuses into the
  tail ("24:00INSUFFICIENT"). A newline that opens the tail's rich token
  (`{th|\n…}`) stacks correctly.
- **Painted chart text is measurable.** `assertResponseAnchorGeometry`
  (`frontend/diagnose-replay.mjs`) reads each painted text span from
  `chart.getZr().storage.getDisplayList()` (`type === 'tspan'`), applies its
  transform to `getBoundingRect()`, and compares the box with the host's
  `clientWidth`. Each span's `parent` is the text element that owns it, whose
  `style.text` is the whole formatted label. `laidOutBrace404`
  (`frontend/c4.replay.mjs`) presses a Window preset and waits until the chart
  and its brace are idle.
- **No story measures either text.** S151 checks `#chart`'s box inside the
  pane, not the text drawn in it. No story reads the Spotlight's verdict line.
- **Two other texts, found in the same renders, are outside this change.**
  - The canvas header's title, "Glucose by time of day", paints nothing at
    832 px, not even an ellipsis, while its provenance and the All charts
    control fill the row. The 2026-08-19 owner ruling on that header says it
    truncates and never wraps, and its provenance is never hidden. Changing
    that is a ruling, so it went to the release coordinator.
  - At every size, the y-axis minimum label sits half-hidden under the "70"
    target numeral's pad, and the Spotlight's programmed-rate tick label is
    crossed by its rule. They are not 832-specific, and R455 rules out change
    at 1280×720 and 1440×900. Both went to the coordinator as findings.

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
  - `width` set to that region and `overflow: 'break'`;
  - on a thin window, a stacked formatter: the head, then the tail on its own
    line, where the one-line separator " · " gives way to the line break. The
    newline opens the tail's rich token, per the spike;
  - on a window that is not thin, the head alone, which also breaks only
    between words;
  - the knock-out pad the target caption and the 70/180 numerals already use:
    `backgroundColor: colors.rail`, padded;
  - an explicit 13 px line height, because ZRender's default line pitch
    equals the type size;
  - the same anchor as today for its region: the window area's `insideTop`
    label inside the window, or the parked `markPoint` outside it.
- **The target caption moves when the window caption wraps.** It takes its
  existing floor placement (`insideBottomLeft`, distance 0), the #370 escape it
  already uses when a gate strikes it. A wrapped caption fills the row under
  the plot's ceiling where the target caption otherwise sits.

Nothing reads a floor, a count or a verdict it did not already read: thinness
is the chart's existing `windowSupport` result, unchanged.

**Why this and not the issue's other options.**

- Shortening it in the wearer's words: R455 says nothing is shortened.
- Moving it:
  - The header row above the chart is already full at 832; its title is the
    finding above.
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

**Why this and not a smaller type.**

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

## Revise preparation

- **Lifecycle.** `revise`. UI Craft routed it on 2026-09-23 with the inputs
  `shipped`, `runnable`, declaration `complete` and data source
  `manufactured`, and returned
  `{"mode":"revise","reason":"safe manufactured data source declared"}`.
  The work is convergent: R455 settles the direction, so no wireframe phase
  opens.
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
- **Inventory diff.** No story asserts either of these today:
  - that the glucose overview's caption lies inside the chart with every word
    whole;
  - that the Spotlight's verdict line keeps every fact inside the chart, clear
    of the Keep control.

  Each becomes a new story: S183 and S184. No existing story is amended or
  retired.
- **Sanctioned changes to shipped desk behavior.** Q3 delegation, Connor
  Griffin, 2026-09-23 ("figure it out yourself from here"); coordinator ruling
  R455. It covers these changes:
  - a window caption that fits on one line nowhere stacks and wraps inside the
    chart, on the knock-out pad;
  - in that case the target caption takes its floor placement;
  - the Spotlight's middle-rank verdict line breaks between facts where it
    does not fit, and its tally line and figure move down with it.

  No shipped behavior is retired, and none moves at 1280×720 or 1440×900.
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
    Afternoon, Evening, 24 h). Before, the caption is cut and the Spotlight's
    rate is missing. After, both are whole inside the chart, and the target
    caption sits on the band's floor wherever the caption wraps.
  - 1200×736 on 24 h and on Afternoon. Before and after, 24 h is unchanged and
    the Spotlight line stands on one line. On Afternoon the caption stacks
    after, where before it ran into the y-axis labels.
  - 1280×720 and 1440×900 on every preset: unchanged.

## Risk contract

- **Must prevent:**
  - real glucose, insulin or schedule values in any committed fixture,
    capture, log or screenshot;
  - a caption or verdict line that splits, cuts or drops a word, or that
    prints a thin window's name without its insufficient-sample notice. That
    would be silent incorrect success: the notice is how the chart says it
    prints no precise median;
  - any caption or verdict-line text past the chart's bounds, or under the
    Keep control, in a state S183 or S184 covers;
  - a wrapped caption overprinting the target caption or any other chart text;
  - any change to a caption, the target caption or the Spotlight's lines at
    1280×720 or 1440×900 in the states S183 and S184 cover;
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
- **Unsupported:**
  - the canvas header's title and hover readout at the narrowest split;
  - the every-size label collisions found above;
  - the tally line's own fit rule;
  - the drag readout;
  - layouts below 832 px wide, which take the same rule but which no story
    measures.
- **Evidence owed:**
  - On base b03431d2, with this branch's replay harness laid over it, S183
    fails at 832×720 and 832×560 naming the 24 h caption past the chart's
    right edge, and passes its checks at the run's own size. S184 fails at
    832 naming the programmed rate outside its column. On the branch both pass
    at 1280×720 and at 1440×900.
  - Node tests through `renderCanvas`'s emitted option cover:
    - the stacked formatter, with the newline opening the rich token;
    - the region width, the break overflow and the pad;
    - the target caption's floor placement;
    - one-line placements unchanged, both where they fit inside and where they
      park.
  - Node tests through the basal editorial option cover the break between
    facts, the tally and grid shift, and one line at a wide seat.
  - Fake-page node tests cover both replay helpers.
  - The complete desk ledger passes at both sizes on the integrated commit.
- **Why:** the harm is a safety notice, or the programmed rate a basal
  suggestion is read against, that the reader cannot see at a supported
  window size. It is not downtime.
- **Disposition:** admitted here; the ticket's lock pins this file.
