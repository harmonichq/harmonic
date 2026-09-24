# #455 implementation checklist

Base: origin/main b03431d2b937b46bdabbb2de1e6ba0ba6c6b57b1. The executor never
binds a port: the coordinator runs every browser leg. This ticket's replay story
IDs are S183, S184 and S185. `design.md` holds the verified facts, the five
decisions, the revise preparation and the risk contract.

## 1. The three stories, before any implementation

Each story is built the way S151 is:

- a `C4_STORIES.<id>` body in `frontend/c4.replay.mjs`;
- an `appOnly('HV2-11', …)` export in `frontend/desk-behavior.replay.mjs`,
  carrying its `// STORY:harmonic-v2-desktop:<id>` marker, and a `REGISTRY`
  entry. HV2-11 is the lock term under which Diagnose owns clock-window
  exploration and the Spotlight, with a geometrically stable evidence stage;
- case `basal-verdict-gallery` in `STORY_CASES` (`frontend/replay-cases.mjs`).

Each story sets sizes with `page.setViewportSize` and restores the run's size
even when checks failed. It checks every size and every state before it
judges, then fails once, listing every failure by size, state and check with
the measured amount in px. It never sets a scroll offset. Each factors its
pure judgment into an exported helper, as S151's `laneReachFailures` is, with
fake-geometry node tests in `frontend/c4.replay.test.js`.

"Painted text" below means each non-empty text span a chart paints. It is read
in the page from `chart.getZr().storage.getDisplayList()`
(`type === 'tspan'`), with the box from `getBoundingRect()` and the span's
transform applied, as `assertResponseAnchorGeometry` in
`frontend/diagnose-replay.mjs` does. Spans are grouped by their `parent` text
element. "Settled" means `laidOutBrace404` has returned after a preset press.
After a resize with no press, it means the chart host's `clientWidth` equals
its new box, the chart is idle, and two animation frames have passed.

- [ ] 1.1 Add S183, the glucose overview's text. The caption for a preset is
  the one group whose first span begins with that preset's head, written in
  the story as a literal: `OVERNIGHT 00:00–06:00`, `MORNING 06:00–12:00`,
  `AFTERNOON 12:00–18:00`, `EVENING 18:00–24:00` or `24 H 00:00–24:00`.

  In order:
  1. At the run's own size, press each preset in turn (Overnight, Morning,
     Afternoon, Evening, 24 h), settle, and check the caption. Then press
     Evening.
  2. Set 832×720 and press nothing. Settle, then check the Evening caption:
     the live narrowing.
  3. At 832×720, press each preset in turn, from Overnight, settle, and check.
  4. Set 832×560, press each preset in turn, from Overnight, settle, and check.
  5. Restore the run's size and press 24 h.

  The first press at each size differs from the last press before it, so every
  check reads a fresh render.

  Each check records a failure whenever:
  - exactly one caption group is not found;
  - a caption span lies outside `#chart`'s box, `[0, clientWidth] ×
    [0, clientHeight]`;
  - the caption's words are not the head's words, followed, when any span
    carries `INSUFFICIENT`, by exactly the words of
    `INSUFFICIENT SAMPLE — thinnest bin holds <n>` with `<n>` a whole count.
    The caption's words are its spans' text in paint order, split on
    whitespace, with the separator `·` ignored. A split or cut word fails
    this check;
  - any two painted text spans in `#chart` overlap, at any size;
  - at the run's own size, the caption stands on more than one line, that
    is, its spans do not share one top within 1 px.

  Premise: at 832×720 the 24 h caption carries the insufficient-sample notice,
  so the store exercises the thin path. Otherwise S183 fails its premise.

  Node tests for the helper:
  - a caption wholly inside;
  - a caption past the right edge;
  - a caption past the left edge;
  - a word split across two spans;
  - a notice missing its count;
  - two overlapping spans;
  - a two-line caption at the run's size;
  - one message naming failures at two sizes.
- [ ] 1.2 Add S184, the Spotlight's verdict line. S184 opens Diagnose at rest,
  where the Spotlight shows the next-in-line basal slot. It reads the
  Spotlight chart's painted text from its host in `#tile-focal`, and the Keep
  control's box (`#tile-focal .tile-pin`) in the host's own coordinates.

  It sets 1200×736, then 832×720, then 832×560, pressing nothing, and settles
  after each resize. At each size it takes the verdict line as the group whose
  first span begins with the literal `SUPPORTED`. The expected facts, as
  literals copied from the 1200×560 render of this store's 00:00 slot, are
  `SUPPORTED`, `0.70 U/h`, `(0.70–0.70)` and `programmed now 0.60`.

  It records a failure whenever:
  - the verdict group is not found;
  - a verdict span lies outside the host's box or overlaps the Keep control's
    box;
  - the verdict's words differ from the facts' words, with `·` ignored;
  - a line break falls inside a fact;
  - the tally line (the group beginning `30 steady nights`) does not stand
    wholly below the verdict's last line;
  - at 1200×736, the verdict stands on more than one line.

  Node tests for the helper:
  - a passing line;
  - the rate past the host's edge;
  - the rate under the Keep control;
  - a break inside a fact;
  - a tally overlapping the verdict;
  - a missing verdict group.
- [ ] 1.3 Add S185, the canvas header. With Diagnose at rest, it sets
  832×720, 832×560, 1024×768 and the run's own size in turn. The header's rule
  is CSS alone, so after each resize it waits two animation frames and reads
  four things: `#canvas-head`, its title (`.head-rest h2`), the provenance
  (`#canvas-pool`) and the All charts control (`#explorer-trigger`), with its
  word (`#explorer-trigger > span`).

  It records a failure, printing every part's box width, `clientWidth` and
  `scrollWidth`, whenever:
  - at any size:
    - the title, the provenance or the control lies outside the header's box;
    - the three do not share one line, meaning their boxes' vertical centres
      differ by more than 2 px;
    - the provenance does not print whole (`scrollWidth > clientWidth`);
    - the control's accessible name or its `title` is not `All charts`;
  - at 832×720 and 832×560, the title's box is narrower than twice its
    computed font size, so it cannot show a letter and an ellipsis;
  - at 1024×768 and the run's size:
    - the control's word does not render;
    - or the title does not print whole.

  Node tests for the helper:
  - an 832 header that passes;
  - a zero-width title;
  - a provenance cut;
  - a wide header whose control hides its word;
  - a header on two lines;
  - one message naming failures at two sizes.
- [ ] 1.4 Pin S183, S184 and S185 in `frontend/c4.replay.test.js` beside
  S151–S153: each is registered once, with term `HV2-11` and case
  `basal-verdict-gallery`. `SMOKE_STORIES` and its pinned hash do not change,
  because S113 already carries this case in the smoke slice.

  On this branch, move only the numeric inventory literals, by +3 issued and
  +3 active, from the base's 171 / 152 / 19 to 174 / 155 / 19, so this
  branch's own tests pass. They are in
  `mockups/sweep/harmonic-v2-desktop/acceptance.py` `inventory()` and in
  `acceptance.test.py`'s counts.
- [ ] 1.5 Hand the coordinator the base leg and wait for its result. The
  coordinator lays this branch's replay harness and case recipes over a base
  b03431d2 worktree and runs `ONLY=S183,S184,S185` at 1280x720 and at
  1440x900. The premises hold when all of these are true:
  - S183 fails at 832×720 and 832×560 on the 24 h caption past `#chart`'s
    right edge;
  - S183 fails on the Evening caption after the live narrowing;
  - at the run's own size, S183 fails only on y-axis labels overlapping
    target numerals;
  - S184 fails at 832×720 and 832×560;
  - S185 fails at 832×720 and 832×560 on the title's width, and records no
    failure at 1024×768 or the run's size.

  Record the header widths S185 prints in design.md's facts. If any premise
  does not hold, stop and report to the coordinator. Implement nothing
  further, because the change's premise is wrong.

## 2. The window caption stacks and wraps (ADR 455, first decision)

- [ ] 2.1 Read UI Craft's `reference/web-implementation.md`. Then implement
  surfaces **The glucose overview's window caption stays whole inside the
  chart** in `renderCanvas` (`frontend/diagnose-workstation-chart.js`), as
  design.md's first ADR states it.

  Keep steps 1 and 2 of the fit-or-move block exactly as they are.

  In step 3:
  - park the caption on one line, on today's side with today's anchor,
    distance, offset and alignment, only when its estimated width fits that
    side's room. On the right, the room runs to the chart's right edge; on the
    left, to the plot's left edge;
  - otherwise, wrap it inside the wider of the window (less `LABEL_PAD`) and
    that room:
    - `width` set to the region, and `overflow: 'break'`;
    - on a thin window, a stacked formatter whose newline opens the tail's
      rich token (`docs/scope/455-caption-wrap.spike.mjs`);
    - on a window that is not thin, the head alone;
    - the knock-out pad (`backgroundColor: colors.rail`, padded as the target
      caption is);
    - an explicit 13 px line height.
  - whenever the caption wraps, give the target caption its existing floor
    placement (`insideBottomLeft`, distance 0).

  Read no new field, floor or count. Rewrite the block's comment so it states
  the new rule, including "never straddling an edge" and "one line, one side",
  which no longer hold as written.
- [ ] 2.2 Add node tests in `frontend/diagnose-workstation-chart.test.js`,
  through `renderCanvas`'s emitted option, beside the existing
  window-label test:
  - a thin 24 h window at `clientWidth` 402 shows its caption inside, on the
    window area's label, with the stacked formatter (the newline opens the
    `th` token), width `316 − LABEL_PAD`, `overflow: 'break'`, the pad and
    the line height; no parked caption is emitted, and the target caption is
    on its floor;
  - a thin Overnight window at 402 parks right with a width that runs to the
    chart's edge;
  - a thin Evening window at 402 parks left with a width that runs to the
    plot's edge;
  - a window that is not thin, too narrow for its head, and with less room on
    both sides than the head needs, wraps the head alone;
  - at `clientWidth` 850 (1280's chart), each of the five presets, thin,
    emits exactly today's option: one line, no `width`, `overflow` or pad
    keys, and the target caption where it stood.

  The existing fit-or-move test's cases stay unchanged and pass.

## 3. The Spotlight's verdict line breaks between facts (ADR 455, second decision)

- [ ] 3.1 Implement surfaces **The Spotlight's middle-rank verdict line keeps
  every fact inside the chart** in `basalEditorialOption`'s middle-rank
  branch (`frontend/diagnose-evidence-charts.js`), as design.md's second ADR
  states it:
  - lay the facts out in the column that ends at the plot's right edge;
  - estimate the monospace advance at no less than 0.62 of the type size;
  - break between facts where the joined line does not fit, with a line break
    replacing that " · ";
  - set a 14 px line height;
  - move the tally line's `top` and the grid's `top` down 14 px per added
    line.

  A line that fits stays byte-identical. The tally's own fit rule, the
  description and the full layout do not change.
- [ ] 3.2 Add node tests in `frontend/diagnose-evidence-charts.test.js`,
  through `entry.option('editorial', { data, surface: { clientWidth } })`:
  - at a 381 px seat, the replay store's slot shape (verdict word, estimate,
    range, programmed rate) gives two lines, each within the column, broken
    between facts, with every fact present and in order, and the tally and
    grid moved down 14 px;
  - at a 750 px seat the same data gives one line, with the tally and grid
    where they stood;
  - the existing middle-rank tests still pass.

## 4. The header at the narrowest split (ADR 455, third decision)

- [ ] 4.1 Implement surfaces **The glucose overview's header keeps its title at
  the narrowest split** in `frontend/diagnose-workstation.css`. Add one
  `@media (min-width: 832px) and (max-width: 1023px)` block that hides
  `#explorer-trigger > span`, and nothing else. Leave `chartActionButton`'s
  `title` and `aria-label` as they are. Leave the header's grid, truncation
  rules, provenance and the ≤831 px and ≤480 px blocks unchanged. Comment the
  block with the 2026-08-19 ruling it keeps and the coordinator ruling it
  implements.

## 5. Chart furniture yields to axis labels (ADR 455, fourth decision)

- [ ] 5.1 Implement surfaces **Chart furniture never strikes an axis label**:
  - In `renderCanvas`, the y-axis label formatter prints nothing for a tick
    value whose label centre would lie within 13 px of a target numeral's
    centre. The distance is measured at the plot's height
    (`el.clientHeight − 20 − 26`) over `range`, and the formatter otherwise
    prints the value as today.
  - In `basalEditorialOption`'s `furniture` series, the programmed rule ends at
    `base + 4`, the x axis's tick length, at both ranks.
- [ ] 5.2 Add node tests, each failing on base first:
  - through `renderCanvas` with `clientHeight` 154 (a 108 px plot) and a range
    of 60 to 200: the formatter prints nothing for 60 and 180, and prints 120
    and 200;
  - with `clientHeight` 346 (a 300 px plot) and a range of 40 to 260: the
    formatter prints 40, 100, 160, 220 and 260, each at least 27 px from a
    numeral;
  - through the basal editorial option's `furniture` `renderItem`, as the
    existing "keeps its labels inside a 480px cell" test calls it, at both
    ranks: the rule's rect ends at or above `base + 4`, above the tick labels'
    `axisLabel.margin`.

## 6. Charts re-lay out on a size change (ADR 455, fifth decision)

- [ ] 6.1 Give `observeResize` (`frontend/diagnose-workstation-chart.js`) an
  optional relayout callback. When the observed box changes size after its
  first report, the callback runs after `chart.resize`, in the same animation
  frame. With no callback it behaves as today.

  In `frontend/diagnose-workstation.js`:
  - the overview's observer passes a callback that runs `paintChart()` and
    `paintBrace()` unless `dragActive`;
  - `mountDescriptorChart` returns a rebuild. It re-runs
    `optionForDescriptor` with the same inputs, and the ≤480 px axis-name
    rule, against the host's current width, then calls
    `chart.setOption(option, true)`;
  - `installTileMount` passes that rebuild to the observer.

  The two hand-built stages and the row minis pass none.
- [ ] 6.2 Add node tests in `frontend/diagnose-workstation-chart.test.js` for
  `observeResize`, with a fake `ResizeObserver` and `requestAnimationFrame`:
  - the first report resizes and does not relayout;
  - a later width change resizes, then relayouts once;
  - an unchanged size does neither;
  - with no callback, a change only resizes.

## 7. Records

- [ ] 7.1 In the desk ledger `mockups/harmonic-v2-desktop.behavior.md`, add
  one `## #455 amendment — 2026-09-23` section, following the #433 section's
  pattern. It holds:
  - the sanction line: `Q3 delegation, Connor Griffin, 2026-09-23 ("figure
    it out yourself from here"); coordinator ruling R455`, with R455's
    amendment for the two collision fixes;
  - the six sanctioned changes from design.md;
  - the S183, S184 and S185 entries (element, source, lock, data, evidence,
    status);
  - their handler-inventory rows.

  Never rewrite, re-date or replace an existing `★ FROZEN` block. Leave the
  header's inventory line, ACCEPTANCE.md, `mockups/INDEX.md` and the release
  freeze block alone; they are coordinator-owned.
- [ ] 7.2 Update DESIGN.md's component list, beside the "Basal lane" entry,
  in plain terms and with no file or function names:
  - the glucose overview's window caption: one line where it fits, stacked
    and wrapped inside the chart on the knock-out pad where it does not, with
    the target caption on the band's floor then;
  - the y-axis labels yield to the target numerals;
  - the Spotlight's middle-rank verdict line breaks between facts, and its
    programmed rule ends at the axis tick;
  - between 832 and 1023 px wide the All charts control shows its icon only;
  - the charts re-lay out when the window is resized.

  Public files never name the release evidence folder. Say "a private
  design-evidence record — not part of the public tree".

## 8. Verification

- [ ] 8.1 Run these locally, all green; none of them binds a port:
  - `npm ci && npm run build`;
  - `node --test 'frontend/**/*.test.js'`;
  - `npx --yes @fission-ai/openspec@1 validate --all --strict`;
  - the three guards from `AGENTS.md`;
  - `node docs/scope/455-caption-wrap.spike.mjs`;
  - `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py
    ReplayPlanTest InventoryProofTest SmokeSelectionTest`;
  - `python3 mockups/sweep/harmonic-v2-desktop/acceptance.py inventory
    --out <scratch>`, stating its counts;
  - `uv run python mockups/harmonic-v2.exploration/generate.py --check`. It
    reads only `ciq_autotune`, which this change does not touch, so it must
    report no drift. If it drifts, stop and report to the coordinator rather
    than regenerate.
- [ ] 8.2 Hand the coordinator the port-bound legs. It runs them and keeps
  the logs and captures in the release's private evidence folder:
  - the branch leg `ONLY=S183,S184,S185` at 1280x720 and 1440x900, all
    passing;
  - the render matrix in design.md;
  - the complete desk ledger at both sizes, once, on the integrated commit;
  - the backend pytest and the rest of `acceptance.test.py`.
