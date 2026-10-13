# Design

## ADR 481 — Rebuild the frontend as a React + TypeScript component library with Storybook

**Decision.** The frontend is rebuilt as a React + TypeScript component library
with Storybook, on the existing Vite setup. Screens are composed only from
components approved one at a time in isolation, in their Storybook stories,
with a screenshot captured for every story. No screen markup is written before
its components are approved. The engine, HTTP API and backend stay untouched.

**Why.** The previous desk was plain-DOM screens, hand-built per surface, and
each new surface drifted from the last. Three interface generations show the
pattern, and the operator stopped using the app. A component library with
per-state stories gives each building block one reviewed implementation.
Composing screens from it, instead of authoring each screen's markup, removes
the main way the design drifted. Storybook also gives the design canvas real
components to mirror. The previous mockups were throwaway markup with no route
into code.

**Consequences.**
- The repository's current rule that the frontend fast gate is a
  dependency-free Node test line (`node --test 'frontend/**/*.test.js'`, in
  AGENTS.md / CLAUDE.md) will be replaced by the component library's own test
  line in the build ticket. Until that ticket lands, the existing rule stands.
- The desk's browser suites, behaviour-ledger replay and the mockup generators
  tied to it are retired as the new screens replace the old ones. The build
  tickets carry that retirement.
- Order of work, each step approved before the next:
  1. information architecture and three directions
  2. the component inventory
  3. the library, built one component at a time
  4. mirroring it into the design canvas, then composing and locking each screen
  5. building the screens against real data

## ADR 485 — A Pattern reads Uncertain only when its Queue admission does not hold at the low end

**Decision.** An outcome Pattern's `wide` flag, shown in the redesign as
**Uncertain**, answers one question: is this Pattern real enough to act on? It is
true when:

1. the Pattern has no usable range (no opportunities, or inconsistent counts); or
2. the Pattern is in the Queue (admitted through a habit or a setting) and the
   member that admits it does not hold at the low end of its evidence.

Otherwise it is false. The width of the Pattern's range alone no longer makes it
Uncertain. The Range is still served beside it, so a broad one stays visible.

What "holds at the low end" means for each kind of admitting member:

- **Habit.** The scenario engine already splits its levers on the Wilson lower
  bound: a lever surfaces when its lower-bound score clears the floor, or when it
  recurs often and badly enough to earn the strong override, and otherwise lands
  in the low-confidence tier (too few cases, or under the floor without the
  override). The engine now publishes that reason on every scenario Pattern as
  `admission_basis` (`lower_bound`, `strong_override` or `low_confidence`), and the
  roster carries it onto each habit member. A habit-admitted Pattern holds only on
  `lower_bound`. The roster reads the engine's verdict and does not re-derive a
  floor.
- **Setting.** A setting admits a Pattern only through its owner's `asserts_move`.
  That predicate already asserts a direction only when the evidence supports it
  at its low end: basal's eight-night sign-test floor, carb ratio's eight closed
  meal runs, and ISF's Wilson lower bound over night votes held across two
  decision points. A setting-admitted Pattern therefore holds by construction and
  is never Uncertain.

A Pattern outside the Queue (`admission_route` `none`) has nothing admitted to be
uncertain about, so it reads Uncertain only when it has no range. No renderer
reads the old precision flag on a non-admitted Pattern: the Uncertain pill is the
flag's only consumer.

**Why.** The previous rule (#481, #484) was the shared relative-half-width rule
for findings: wide when the Wilson half-width exceeds a quarter of the rate. At
realistic sample sizes it fires on nearly every Pattern. Across the synthetic QA
catalog, 63 of 187 Patterns with a range were flagged, including 17 of the 52
admitted to the Queue. A pill on every row says nothing. Under this rule, 7 of
those 187 read Uncertain. All 7 are admitted habits whose admission rests on the
strong override or the low-confidence tier.

**Consequences.**
- Findings keep `wilson_wide` unchanged. A finding's `wide` still describes the
  precision of its own rate. Nothing in this change showed that it should move.
- A clock-scoped Pattern keeps its whole-day admission, so its Uncertain state
  follows that admission even when the window's own range is thin.
- The roster admits low-confidence habits to the Queue. This decision does not
  change that. It makes them read Uncertain.

## ADR 488 — The case files serve the eating-sequence report from the exposures' own evaluation, and withhold one inconsistent case rather than fail the store

**Context.** Preparing the Finding case files failed with a server error for a whole
store whenever the high-carb sequence case could not reconcile its two inputs. The
case serves the aggregate eating-sequence report beside the sequence evidence the
Queue counted, and the two were built separately. The sequence evidence comes from
the scenario evaluation behind the exposures payload. That evaluation reads only the
Carb log entries already recorded at the window end (the #467 eligibility rule), and
CGM with false-low spans dropped. The report was rebuilt from the store with every
Carb log entry and the raw CGM. A person who logs carbs by hand after the last
synced reading therefore saw two counts. In the redesign library's synthetic wearer,
eight entries logged an hour after the last reading excluded two highest-carb
sequences from the report only: 15 against the evidence's 17. The case-file guard
refused the pair, as it should, and the preparation turned that one refusal into a
failure for every case in the store.

**Decision.**

1. *One evaluation.* The exposures payload carries the whole eating-sequence report
   of the evaluation its sequence evidence came from (`sequence_report`). Preparation
   serves that report, and the separate store-built report
   (`build_eating_sequence_report` and its cache entry) is deleted. The eating-
   sequences specification already required the report and the sequence evidence to
   come from one evaluation; the served path now does. The eligibility rule decides
   which Carb log entries count, so the evaluation that applies it is the right one.
   A carb entry logged after the window end no longer contaminates any sequence until
   a fetch moves the window end past it. The report's window end is unchanged: the
   latest basal or CGM reading.
2. *Keep the guard.* The case still refuses a report and evidence that disagree.
   It caught a real disagreement, and is now the backstop for one that this change
   did not foresee.
3. *Isolate the refusal.* When one case's projection is inconsistent, preparation
   withholds that Finding by name, under the code `inconsistent_projection`, and
   serves every other case. The withheld row leaves the rendered rows, exactly as an
   uninspectable attribution does, and requesting its case still answers the same
   error. A Pattern row is withheld whole, not rendered without its case header,
   because a chart-bearing Pattern without a header fails the desk's check of the
   entire preparation.

**Why isolate rather than fail.** The guard's job is to keep inconsistent dosing-
adjacent evidence from being served, and withholding the one case does that
completely: neither count reaches the reader, and nothing falls back to a number the
guard rejected. Failing the whole store protected nothing further. It hid every
other case's evidence, including the matched and comparison cohorts each open
Pattern needs, behind one unrelated disagreement. The withheld state is explicit in
the served preparation, so the case does not silently disappear.

**Consequences.**
- The exposures payload is larger by one report. The findings-projection fixture,
  which freezes exposures payloads, gains that key and nothing else.
- A store with no readings still serves an empty report, from an evaluation of no
  events over the same window.
- A preparation can now succeed while naming a withheld Finding with
  `inconsistent_projection`. A reader that sees one is looking at a producer
  disagreement to investigate, not at missing data.
