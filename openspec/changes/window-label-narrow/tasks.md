# #455 implementation checklist

Base: origin/main b03431d2b937b46bdabbb2de1e6ba0ba6c6b57b1. The executor never
binds a port: the coordinator runs every browser leg. This ticket's replay story
IDs are S183 and S184. `design.md` holds the verified facts, both decisions, the
revise preparation and the risk contract.

## 1. The two stories, before any implementation

- [ ] 1.1 Add S183 to the desk ledger's replay, built the way S151 is:
  - a `C4_STORIES.S183` body in `frontend/c4.replay.mjs`;
  - an `appOnly('HV2-11', …)` export in `frontend/desk-behavior.replay.mjs`
    carrying its `// STORY:harmonic-v2-desktop:S183` marker, and a `REGISTRY`
    entry. HV2-11 is the lock term under which Diagnose owns clock-window
    exploration and the Spotlight, with a geometrically stable evidence stage;
  - case `basal-verdict-gallery` in `STORY_CASES` (`frontend/replay-cases.mjs`).

  S183 opens Diagnose at rest. It covers two viewports set with
  `page.setViewportSize`, 832×720 and 832×560, plus the run's own size. At each
  size it presses each Window preset in turn (Overnight, Morning, Afternoon,
  Evening, 24 h), by its label on `#seg-window`, and settles each preset with
  `laidOutBrace404`.

  For each preset it reads the painted text of `#chart` in the page. Each
  span comes from `chart.getZr().storage.getDisplayList()` (`type === 'tspan'`,
  box from `getBoundingRect()` with the span's transform applied, as
  `assertResponseAnchorGeometry` in `frontend/diagnose-replay.mjs` does),
  grouped by the span's `parent` text element. The caption is the one group
  whose first span begins with the preset's head, written in the story as a
  literal: `OVERNIGHT 00:00–06:00`, `MORNING 06:00–12:00`,
  `AFTERNOON 12:00–18:00`, `EVENING 18:00–24:00` or `24 H 00:00–24:00`.

  It records a failure, naming size, preset and check with the measured
  overrun in px, whenever:
  - exactly one caption group is not found;
  - a caption span lies outside `#chart`'s box, `[0, clientWidth] ×
    [0, clientHeight]`;
  - the caption's words are not the head's words, followed, when any span
    carries `INSUFFICIENT`, by exactly the words of
    `INSUFFICIENT SAMPLE — thinnest bin holds <n>` with `<n>` a whole count.
    The caption's words are its spans' text in paint order, split on
    whitespace, with the separator `·` ignored. A split or cut word fails
    this check;
  - at the two 832 sizes, a caption span overlaps any other text span the
    chart paints;
  - at the run's own size, the caption stands on more than one line, that
    is, its spans do not share one top within 1 px.

  Premise: at 832×720 the 24 h caption carries the insufficient-sample notice.
  The store must exercise the thin path; otherwise S183 fails its premise.
  S183 checks every size and every preset before it judges, then fails once,
  listing every failure. It restores the run's size even when checks failed,
  and ends with 24 h pressed. It never sets a scroll offset.

  Factor the pure judgment into an exported helper, as S151's
  `laneReachFailures` is. Give it fake-geometry node tests in
  `frontend/c4.replay.test.js`:
  - a caption wholly inside;
  - a caption past the right edge;
  - a word split across two spans;
  - a notice missing its count;
  - a wrapped caption overlapping another span;
  - a two-line caption at the run's size;
  - one message naming failures at two sizes.
- [ ] 1.2 Add S184, built the same way, with case `basal-verdict-gallery`.
  S184 opens Diagnose at rest, where the Spotlight shows the next-in-line
  basal slot. At 832×720 and 832×560 it reads the Spotlight chart's painted
  text the same way, from the chart host in `#tile-focal`, and the Keep
  control's box (`#tile-focal .tile-pin`) in the host's own coordinates.

  The verdict line is the group whose first span begins with the literal
  `SUPPORTED`. Its expected facts, as literals copied from the 1200×560 render
  of this store's 00:00 slot, are `SUPPORTED`, `0.70 U/h`, `(0.70–0.70)` and
  `programmed now 0.60`.

  It records a failure whenever:
  - a verdict span lies outside the host's box or overlaps the Keep control's
    box;
  - the verdict's words differ from the facts' words, with `·` ignored;
  - a line break falls inside a fact;
  - the tally line (the group beginning `30 steady nights`) does not stand
    wholly below the verdict's last line.

  At 1200×736 it requires the verdict line on one line. It checks every size
  before it judges, fails once listing every failure, and restores the run's
  size. Factor the judgment into an exported helper and give it fake-geometry
  node tests in `frontend/c4.replay.test.js`:
  - a passing line;
  - the rate past the host's edge;
  - the rate under the Keep control;
  - a break inside a fact;
  - a tally overlapping the verdict.
- [ ] 1.3 Pin S183 and S184 in `frontend/c4.replay.test.js` beside
  S151–S153: each is registered once, with term `HV2-11` and case
  `basal-verdict-gallery`. `SMOKE_STORIES` and its pinned hash do not change,
  because S113 already carries this case in the smoke slice.

  On this branch, move only the numeric inventory literals, each by +2 issued
  and +2 active from the base's 171 / 152 / 19, so this branch's own tests
  pass. They are in `mockups/sweep/harmonic-v2-desktop/acceptance.py`
  `inventory()` and in `acceptance.test.py`'s counts.
- [ ] 1.4 Hand the coordinator the base leg and wait for its result. The
  coordinator lays this branch's replay harness and case recipes over a base
  b03431d2 worktree and runs `ONLY=S183,S184` at 1280x720 and at 1440x900.
  The premises hold when all of these are true:
  - S183 fails at 832×720 and at 832×560, naming the 24 h caption past
    `#chart`'s right edge;
  - S183 records no failure at the run's own size;
  - S184 fails at 832, naming the programmed rate outside the host's box or
    under the Keep control.

  If any does not hold, stop and report to the coordinator. Implement nothing
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

## 4. Records

- [ ] 4.1 In the desk ledger `mockups/harmonic-v2-desktop.behavior.md`, add
  one `## #455 amendment — 2026-09-23` section, following the #433 section's
  pattern. It holds:
  - the sanction line: `Q3 delegation, Connor Griffin, 2026-09-23 ("figure
    it out yourself from here"); coordinator ruling R455`;
  - the three sanctioned changes from design.md;
  - the S183 and S184 entries (element, source, lock, data, evidence, status);
  - their handler-inventory rows.

  Never rewrite, re-date or replace an existing `★ FROZEN` block. Leave the
  header's inventory line, ACCEPTANCE.md, `mockups/INDEX.md` and the release
  freeze block alone; they are coordinator-owned.
- [ ] 4.2 Update DESIGN.md's component list, beside the "Basal lane" entry,
  with two entries in plain terms and no file or function names:
  - the glucose overview's window caption: one line where it fits, stacked
    and wrapped inside the chart on the knock-out pad where it does not, with
    the target caption on the band's floor then;
  - the Spotlight's middle-rank verdict line breaking between facts.

  Public files never name the release evidence folder. Say "a private
  design-evidence record — not part of the public tree".

## 5. Verification

- [ ] 5.1 Run these locally, all green; none of them binds a port:
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
- [ ] 5.2 Hand the coordinator the port-bound legs. It runs them and keeps
  the logs and captures in the release's private evidence folder:
  - the branch leg `ONLY=S183,S184` at 1280x720 and 1440x900, both passing;
  - the render matrix in design.md;
  - the complete desk ledger at both sizes, once, on the integrated commit;
  - the backend pytest and the rest of `acceptance.test.py`.
