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
  4. composing and locking each screen (see the amendment below)
  5. building the screens against real data

**Amendment, 2026-10-13 (operator).** Step 4 no longer mirrors the library into
the design canvas. Screens are composed and locked in Storybook, as screen
stories built from the approved components, at 390 px and 1440 px; each lock is
recorded in the lock doc (amended below: by commit, not screenshots). The canvas stays available for
throwaway sketches of ideas that go beyond the library; a sketch that wins
becomes a component in Storybook, never a mirrored copy, so `/design-sync` is
dropped. Why: Storybook already renders the code the app will ship and runs the
checks, while a mirror is a second copy that has to be re-synced on every
library change. The operator, on a hybrid approach: "ok".

**Amendment, 2026-10-13 (operator).** A screen's lock is its screen stories,
not screenshots of them: the lock doc records the locked screen, the date, and
the commit whose stories are binding. The operator: "I don't know that we need
screenshots if we have Storybook. That seems outdated to me." Why: the stories
render the shipped components and run the checks on every change, while a
committed screenshot is a copy that drifts from them.

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

## ADR 489 — A setting is recommended only when its own range rules out its current value

**Decision.** A setting whose served range includes the value programmed now is a
hold, not a recommendation (Connor, 2026-10-13: "It probably just shouldn't be in
the queue at all"). The range is the setting's served `estimate.lo`–`estimate.hi`,
the same pair the redesign shows as its Range, and it is closed: a programmed value
equal to either bound is inside it. The rule is one condition inside each setting
kind's single staging predicate, `Estimate.excludes(current)`, so every reader of
that predicate follows without a check of its own:

- **Basal.** `safety.cap` adds it beside the eight-night sign test: a supported
  direction whose range contains the programmed rate is `INSUFFICIENT`, so
  `SlotEstimate.asserts_move` is false. `safety.apply_harm` adds it to the
  recurring-lows nudge: a median-deferred cut whose range contains the setting
  holds as `HARM_GATED`. A slot with no clean median has no range, so its one full
  step on recurring lows stands; holding it would mean a missing range blocks a cut
  the lows alone argue for.
- **Carb ratio.** Unchanged in behaviour. `ic_asserts_move` already required
  `band_excludes_programmed` on the served block estimate with closed bounds; it
  now reads the same `Estimate.excludes`.
- **Correction factor.** `isf_asserts_move` adds it. A sized strengthen it refuses
  for its range is published as a hold, with no direction and no recommended
  value, like every other correction-factor read whose range contains the setting.
  Leaving the direction on it would publish a findings row titled
  "Correction factor · strengthen" for a setting that stays as it is.

A held setting keeps its estimate and range and says why: basal "most nights point
one way, but the measured range still includes the set rate, so it stays as it is",
or "lows keep happening overnight, but…" for a recurring-lows slot; the correction
factor "overnight you look more sensitive to insulin than the set value, but the
measured range still includes it, so it stays as it is".

**Readers checked.** Each reads the predicate or the action the analyzer stamps from
it, and none re-derives the range: the deliverable pump profile
(`basal._deliverable_rate`, `basal._param_schedule` for carb ratio); the Priority
tally (`tuning_priority._is_supported_change`, the I:C lever's `asserts_move`; the
ISF lever prices `recommended`, now empty on a range hold); the findings projection
(basal by status, carb ratio by `asserts_move` and `held_reason`, ISF by direction
and `asserts_move`); guidance setting actions and admission (`guidance._setting`,
the member's `guidance.action`); outcome-Pattern admission (`outcome_patterns`, by
`asserts_move`); and the desk's Plan staging, lane and findings queue, which read
`asserts_move`.

**Supersedes.** ADR 466 decision 8 said a recurring-lows lower moves whatever its
interval. The operator's example in #489, the redesign wearer's Basal 05:00
(1.40 → 1.31 U/h, range 1.11–1.42), is exactly that case, so it no longer holds.
ADR 466 decision 3's sentence for such a lower ("The steady nights alone do not
establish this step down…") can no longer be served and is removed; S191 is
amended in the behaviour ledger. ADR 466's own synthetic spread (range 0.45–0.66
around 0.60) now holds.

**Consequences.**
- Two QA cases pin the new states, `basal-range-hold` and `isf-range-hold`, and
  `basal-recurring-low-spread` now holds 03:00 and no longer admits the
  overnight-lows Pattern through the basal setting. The basal-night-evidence
  fixture's spread slot is regenerated as a hold.
- The I:C spec already states the band rule; the basal, harm and correction-factor
  requirements carry the new condition as deltas in this change.

## ADR 492 — The Day timeline serves the day's insulin split, with each user bolus split in its recorded food-to-correction proportion

**Decision.** The day timeline serves `insulin_totals` for its window in units:
`basal`, `meal`, `correction`, `control_iq_bolus` and `total`, plus
`basal_programmed` beside them. The redesigned Day screen's insulin bar draws the
four parts and the total from it, and no surface re-derives them. Nothing is
predicted, and a window with no basal row and no delivered bolus serves `null`.

- **Basal** is delivered: each basal row's delivered rate over the part of its own
  duration inside the window. A row that starts before the window and runs into it
  counts only its inside part, and so does one running past the end.
  Control-IQ's basal increases, decreases and suspensions all stay inside it.
- **`control_iq_bolus`** is the delivered insulin of the boluses the pump tagged
  automatic (bolus options 3 and 6), read through the bolus row's one provenance
  property. It holds only Control-IQ's automatic boluses, not the algorithm's basal
  adjustments. A bolus without that tag, including one with no provenance at all,
  is a user bolus.
- **Meal and correction** come from each user bolus's *delivered* insulin, split in
  the proportion of the food and correction sizes the pump recorded. Those sizes
  are what was *requested*, so a bolus cut short or overridden keeps its recorded
  mix rather than leaving a remainder unfiled. With no recorded split (both sizes
  absent or zero), a bolus with carbs is all meal, matching the engine's existing
  "no split means meal-only" reading, and a bolus without carbs is all correction.
  The correction part is the delivered dose minus the meal part, so each bolus's
  two parts always add up to what it delivered.
- **`total`** is `basal + meal + correction + control_iq_bolus`, added in that
  order and served unrounded, so the parts add up to it exactly as served.
- **`basal_programmed`** is the programmed rate over the same rows, clipped the
  same way, and is **not** part of `total`. It lets the Day screen show how far
  Control-IQ's delivery ran below or above the schedule. During a suspension the
  pump reports no programmed rate, so a row without one carries the last rate the
  pump reported, including from before the window. When no rate has ever been
  reported for an overlapping row, `basal_programmed` is `null` and the other
  totals still serve.

**Why proportional.** The pump records food and correction sizes for the dose it
was asked for, but the bar shows delivered insulin. Splitting the delivered dose
in the recorded proportion is the one rule that files every delivered unit, keeps
the parts summing to the total, and needs no guess about which part an aborted
bolus lost.

**Consequences.** The findings-projection fixture and the private v2 design
exploration embed day timelines, so both are regenerated with the new field; no
existing value changes. The http-api spec carries the served shape as a delta in
this change.
