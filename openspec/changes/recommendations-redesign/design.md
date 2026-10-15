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

## ADR 499 — The engine keeps only Patterns a person can pin, and the correction factor stays out of the Queue

**Context.** The redesigned Queue offers Patterns to pin as a Focus and Settings to
apply. Several engine outputs either duplicated another item, could not be acted on,
or were computed and read by no one:

- *Overnight lows with no insulin on board* had no habit behind it. Its count was the
  basal analysis's own count of overnight low nights, and its only remedy was the
  basal rate, so it was the overnight basal Setting counted twice. It also could not
  be pinned, so the Queue would have offered a Pin the engine refuses.
- *Meal bolus fell short* claimed only that a meal dose did not cover what followed.
  That is the same concept as carb undercount, and it was never admitted for action.
- *High-carb sequence* and *Repeat eating* were aggregate associations over eating
  sequences, with nothing to pin. They competed with the meal habits for the same
  highs.
- The *Highs without a detected cause* investigation and the findings payload's
  `uncaused_highs` block had no frontend reader.
- Each roster row's `overlap_counts` and `harm_low_overlap` had no reader.
- The correction-factor estimate is the weakest of the three settings, and it reached
  the Queue both as its own Setting and as a member of *Lows after correcting highs*.

**The operator's decisions** (Connor, 2026-10):

1. Cut the overnight Pattern: "that'd for SURE get captured by a basal
   recommendation, otherwise it should be cut from the engine as silly and redundant",
   then "cut it".
2. Cut Meal bolus fell short as a lever, Finding and guidance candidate: "I don't
   understand the point of 'meal bolus fell short'… It's the exact same concept as
   carb undercount… its criteria should be folded into a different highs capture."
3. Cut the uncaused-highs investigation and its findings block.
4. Cut the unread overlap blocks.
5. Cut High-carb sequence and Repeat eating from the engine: "Drop these from the
   engine." The question they answered moves to a future Overview report card,
   *carbs vs post-meal response* (#501).
6. Keep ISF out of the Queue: "ISF tends to suck… keep it out of the queue." The ISF
   analyzer, its estimate and `isf_asserts_move` stay, and a later Overview card will
   show the estimate.
7. Keep Missed / unannounced meal as a standalone habit: "Stand-alone habits are FINE."
8. Keep Highs after treating lows.

**Decision.**

1. *Four Patterns, each pinnable.* The roster is Highs after meals, Lows after meals,
   Highs after treating lows and Lows after correcting highs. Every one carries at
   least one pinnable habit. The harm-band "nights" family goes with the overnight
   Pattern, and so does everything that existed only to count it. That covers
   `starts_in_harm_band`, the Pattern's queue anchoring and chips, and the harm
   layer's `harm_band_source_nights` (its observed overnight source-night count),
   which was the Pattern's denominator. The harm gate, the nudge and `band_nights`
   are untouched. Overnight lows reach the person through the basal Setting exactly
   as before.
2. *Meal bolus fell short is removed whole.* That means its classifier, config, Lever,
   evidence policy and copy. "Fold" means its rises stay in the highs Exposure, and
   `carb_undercount` and `late_bolus` attribute them wherever their own classifiers
   apply. No new classifier is added. Highs after meals' rate levers become
   `carb_undercount, late_bolus`.
3. *The eating-sequence detector leaves the engine.* The detector and its config are
   deleted, along with the scenario engine's sequence candidates and the
   observed-impact competition they needed. Also removed: the exposures payload's
   `sequence_report` and `sequence_evidence` (which supersedes ADR 488's single-
   evaluation report), the habit `member_associations`, the eating-sequence case-file
   kind and its frontend renderer, and their generator and fixtures. Episode
   ownership is again the earliest actionable driver for every episode. ADR 488's
   second half, which withholds one inconsistent case by name, stays.
4. *No investigation, no unread blocks.* Guidance no longer emits
   `investigation:uncaused_highs`. The findings payload drops `uncaused_highs`, and
   roster rows drop `overlap_counts` and `harm_low_overlap`. The exposures feed still
   counts `highs.uncaused`, the QA catalog still pins it, and ADR 422's owned Highs
   are still never uncaused.
5. *ISF is served but never queued.* Guidance still serves the `setting:isf`
   candidate with its action, because the Plan applies an ISF draft against that
   candidate (`/api/plan/apply` resolves `setting:<parameter>`). Removing it would
   break ISF staging. The candidate is never `admitted`, and the Queue holds only
   admitted candidates. Lows after correcting highs has no setting member and admits
   only through its correction habits. The analyzer, `isf_asserts_move`, the
   findings `isf` row and the pump-profile path are unchanged.
6. *A Setting no Pattern carries is selected as itself.* Guidance chose its next
   concern only among Patterns and habits, so the basal Setting reached that choice
   only as the overnight Pattern's member. With the Pattern cut, a basal move read
   "No current concern". Guidance now also considers a Setting that no Pattern
   carries (basal, today), never ISF. Overnight basal moves select as before, a
   held basal slot is investigated as before, and a daytime-only basal move,
   which the overnight Pattern never admitted, is now offered as an action too.

**What changes in the counts** (habit evidence only; no setting verdict changes):

- *Highs after meals.* A meal that only Meal bolus fell short claimed now leaves the
  Pattern's `k`. A meal that `carb_undercount` or `late_bolus` also claims still
  counts, once (ADR 424). `n`, the meals Exposure, is unchanged. In the QA showcase
  `k` goes from 1 of 32 to 0 of 32.
- *Uncaused highs.* A high whose episode only Meal bolus fell short explained now
  has no cause, so it counts in `highs.uncaused`. The QA showcase goes from 0 to 1,
  and `behavioral-missed-meal` from 3 to 4.
- *Verdict states.* High anchors that Meal bolus fell short fired on, or outranked
  another lever on, now read `clean` for the remaining levers. Missed meal's tally
  in `behavioral-missed-meal` moves from 2 / 1 / 1 / 1 / 1 to 2 / 0 / 1 / 1 / 2.
- *Meals clean rate.* The Outcomes meals clean rate no longer charges Meal bolus fell
  short's attributions to meals.

**Evidence that no dose moved.** Every surviving QA case was re-run through
`execute_case`. Its analyzer rows, support counts, queue rows (register, direction,
`asserts_move`, headline), ISF rest windows and carb-ratio history series are
identical to their committed literals before the cut. Only the outcome roster,
Finding titles, verdict tallies, occurrence states and the uncaused count were
re-dumped. The basal and carb-ratio predicates, `safety.py` and every analyzer's
staging verdict are untouched.

**Consequences.**
- A stored preference on a cut subject is served as an absent, set-aside row, and
  Restore still clears it. An active Focus on Meal bolus fell short ends through the
  existing `lever_unavailable` reconciliation.
- The 13 QA cases for the cut levers are deleted; the rest keep their names.
  Lows after correcting highs now remains a Pattern only when both correction
  habits are admitted, so a new `pattern-correction-fold` case composes the two
  correction recipes and carries the cross-family fold (ADR 424) and ledger S126.
- The no-cause Pattern state of the locked component library existed for the
  overnight Pattern alone; no counted Pattern can lack a claiming cause now, so it
  is retired from the stories, the fixture states and the lock (§4.2), pending the
  operator's approval of that lock amendment.
- Ledger stories S148, S149 and S192 are retired as R20 and R21; S107 reads
  `ic-block-evidence`, whose meals Findings replace the showcase's Meal bolus fell
  short. The correction factor no longer leads Changes, so S177 reads the basal
  lead on `basal-lower` and S179 stages its correction-factor Plan from the
  Diagnose panel before recording it. R18's finding count drops by the one
  overnight Pattern row.
- The Overview report card for carbs vs post-meal response needs its own producer
  (#501). It does not revive the detector.

## ADR 504 — The correction factor joins the Queue when its analyzer supports the change

**Context.** ADR 499 kept the correction factor (ISF) out of the Queue entirely:
guidance served the `setting:isf` candidate with its action, because the Plan
applies an ISF draft against it, but never admitted it. The Overview's ISF estimate
card (§2.5 of the lock, 2026-10-14) now shows the estimate whatever the engine
decides, and draws "current → recommended" only when the analyzer's one ISF
staging verdict, `isf_asserts_move`, supports the change.

**The operator's decision** (Connor, 2026-10-14): "I think ISF can show up in the
queue if there is an asserted change and then we just use the card design that we
came up with basically or a slight modification thereof from the overview page.
But I think, well, it can pretty much always exist on the overview page as an
estimate, you know what I mean?"

**Decision.** This amends ADR 499's fifth decision ("ISF is served but never
queued").

1. *The analyzer's verdict decides.* Guidance admits `setting:isf` when it carries
   an action and a member carries `asserts_move` true, the flag the ISF analyzer
   stamps from `isf_asserts_move`. A held, direction-only, range-held or
   unprogrammed ISF is still served but not admitted. Nothing downstream re-derives
   the verdict: the frontend Queue shows what guidance admits.
2. *Selected only when admitted.* ADR 499's sixth decision lets guidance consider a
   Setting no Pattern carries. ISF is one, but it is considered only when admitted,
   so a held ISF never leads an investigation, as before.
3. *Ranking follows the existing rule for every admitted candidate.* An admitted ISF
   ranks by its served Priority (the ISF tuning lever's), highest first, an exact
   tie broken by subject. It gets no boost and no penalty of its own.
4. *The Queue draws it with the Overview's card.* The open card is the IsfCard in
   the Queue's frame: titled "ISF", current → recommended, the fasting nights'
   evidence chart with the estimate in its range and the Current line, Estimate,
   Range and Fasting nights, and the Setting card's Snooze. Its Queue row is the
   Setting row with no time block. The Overview's card is unchanged and always
   shown.

**Evidence.** Through `/api/guidance` on the manufactured QA stores:
`isf-strengthen`, whose ISF asserts a strengthen, is admitted and queued;
`isf-held`, `isf-direction-only-weaken`, `isf-range-hold`, and `isf-strengthen`
with its pump profile removed (no programmed value) are not. No analyzer, predicate
or `safety.py` value changes.

**Consequences.**
- A person whose fasting nights support an ISF change sees it in the Queue, and can
  Snooze it as any Setting. Lows after correcting highs still carries no setting
  member.
- The hand-built "admitted ISF" Queue variant of the stories is replaced by the
  generated `isf-supported` store, read through the same API.

## ADR 505 — The synthetic fasting lane answers insulin; the engine keeps no guard for flat fasting glucose

**Context.** Every manufactured QA night held glucose flat at 120 mg/dL. The fasting
ISF regression read a 0 slope over that wall, so the showcase and nine coverage cases
measured ISF −0.0 with a −0.0 to −0.0 range, and the Overview card printed
"Estimate 0". The effective ISF prefers a measured value, so Carb undercount, the I:C
outcome read and the meals-start-high finding all ran on 0 in those stores.

**Decision** (Connor, 2026-10): "You just fix it in the synthetic. Obviously, my real
data fluctuates randomly enough that corrections happen often enough that an ISF
estimate is always going to be a real number, so it's just a synthetic issue." No
engine guard for flat fasting glucose.

- The QA catalog's flat lanes (both backgrounds and the basal-coverage lane) are
  tagged lane readings. Between 22:00 and 08:00 each lane night starts at 120 at its
  first reading. Each step it moves by a constant endogenous drift minus 40 mg/dL/U
  times the insulin that acted, and every reading carries 0.5 mg/dL seeded noise.
  The drift is the lane's mean insulin effect, so steady basal stays level.
- The lane answers delivered basal and uncovered boluses given since it last
  started. A case's own reading interrupts it, and the lane resumes at 120 after it.
  The case drew what its doses did, so applying them again would draw false lows.
- Each background carries two seeded Control-IQ automatic corrections between 04:00
  and 05:00, tagged automatic. That window clears the 01:00 and 03:00 basal slots the
  basal recipes read, the evening stories' lows, and the 06:00 test meals.
- The pass is idempotent and runs at the end of `materialize_case`, and before any
  recipe records follow-ups, because reconcile reads CGM.

**Consequences.**

- The showcase's committed bytes change. That goes past the "showcase unchanged"
  clause, which constrains coverage-era additions; this change is the operator's
  correction of the showcase itself.
- Wherever a real ISF lets another analyzer judge, the expectation moved. Two
  recipes moved to keep their demonstrations: the correction-on-IOB evening peaks at
  195, under Carb undercount's 200 runaway bar (pattern-near-tie keeps the 238
  runaway), and correction stacking's missed meal moved to 15:00 so its corrections
  finish before the night. No case changed `asserts_move` or a direction.
- A test that composes recipes outside `materialize_case` finishes its store with
  `_respond_fasting_lane`, or it measures the old flat-lane bug.

**Test-time budgets raised (2026-10-14).** Real fasting evidence makes the ISF fit
and the checks that need a non-zero ISF run where they used to skip, about 2 s
per behavioral case. Under load the focused QA suite measured 116–146 s and the
slowest case 20–27 s, over the 90 s and 15 s limits. Connor accepted the cost:
"As the price of a real ISF ... it's fine. We can, the tests can take longer. If
I get pissed off about that later, we can iterate." The limits in AGENTS.md are
now 150 s and 30 s.

## ADR 495 — The five-tab app replaces the desk, and the specifications follow it

**Context.** The swap (#495) makes the five-tab app (Queue, Changes, Overview, Day,
Settings) the only browser shell and deletes the desk. The desk is preserved as
release v0.1.0. The surfaces specification still described the desk as the
shipped surface: 131 requirements, nearly all about Diagnose, its rail and stage,
the watch dock, the Episode Log and the desk's Changes.

**Decision.**

1. *Surfaces specify the five tabs.* This change's surfaces delta adds one
   requirement per tab, the shell's five page paths and the per-screen error
   rule, each drawn from the lock in `docs/design/recommendations-redesign.md`.
   It removes every desk requirement. It keeps, unchanged, the ten that are
   server read contracts or still hold of the app (server-owned projections, the
   one dark theme, served headlines and their authorship, case-file denominators,
   the carb-ratio sentence register, setting labels, recorded Plan subject names,
   the trials roster read), and the three server-read requirements this change
   already modified. The Purpose paragraph, which still names Diagnose, Changes
   and Day, is rewritten for the five tabs when this change is archived.
2. *Other capabilities drop only their desk clauses.* The warm pass is described
   by its roster rather than "the initial Diagnose load" (http-api). The QA
   showcase's consumers are the smoke test and the image's smoke step, since the
   desk ledger replay and its Trial and Pattern Focus suite are gone
   (qa-e2e-database). The browser-gate findings mirror and test desk are removed
   (behavioral-layer). The Plan keeps its server rules and loses its staging-control
   scenarios; the app stages no Plan (plan). A requirement losing a scenario is
   restated under a new title, because a MODIFIED block cannot drop one.
3. *Desk-only harness records retire with the desk.* The warm-arrival change (#507,
   ADR 507) only made desk ledger stories arrive warm; its replay helper, test and
   change are deleted, since nothing on this branch runs that replay. Its two
   causes still bind the app's own smoke, so ADR 475 carries both forward: the
   warm roster runs before the serve, and the browser context sends
   `Connection: close`. The
   carb-ratio block-evidence change keeps its engine and API deltas but drops its
   surfaces delta, which described desk tiles the app does not draw.

**Consequences.** No engine, API or safety behavior changes. Prose mentions of
Diagnose that name an endpoint path or the fixture set
(`/api/diagnose/...`, `mockups/diagnose-workstation.synthetic`) stay, since
those are identifiers, not the shipped surface.

## ADR 475 — Contract tests and one browser smoke replace the behaviour ledgers

**Context.** #475 (Connor, 2026-09-25) cut the app to its loop and CI with it:
replace the frozen behaviour ledgers with a handful of end-to-end journeys at one
size, and finish a PR's CI in 15 minutes or less with no job over 10. The swap
(#495) deleted the desk, its ledger (204 stories at two sizes), its Trial and
Pattern Focus suite and their replay drivers. What the five-tab app needs proved
is narrower: that the live adapter turns the engine's real answers into the
screen models the locked screens draw, and that the built app puts them on the
page. The screens' states and behaviours are already proved story by story in
the Storybook suite, against the same models.

**Decision** (Connor, 2026-10-14, keeping it "as lightweight as possible").

1. *Contract tests, no browser.* `frontend/ui/app/live.contract.test.mjs` drives
   the real live adapter through the app's one client against a synthetic no-fetch
   serve, then asserts each tab's screen model against literal values per store:
   the showcase for all five tabs, `isf-strengthen` for a queued correction factor
   and `c3-trial` for an active Trial. Node resolves and strips the models'
   TypeScript itself; no bundler or new dependency.
2. *One browser smoke.* `frontend/app.browser.test.mjs` opens each of the five
   tabs once at 1440×900 and requires each to draw its primary content with no
   skeleton and no Unavailable. It asserts no behaviour.
3. *One harness, the permitted serve.* `scripts/smoke_app.py --then` boots the one
   permitted offline serve, after its existing probe, and runs either test against
   it; `--case` serves a generator-emitted case store instead of the showcase.
   #507's two flake causes are closed at the source: the scratch store is warmed
   through the server's own warm roster before it serves, and every request opens
   a fresh connection (no agent in Node, `Connection: close` in the browser).
4. *One CI job.* The `app` job runs both, hand-listed, and takes the served-app
   smoke step from the frontend job. Both fail closed without a serve.

**Rejected.** A journey per loop step that clicks through Pin, Snooze and End:
those writes are already played in the Storybook suite against fakes that fail
once, and the server's side of each write has its own backend tests. Repeating
them through a browser buys the ledger's cost back.

**Consequences.** A fact a screen model reads from the engine is pinned in the
contract test's per-store literals. A new screen gets one line in the smoke's
tab list. No synthetic store yet holds a queued basal block inside a Trial's
block; that state is proved only by the Storybook fixtures.

## ADR 516 — A site change is one fill sequence, a failed sync is served by a short label, and a failed fetch is retried early

**Context.** On a real store, one site change showed as three: the pump logs a
cartridge, a tubing and a cannula fill as separate events with distinct
sequence numbers, seconds apart, and the store maps each to a site change. In
Settings, a failed sync's raw exception text was the Error row's inline value
and ran off the row. And a fetch that failed at container start (network not
up yet) left the state Failed for the hour until the next attempt.

**Decision.**
1. *Join at the one read.* The rows stay as the pump logged them (keyed on
   seqNum). `Store.pump_events` joins every site-change fill within 30 minutes
   of the one before into one event at the first fill, lasting until the last,
   so every consumer — the Day timeline, the clean-window exclusion, the
   pattern sweep — reads one series. The pattern sweep's own 5-minute site
   clustering is removed as a second copy of the fact. Thirty minutes because
   the fills land seconds apart when the set is already in and minutes apart
   when the wearer inserts a new set between the tubing and cannula fills; two
   site changes inside half an hour are one procedure redone. The joined
   event's length spans the fills, so the exclusion margin around it covers
   exactly what the separate fills did.
2. *Classify at the exception, serve the label.* The fetch records a short
   label beside the raw text (`fetch_status.last_error_label`), classified by
   the exception's type: requests timeout, requests connection error, a
   sign-in the vendor refused (named where the pull signs in, since the vendor
   client raises the same exception for it as for any HTTP error), the vendor's
   HTTP status, a refusal to start, or Unknown. A failure stored before the
   column existed is served as Unknown. Settings shows the label inline and the
   raw text wrapped beneath it; it classifies nothing.
3. *Bounded early retry.* A fetch the status records as failed is retried
   after five minutes, at most three times in a row, then hourly; a success
   resets the count. The loop reads the outcome from the recorded status, the
   same fact Settings shows.

**Rejected.** Rekeying or deleting stored fill rows (seqNum keys are what make
re-pulls merge). Classifying the stored text by pattern at read time (brittle
against upstream message changes). Retrying only network failures: the retry is
bounded, so a refused sign-in costs at most three extra attempts per streak.

**Consequences.** A new pump event type that should count once per procedure
joins at the same read. A new fetch failure mode gets its label in
`fetch_error_label`, and the Settings stories serve it.

## ADR 517 — The model-view serves the day's findings, and Day marks every one

**Decision.** `/api/model-view?date=` serves `findings`: every anchor on the
requested calendar day that the engine counted toward a Lever, in time order,
each with `t`, `kind`, `bg` and `levers` (each Lever's key and served title).
An anchor counts toward its episode's Lever when it drove the episode, toward
each Lever whose own classifier verdict matched (the Episode Log's claimed
anchor), and toward Correction stacking when it is the low a Correction stacking
episode reached. Near-miss, clean and no-data anchors count toward nothing. Day
marks each finding with the Pattern glyph and names its habits on its event row,
and reads no anchor state of its own.

**Why the server.** Day had re-derived the rule from `episodes`: fired meant the
episode's Lever, outranked meant the matched verdicts, and a frontend list
dropped three habits the engine no longer serves (#499; `Lever(...)` cannot name
them). Which moments count toward which habit is policy, and its owner is the
evaluation, so the frontend's copy, and its unreachable cut list, go.

**Why every episode, not only the resolve day's.** `episodes` stays assigned to
the day an episode resolves on (ADR 0019). Day kept only anchors on its own day,
so an evening anchor of an episode resolving after midnight was dropped by the
next day's read and never served by its own: on the showcase a 22:00 Correction
on active insulin reached no day. `findings` reads every episode with an anchor
on the day.

**Why the reached low.** The Lows after correcting highs Pattern credits that
low to Correction stacking (`explore_exposures`), so a day that hid it showed
less than the Pattern counts. `model_view.stacking_reached_low` is now the one
rule both read.

**Consequences.** The UI fixtures are regenerated with the trimmed `findings`.
The contract test adds `pattern-correction-fold`,
whose days carry five kinds of finding, and checks the showcase's three days.

## ADR 522 — Reads answer without rescanning the history, writes re-warm in the background, and the app keeps its last answers

**Context.** Connor, 2026-10-14, on his phone against the home server (two cores,
about three times slower than the development Mac): "we definitely need some kind
of caching ... Like hot loading on a refresh ... every little interface click is
the longest wait". The server log showed a page load taking 43 s for Prompts and
56 s for guidance an hour and a half after a restart, so it was not a cold start.
Measured in-process on a snapshot of his own store (timings and endpoint names
only), no read wrote to the store or bumped the cache. Instead:

- `guidance`, `focus`, `verify/trials` and every follow-up read found their `now`
  by reading and parsing every basal, CGM and bolus row and every settings
  capture: 2.3–3.5 s per call on the Mac, several calls per request, never cached.
- `prompts` read the whole history to keep seven days (2.5 s), uncached by design.
- The timeline rebuilt its false-low records from all CGM (1.5 s), uncached.
- Settings captures (about 9,600 rows) were parsed afresh several times a request.
- A snooze advances the input revision and bumped the whole cache, so the
  Overview and Day (outcomes, model-view, the 14-day analysis) recomputed after
  any Queue action, about 30 s on the Mac.
- Only a fetch that committed rows started the warm pass, and its roster was the
  retired desk's: it left out the findings and guidance snapshot, the Trial
  roster, the Overview's 14- and 90-day analyses and the Day screen.

**Decision.**

1. *One query for "now".* `Store.latest_data_instant` takes the maximum stored
   instant of the four streams with one scalar query (every stored instant is the
   one text format `parse_t` reads, so the text maximum is the latest instant).
   Prompts reads its window only. The settings captures are parsed once per
   connection until `PRAGMA data_version` or the connection's own `total_changes`
   moves, and identical profiles parse once per read.
2. *The timeline is cached*; it reads only stored rows and no clock, so every
   write's bump keeps it current. Prompts stays uncached: its answered grace is
   measured on the wall clock.
3. *A follow-up write keeps what reads only recorded data.* The follow-up writes
   and the modules behind outcomes, the day navigator, the model-view, the
   timeline, and the analysis and scenarios at a non-default window were read
   transitively: those builders read only recorded data, so a snooze, restore or
   lifecycle step keeps them (`ResultCache.bump(keep=...)`). Revision-keyed and
   fixed results miss on the new revision by themselves; case-file preparations
   are dropped. Saving credentials invalidates nothing.
4. *Every write re-warms, and so does start.* Each invalidation also signals the
   warm worker, and `serve` warms once at start (`warm_on_start`, off for apps
   built in tests). The roster is what the five tabs read, in visit order.
5. *A log line per request* (path, status, ms, hits, computes, derived hits), so
   the home server's own log shows where time goes.
6. *The app keeps its last answers* (§2.5, 2026-10-14): in memory across tab
   switches (as built), in the browser across refreshes, keyed by the build and a
   hash of the token, and drawn at once while they are read again. A failed
   refresh keeps them under Unavailable and Retry (`stale`).

**Measured** on the real snapshot (Mac; host about three times slower):

| Tab | Warm, before | Warm, after | After a snooze, before | After a snooze, after (warm pass done) |
|---|---|---|---|---|
| Queue | 13.2 s | 1.8 s | 62.3 s | 2.0 s |
| Changes | 6.7 s | 0.4 s | 6.6 s | 0.5 s |
| Overview | 1.8 s | 0.2 s | 29.0 s | 0.2 s |
| Day | 4.2 s | 0.2 s | 19.4 s | 0.2 s |
| Settings | 1.8 s | 0.1 s | 1.8 s | 0.2 s |

**Not decided here.** A snooze still advances the input revision, which is also
the derived-results file's key, so the findings snapshot and the 30-day analysis
are recomputed after every follow-up write even though neither reads follow-up
state. The warm pass after a snooze takes about 46 s on the Mac. Keying derived
results by a revision that only recorded-data writes advance would remove that,
but it changes the store's derivation key and the follow-up concurrency contract,
so it is left for its own decision.

**Consequences.** A new cached builder that reads follow-up state must not be
named in the keep list. A new screen read belongs in the warm roster. The
browser keeps answers only from its own server, under its own token.

## ADR 524 — A Trial's comparison serves the Changes screen's trace, metrics and Control-IQ activity

**Decision.** The selected Trial's retained comparison
(`GET /api/verify/trials?selected=…&assessment=retained`) serves everything the
redesigned Changes screen draws, so the screen computes nothing statistical:

- **A `trace` per arm** (`views.before|after.trace`), binned from that arm's own
  population. A basal, ISF or whole-day Trial is aligned by clock time across
  its block (`start_min`, offsets `0…end`), one episode a night (the date the
  block starts on), from the readings the arm's outcomes read — for a basal
  block, the fasting rest windows inside it. A carb ratio Trial is aligned at
  each in-block meal bolus, −30 to 240 minutes, one episode a meal; a meal with
  no reading before its bolus has no start to align and is left off
  (`left_off`), while the arm's meal count (`denominators.contributing_meals`)
  still counts it. Each bin (10 minutes by clock, 5 by meal) carries `n`,
  `median`, `p25` and `p75` when it holds three readings; an arm with fewer
  than three episodes serves `traces` (each episode's readings) and no bins.
- **Mean, GMI and CV for every Trial and Focus**, beside the time-in-range rows
  and over the same readings. They were whole-profile only; GMI is new. They
  are context rows: the engine judges none of them.
- **Context rows are not resampled.** A context row never takes a direction,
  so its bootstrap interval was cost with no reader (no surface reads it); it
  now serves `interval: null`. This also covers the carb ratio peak, nadir and
  starting glucose rows. Directional rows are unchanged.
- **Control-IQ activity for a basal Trial** (`views.before|after.basal`): over
  the same windows the arm's glucose is read from, the time-weighted delivered
  rate (`basal_rate`) and programmed rate (`profile_basal_rate`) in U/h, and the
  share of the time delivered above and below the programmed rate (a suspend is
  below). The engine judges none of it.
- **The roster names a whole-profile switch's settings** (`trials[].changes`,
  profile rows only), the constituents the selected detail already served, so
  the Previous list prints them without a detail read per change.

**Why the comparison, not the breakdown.** The legacy breakdown
(`trial_breakdown`) reads whole periods — every reading of the 14 days, by
clock over the whole day — while the comparison owns the Trial's population
(the block's rest windows, the in-block meals) and is what its verdict reads.
The mock Connor approved drew whole-period glucose; serving the comparison's
population instead keeps one population per module, named, and the same one
the result reads (AGENTS.md: population is part of the contract).

**Why this is not saved.** A saved ending keeps the comparison without its
views (ADR 463 keeps only the clock), so traces and Control-IQ activity never
enter durable records. Mean, GMI and CV rows do, as rows with a unit and a
named denominator, which the ending validator already accepts.

**Consequences.** The UI fixtures are regenerated, with three new synthetic
stores (a carb ratio Trial maturing on a few meals, a whole-profile switch, a
run of previous changes); `scripts/ui_patient.py` now takes a list of dated
changes, each an in-place edit or a switch, and reproduces every earlier store
byte for byte. The live adapter reads the active Trial's comparison whether or
not it has matured, and no longer reads the guidance for Changes. The
provenance grammar gains `+`, for the Previous count.
