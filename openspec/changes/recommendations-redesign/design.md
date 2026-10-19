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

## ADR 518 — Done on a Setting card is a Plan the next sync resolves

**Context.** A Queue Setting card (basal, I:C, ISF) had no way to say "I
programmed this into my pump". The card stayed queued until a sync showed the
change, so it looked unhandled in the meantime, and Snooze, the only way to
clear it, means "not now". Connor decided on 2026-10-14: "have the user
acknowledge, you know, I programmed this into my pump and only have it resurface
if a pump sync occurs that contains data since the moment that they swiped,
stating that the setting still hasn't changed." Then, on a different value:
"if I program something slightly different, for example, if I was given ...
0.82 and I was like, no, I'm gonna do 0.85. I'd prefer the trial. I don't want
to see the old basal value." And on scope: "one done per card, yeah ... I
wouldn't want to have to enter a pump changes screen and say here's all the
changes I did."

The engine already held a record of exactly this: a recorded Plan, the person's
decision to program a setting, matched against the pump reads after it and
withdrawable (ADR 431, ADR 463 decision 7). The desk staged a Plan in a draft and
recorded it with Apply; the five-tab app (ADR 495) kept no Plan surface, so
nothing in the app read the draft, the pending-Plan disposition or the Trial
detail's stage-prior route any more.

**Decision.**

1. *Done records a Plan from the card's own served action.* `POST
   /api/plan/apply` takes the setting's guidance subject and the read it was
   made from (`subject`, `analysis_generation`, `input_revision`, `request_id`;
   all four required). It records the candidate's served action rows as the
   Plan's items: one item per action member start (the action's own start when
   it names none) at the action's recommended value, an I:C item carrying its
   block (`guidance.done_items`). The client sends no values. The candidate must
   be a Setting the guidance admits, not snoozed and not already waiting; a
   stale read refuses as `stale_source`, an inadmissible one as
   `ineligible_source`. The decision context and the deliverable (the source
   profile and its rows) are captured as before. The write is durable and goes
   through the one lifecycle path, so it invalidates as a write to follow-up
   state (ADR 522): it writes only the Plan history, the follow-up records and
   the frontier (its staging row is written and cleared in the same
   transaction), and no result kept across such a write reads any of them. The
   default analysis, the findings and guidance snapshot and the case-file
   preparations are dropped and re-warmed; the guidance's Done state is read
   from the store on every guidance read and is never cached.
2. *One open Done per Setting, and it holds nothing back.* A Plan is open while
   it is neither resolved nor withdrawn. Each Setting subject has at most its
   newest open Plan, and several Settings can each wait at once. This replaces
   ADR 431's "only the newest Plan is pending" and its superseded verdict. An
   open Plan no longer withholds a Focus (`focus_pin` names no `pending_plan`
   reason), and a Done is recorded whatever change is being watched: a pump
   change it leads to ends or joins that change by ADR 500's rule.
3. *Undo is withdrawal.* `POST /api/plan/history/withdraw` withdraws an open
   Plan, unchanged but for its open check; one already resolved refuses as
   `nonpending_plan`.
4. *The first sync after the Done decides it, in reconciliation.* The read at or
   before the decision is what the card showed; the latest read captured after
   it is what the pump runs. At each Plan item's start minute, at pump
   precision:
   - a setting that moved there, to the suggestion or to any other value,
     closes the Plan *on the pump* at once. The pump change is its Trial by the
     ordinary rule (#502, ADR 500/506/510); nothing compares the new value with
     the suggestion. ADR 463 decision 7's link then names the Plan in that
     Trial's receipt when the match is one to one, and a Trial whose transition
     carries the Plan's whole schedule still links through the Trial-matched
     receipt (`_reconcile_plan`).
   - a setting that did not move closes the Plan *not on the pump*, but only
     once the store holds pump data (the latest CGM or basal record) from after
     the decision. A sync of what the pump uploaded before the Done never reads
     as not on the pump: Connor's "a pump sync ... that contains data since the
     moment that they swiped".
   - with no read after the decision, or with only a stale one, it stays open.
   A Plan whose items name no integer start minute cannot be decided and leaves
   only by Undo. The decision is written once, in the reconciliation receipt
   (`on_pump`, the deciding read), and later reads never rewrite it. This
   replaces ADR 431's pump-read confirmation (the unbroken run of holding reads)
   and its mismatch verdict.
5. *One verdict, read off the record.* Each recorded Plan serves `withdrawn`,
   `waiting`, `on_pump` or `not_on_pump`, with the deciding read's time
   (`read_at`). A Plan an earlier build confirmed is `on_pump`.
6. *The guidance serves each Setting's Done state; the app renders it.* Each
   Setting candidate carries `acknowledgment`, from its subject's newest Plan
   not withdrawn: `waiting` while open; `not_on_pump` after an unchanged sync,
   until the next pump change of that setting or a snooze decided after that
   read; otherwise none. A waiting candidate is not selected. The app queues a
   candidate only when it is admitted, not snoozed and not waiting, and marks a
   `not_on_pump` card. Changes reads the Trial roster and not the guidance (ADR
   524), so the roster serves the waiting acknowledgments as `waiting`, from the
   same function; Changes lists them in the slot between the current change and
   Previous. The app re-derives none of it.
7. *What the app no longer needed goes.* The draft routes (`GET`/`PUT
   /api/plan`), the guidance's `draft` and `pending_plan` fields and their
   dispositions, the `stale_draft` and `ineligible_draft` refusals, and the
   Trial detail's `plan_route` (the desk's stage-prior draft) are removed: the
   app read none of them and nothing else did. The Store's Plan methods, the
   `plan_history` and `plan_draft` tables, the Plan history read, the
   deliverable, the Trial-matched receipt and the annotated I:C group matching
   stay: Done records through them, and Trial detection reads the history.
   With the draft route gone, the draft's cache exception goes too; saving
   credentials (ADR 522) is the one write left that invalidates nothing.

**Dosing.** No analyzer, staging predicate, cap or floor changes: Done exists
only on a card the engine already admits through its one staging verdict, and
records the engine's own served suggestion. Not on pump shows the same card
again, with the same served suggestion; it adds no recommendation. A different
value on the pump is measured as the Trial it is, never re-advised as the old
suggestion.

**Consequences.** A store's existing open Plans from the desk are decided by the
next reconciliation, each against the read before and the latest read after
it; one whose setting has not moved since shows its card Not on pump, if that
card is queued, until the next change or a snooze. The amendments this makes
to the Plan, HTTP API and surfaces specifications are in this change's spec
deltas, and the confirmation requirement ADR 500 modified moves here.

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

## ADR 520 — The Queue reads a carb-ratio block and a Pattern served as its habit through what the engine serves for them

**Context.** A mock-up pass on the operator's own data (2026-10-14) found three
faults in what the Queue serves. A queued carb ratio drew an empty card: the I:C
row carried its numbers only at row level and no `members`, while the Queue reads
a Setting's numbers off its first member, as basal's rows serve them. *Highs after
treating lows* and *Lows after correcting highs*, each served as its one admitted
habit, had no case file: the case file resolved a `pattern:` subject only through
a Pattern row, and a collapsed Pattern has none, so the card drew no impact line.
And *Lows after correcting highs* counted 3 of 65 lows on its card while its case
evidence held 4. The card read the habit row's own count sentence, which is two
steps removed from the Pattern: it counts only the lows that habit drove, never
the lows another rate lever reached (Correction stacking credits the low its
stacked pair reached), and it is the first of the habit's per-family sentences,
alphabetical, so a habit counted in highs and lows printed its highs. The
synthetic wearer showed the second form: *Highs after treating lows* printed
"1 of 18 highs" where the Pattern counts 8 of 37 lows.

**Decision.**

1. *An I:C block is its own one member.* `_ic_rows` serves `members` as a
   one-element list, `{start_min, current, recommended, estimate}`, the shape a
   basal run serves per slot. A block is single-valued, so the member repeats the
   row's numbers; the Queue reads both settings one way.
2. *A collapsed Pattern is counted as the Pattern, on its habit's row.* The
   findings projection stamps that habit's row with `served_as`: the Pattern's
   subject, its count sentence and each rate lever's credited count, all from
   `credited_claims` over the Pattern's window population — the rule its `k` and
   its case file already read. Every row carries the key, null elsewhere. The
   habit's own count sentences are unchanged, and the published Pattern roster
   stays the producer's, verbatim.
3. *A collapsed Pattern's case file is the Pattern's.* Asked for under its
   `pattern:` subject, the case file resolves a Pattern with no row from the
   findings answer's roster, gated by the same chartability predicate, and
   projects the Pattern's population, so its claimed count is the card's count.
4. *A low serves its outcome.* Beside a meal's arc reading, a low Occurrence serves
   the peak (a high outcome) or nadir (a low one) of its own drawn trace from the
   anchor to the comparison window's far edge, in the meal outcome's shape.
5. *Stories read engine output.* The hand-built `wearer-ic` story variant, which
   gave the I:C row a `members` field the engine never served, is deleted; the UI
   fixture generator serves `carb-ratio-supported` from the
   `basal-and-carb-ratio-lower` QA case instead.

**Rejected.** Reading a collapsed Pattern's count off the case file's summary: it
would make the Queue's row wait on a second read, and the count belongs beside the
row the Queue already reads. Adding the count to the published roster: the
projection publishes the producer's roster verbatim, and that is pinned.

**Consequences.** The findings fixture, the workstation case-file capture and the
UI fixtures regenerate. A new QA case, `pattern-correction-collapse`, holds a
collapsed Pattern whose count its habit's own count understates, and the live
contract test runs on it and on `basal-and-carb-ratio-lower`. Standalone habit
candidates the engine queues (for example a missed or unannounced meal) are still
dropped by the Queue's `item()`; that remains deferred.

## ADR 523 — A Pattern's case file serves its trace chart, and Typical is the comparison episodes aligned at the same start

**Context.** The open Pattern card drew a waffle of its occurrences by cause,
and its impact line read each cohort's median from the case file's event
projection. The operator, on mock-ups of his own data (2026-10-14): "I think
the charts are better" — episodes aligned at their start, against Typical. The
setting charts: "They look wonderful. I love it. Perfect." The Overview's basal
card: "I think the 48 slot".

**Decision.** Each Pattern's case file serves `traces`: the start every episode
is aligned at (`anchor`), the minutes drawn (`window_min`), and two cohorts.
`pattern` is the episodes the Pattern counts; `typical` the comparison episodes.
Each serves the anchors it draws and its 5-minute bins (`minute`, `n`, `median`,
`p25`, `p75`), a bin served only from three readings; `pattern` also serves each
episode's readings when it draws eight or fewer, else `episodes` is null. An
episode with no reading in the first ten minutes of its window is left off both
the anchors and the bins, never drawn from part-way. Per Pattern:

| Pattern | Start | Minutes | Pattern | Typical |
|---|---|---|---|---|
| Highs after meals, Lows after meals | the meal's bolus | −30 to 240 | the meals the Pattern counts | the event comparison's meals |
| Highs after treating lows | the low's nadir | 0 to 180 | the lows the Pattern counts | every other low |
| Lows after correcting highs | the correction the low followed | 0 to 240 | the correction before each low the Pattern counts | every other lone correction |

**What changed in "Typical".** For the two meal Patterns it is the comparison
cohort it already was. For Highs after treating lows it was the lows neither
matched nor nearly matched; it is now every low the Pattern does not count,
near misses included, so Typical is "what a low usually does next". For Lows
after correcting highs it was other lows, aligned at their nadir; it is now
corrections: a low has no start to align a correction's path at, and the
question the card asks is what a correction usually does. A lone correction is a
user correction (the engine's `_is_user_correction`) with no other within the
stacking window (60 minutes) either side, so no second dose shapes its path
(`opportunities.lone_corrections`). The Pattern's episodes start at the dose the
engine names for each counted low: the correction a Correction on active insulin
verdict judged, or the stacking dose a Correction stacking episode drove.
`explore_exposures` serves that time on the low as `corrections`, keyed by the
habit, from the verdict the attribution retained (`AnchorVerdict.correction_t`),
so the case file re-runs no classifier.

**The impact line follows.** "Peak · Typical" and the row's delta read each
cohort's highest or lowest served median from minute 0, from `traces`, so the
number beside the chart is a point on the chart. Where either cohort serves no
bin from minute 0 there is no impact line.

**The setting cards' counts are served.** A carb-ratio block serves
`evidence.counted_runs`, the pooled meal runs with their ratio: the I:C card's
dots and its Meal runs count are that one list. The basal Nights count is the
slot's `days`, and the ISF's Fasting nights its estimate's `n_clusters`. The
Overview's basal card reads the basal analyzer's 48 slots as served: programmed
rate, estimate and range, and `asserts_move` with `direction`.

**Not served.** The frontend computes no band, chooses no episode and applies
no threshold; it draws the served bins and breaks a line where the series has a
gap.

**Consequences.** The open Pattern card names no cause: the waffle and its
legend are gone, with CauseWaffle. The findings-projection and event-comparison
fixtures carry `traces` and `counted_runs`; the frozen exposures input carries
its outranked low's `corrections`. The UI fixtures trim each case file to its
`traces`, add the staged I:C blocks and each Overview window's basal slots, and
pick the Pattern stories by trace form. The contract test checks the traces on
the showcase and both correction-Pattern cases, the counted runs on the carb
ratio case, and the showcase's basal slots.

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
so it is left for its own decision (decided in ADR 538).

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

## ADR 538 — Derived results are keyed by a revision only recorded-data writes advance

**Context.** ADR 522 left one slow path: a snooze, restore, pin, Done or Trial
step advances the input revision, which also keyed the derived-results file, so
the findings snapshot and the 30-day analysis were recomputed after every
follow-up write although neither reads follow-up state (a warm pass of about
46 s on the Mac, about 2 min on the home-lab host). On the synthetic showcase the
first guidance read after a snooze took 4.06 s and the warm pass after it 4.0 s.

**Decision.**

1. *Two revisions.* The input revision is unchanged: it advances on every
   committed write and stays the follow-up writes' concurrency token (a durable
   request's `input_revision`, a preference's expected revision, the frontier's
   `reconciled_input_revision`, the guidance's `input_revision`, `/api/status`,
   and the fetch loop's commit check). A new recorded-data revision
   (`Store.recorded_data_revision`) advances in the same transaction as every
   write to what the analysis reads: the stream upserts (basal, bolus, CGM,
   insulin on board, pump events, settings captures), carb entries, prompt
   answers, and a schema migration. Preferences, Focus pins and resolutions, a
   Done, follow-up records, frontier and receipts, pattern sign-offs, the
   pattern-subject rewrite, credentials and fetch status do not advance it. Each
   writer names its class where it advances (`recorded_data=`). A follow-up
   transaction that joins a recorded-data write publishes each revision once at
   commit. The new revision is seeded from the input revision, so it never
   reuses a number.
2. *Each derived result is keyed by the revision of what it reads.* The
   derived-results file and the fixed in-memory results are keyed by the
   recorded-data revision; a builder that reads follow-up state says so
   (`reads_follow_up=True`) and is keyed by the input revision. The watched
   change (`/api/outcomes/trend`) is the one such fixed result, so it keeps its
   persisted answer and its labelled predecessor as specified.
3. *Follow-up state is read beside the results, not inside them.* The guidance
   already reads preferences, admission, the watched change and the
   acknowledgments in one snapshot at one input revision, composes them with the
   findings snapshot, and rechecks that revision; that stays. The Trial roster
   stays keyed by the input revision it read.
4. *The keep list names every recorded-data result*, the fixed ones included, so
   a follow-up write keeps them in memory as well as in the file.

**Which cached results read follow-up state.** The store's follow-up reads are
`guidance_preferences`, `active_focus`, `list_focuses`, `follow_up_record(s)`,
`follow_up_frontier`, `follow_up_request`, `get_plan_draft`, `plan_history`,
`pattern_reviews` and `latest_server_stamp`; no other module queries those
tables. Their callers are the API's composition and write paths,
`watched_change`, `pattern_sweep` (the sign-offs), `sync` (the stamp floor, at
ingest), `credentials` and `fetch_loop`. No recorded-data builder — the analysis
and its analyzers, the scenario report, the exposure feed, the time-of-day
profile, the findings projection, the carb-ratio history and block evidence, the
basal-night and ISF rest-window evidence, outcomes, the day navigator, the
model-view, the timeline, the catalog — imports `watched_change`, `pattern_sweep`
or `follow_up_comparison`; the guidance helpers the findings projection calls are
pure over payloads, with preferences passed in at read time. A test reads every
recorded-data result cold on the showcase with each follow-up read recorded:
none is called. The Trial roster, the watched change and the pattern sweep each
call one, and each still refreshes on a follow-up write: the roster and the
watched change by the input revision, the sweep by being dropped.

**Measured** on the synthetic showcase, in process on the Mac, one snooze after
a full warm pass:

| | Before | After |
|---|---|---|
| First guidance read after the snooze | 4.06 s | 0.01 s |
| Warm pass after the snooze | 4.0 s | 0.8 s |
| Default analysis in that pass | 2.19 s | 0.00 s |
| Time-of-day profiles in that pass | 0.80 s | 0.00 s |

What remains is the case-file preparation (0.77 s) and the Trial roster (0.07 s).

**Rejected.** Stopping follow-up writes from advancing the input revision: two
follow-up writes from one read would no longer refuse each other, and the
frontier could no longer tell that a write left it unreconciled. Moving the
watched change out of the derived-results file: it would drop its specified
labelled predecessor for no gain, since its key already follows every write.
Per-table dependency tracking: two revisions answer the one question asked.
Bumping the file's layout version: every artifact's marker already carries the
source fingerprint, so nothing written before this change can hit.

**Not decided here.** A case-file preparation is still dropped on every write. It
reads no follow-up state, but it is leased by a projection identity that carries
its cache generation, so keeping it across a write changes the preparation
contract rather than a key.

**Consequences.** A new writer to a table the analysis reads advances with
`recorded_data=True`; any other passes `False`. A new fixed result that reads
follow-up state passes `reads_follow_up=True` and stays out of the keep list.
The showcase's logical dump leaves the new revision out, as it does the input
revision.

## ADR 531 — The findings answer serves only what the app reads, and the desk's mirror inputs go

**Context.** The swap (#495, ADR 495) deleted the desk and its JavaScript findings
mirror, but the findings answer still served what only the desk read, and the
findings-projection fixture generator still froze inputs for that mirror. #531 asks
to remove what nothing reads, and to check the Plan routes against Done (#518, ADR
518). The charter rules dead code a defect, and a negative claim needs an unfiltered
whole-tree grep (AGENTS.md: `frontend/index.html` is a consumer).

**What the app reads.** The live adapter (`frontend/ui/app/live.js`) and the UI
fixture generator (`scripts/gen_ui_fixtures.py`) read the whole-day findings
answer only: its `outcome_patterns` and the rows that are a Pattern, a claimed or
collapsed Finding, or a setting row with members, and of those rows only `id`,
`kind`, `title`, `chips`, `claimed_by`, `lever`, `parameter`, `count_sentences`,
`fold_sentences`, `span`, `members` and `served_as`. Of the case-file preparation
they read only `projection_id`. They send no clock window to either read and no
`selected_id`. A whole-tree grep (`frontend/` with `index.html` and `frontend/ui`,
`ciq_autotune/`, `scripts/`, `tests/`, `.claude/qa/`, `mockups/`) finds no reader
of `counts`, `chip_counts`, `selection`, `selected_id`, the `held`, `blind` or
`history` registers, or the row fields `lean`, `reason`, `past_setting`,
`programmed_now`, `regime_end` and `run_ids`, outside the projection's own tests
and the QA harness's literal expectations of them. The server's own scoped readers,
the Pattern Focus pin and the case-file preparation, read only the scoped
`outcome_patterns` and the Finding and Pattern rows.

**Decision.**

1. *The findings answer serves the window, the findings window, the rows and the
   Pattern roster* (schema `diagnose-findings-v3`). `counts`, `chip_counts` and
   `selection` are gone, and so are the findings route's and the case-file
   preparation's `selected_id` (the preparation now refuses it as an unknown
   parameter, the findings route ignores it).
2. *Every window lists only asserting settings, Findings and Patterns.* The held,
   no-clean-day (`blind`) and past-setting (`history`) rows are gone in every
   window, with their headline templates, the held title suffix (" · leaning …"),
   and the row fields only they filled. A parameter row is listed exactly when its
   analyzer's one staging verdict lists it (`asserts_move` for basal and carb
   ratio, `evidence.direction` for ISF), as the whole-day queue already did. Every
   row that remains is byte-identical to the one main served, in every frozen
   window: order, tier, headline and fields.
3. *The findings-projection fixture keeps the projection's answers and its exposure
   feed.* `inputs.exposures` stays because the generator reads its producer-built
   over-treated low slice back on the next run. The mirror's inputs and frozen
   answers (`browser_*`, `habit_rate_families`, `pattern_family_cases`,
   `pattern_clock_case`, `density_history`, `selection_*`, `direction_only_inputs`,
   `no_data_inputs` and the rest of `inputs`) are gone, with the generator code
   that built them. The event-comparison capture
   (`mockups/diagnose-event-comparison.synthetic`) goes whole: its generator read
   three of those keys, its rows fed only the desk's case-file mirror (`project.mjs`,
   imported by nothing) and the findings generator's browser cases, and its one
   other reader was a shape test of its own rows. Its CI drift step, allowlist line
   and AGENTS.md section go with it. The mirror's own test was already deleted.
4. *The out-of-family rule keeps its proof.* "A Pattern case file judges only the
   habit members in its rate family" was proved only by the mirror's parity with
   the frozen `pattern_family_cases`; a test through the case producer now proves
   it directly, and fails when the rate-family filter is removed.
5. *The Plan routes stay.* After #518 the app calls `POST /api/plan/apply` (Done)
   and `POST /api/plan/history/withdraw` (Undo); `GET /api/plan/history` is the
   read the Plan, durable follow-up and wall-clock tests observe verdicts through,
   and ADR 518 kept it. Done records through the Store's staging row, which ADR 518
   kept too. No Plan route or field is unread, so none is removed.

**Not in this change.** Other desk-era reads the app does not call stay, because
#531 names the findings answer and the Plan routes and they have their own
readers: the I:C history-events, block-evidence, basal night-evidence and ISF
rest-window routes, the case-file preparation's `findings` and `rendered_rows`
copies, the scoped findings window, and the Diagnose workstation demo set
(`mockups/diagnose-workstation.synthetic`), whose payload the shape tests read.

**Dosing.** No analyzer, staging predicate, cap, floor or served suggestion
changes. A held or no-clean-day setting was never queued and never staged; it is
now also never listed. Its number and band stay on the analysis read, and
guidance still reads the carb-ratio `held_reason`.

**Consequences.** The findings-projection fixture drops from about 92,000 lines to
about 10,000, and the missed-meal fixture's hand-built answer takes the v3 shape.
The QA harness's literal expectations lose their held, blind and past-setting queue
rows and the past-setting title; the cases keep proving those states through their
analyzer rows. The spec deltas restate the headline, setting-title, rate-family,
workstation-row and QA-era requirements without their desk scenarios, and modify
the history-generation and count-sentence requirements.

## ADR 529 — Day asks about rises, and each Prompt serves when its reading was

**Decision.** The engine's missed-meal Prompts, which it already derived and
served, reach the app as Day's Rises (Connor's decision Q20 = A, 2026-10-14; lock
§2.5). They are listed under the Lows and drawn by the same PromptCard and the
same one-at-a-time drill-down; a Rise answers Yes, No or Not sure, with no False
low, and its answers take the one prompt-answer path. To draw a Rise at its peak
the Prompts read serves each Prompt's `key_t`, the time its `key_bg` was read
(a rise's peak, a low's nadir, which is its anchor), and a rise's readings run
on to its peak when it peaks more than two hours after its onset.

**Why serve the time.** The rise's peak is the High run's own anchor, which the
engine already held; the app finding it again in the readings would be a second
implementation of the same fact (lock §2.3 ban 7, AGENTS.md: keep policy in its
owner). One field for both kinds keeps the card free of a detector branch for
where its reading is.

**Why one component.** A Rise differs from a Low in its name, glyph, reference
line and answers, all keyed off its kind; the layout, motion, swipe, grams
field and live writes are the Low's. A second card or drill-down would be the
duplication the charter forbids.

**Consequences.** The live adapter keeps every prompt, trimmed to what the card
draws (no question or context sentence is kept in the browser), mirrored by
`gen_ui_fixtures.prompt_marks`. The UI fixtures gain three Rises stores from the
same wearer with two lunches never bolused for (`ui_patient.simulate`'s
`unbolused` days), and every earlier store keeps its bytes but for its prompts'
trim. The provenance grammar takes more than one filter on a list, for the
Rises count.

## ADR 530 — A carb-ratio move rides only on the meal Pattern its direction answers

**Context.** Highs after meals and Lows after meals both carry the carb-ratio
setting as a member. The roster admitted that member under each Pattern whenever
any carb-ratio block asserted a move, whatever its direction, so one move was
offered twice. A stronger ratio (fewer grams per unit, more insulin per meal) was
offered as the answer to lows after meals, where it would deepen the lows, and a
weaker one as the answer to highs after meals. Each Pattern also carried the
setting's whole action list, both directions together when two blocks moved
opposite ways, and was seated in the Queue beside the first asserting carb-ratio
row of either direction. The engine audit of #499 found it; Connor agreed to
gating the member on the move's direction: "Yep that makes sense".

**Decision.**

1. *One rule, in the Pattern roster.* `outcome_patterns.setting_move_fits` maps
   Highs after meals to a strengthening move (`direction` "lower", lower g/U) and
   Lows after meals to a weakening one ("raise", higher g/U). The direction it
   reads is the carb-ratio analyzer's own published one: a block's `direction` is
   set only when `ic_asserts_move` holds, so a held block names none and fits
   neither Pattern.
2. *The member admits only through a fitting move.* The setting member admits,
   and carries the action, only when an asserting block's direction fits its
   Pattern. Its seriousness and seriousness spans leave out blocks moving the other
   way, so a weakening block's recurring-low verdict no longer reads on Highs after
   meals.
3. *The member stays in both Patterns.* A member whose move points the other way is
   kept, unadmitted and with no action, rather than dropped. Its Pattern's member
   set and fingerprint are unchanged, so no set-aside Pattern returns for a
   "member set changed" reason. Guidance also keeps selecting the carb-ratio
   setting through a Pattern, never as its own Queue item.
4. *Readers apply the same rule.* Guidance serves a setting-admitted Pattern only
   the action rows whose direction fits it. The findings projection seats such a
   Pattern beside the first asserting carb-ratio row whose direction fits. Both
   call the roster's rule. Neither re-derives a direction, and the frontend reads
   only what is served.

**Basal and the correction factor.** Neither has the defect. No Pattern carries a
basal setting member (overnight lows reach the wearer through the basal Setting,
ADR 499). Lows after correcting highs carries no correction-factor member (ADR
499, ADR 504). The carb ratio is the only setting any Pattern carries.

**Consequences.** The QA catalog's carb-ratio cases now show the move admitted
under one meal Pattern only: ic-raise, ic-lower, the two capped cases,
ic-block-evidence and basal-and-carb-ratio-lower. A new case, ic-split-directions,
has a strengthening morning and a weakening evening at once. Each meal Pattern
there carries only its own block's action and sits beside that block. The
findings-projection fixture is regenerated. Its strengthening evening block now
seats Highs after meals only, and Lows after meals falls to the unpriced tail.
The component library's fixtures are regenerated too. Their carb-ratio store
(basal-and-carb-ratio-lower) no longer queues Lows after meals, and that store's
contract test now expects the Queue to hold the basal Setting, Highs after meals
and the carb-ratio Setting.

## ADR 547 — The desk's last evidence routes, scoped window, row copies and demo set go

**Context.** ADR 531 left seven desk-era reads in place because #531 named only the
findings answer and the Plan routes: the carb-ratio history-events, carb-ratio
block-evidence, basal night-evidence and ISF rest-window routes; the case-file
preparation's `findings` and `rendered_rows` copies; the findings route's clock
window; and the Diagnose workstation demo set (`mockups/diagnose-workstation.synthetic`).
#547 removes each once an unfiltered whole-tree grep proves nothing reads it. That
grep excludes only `node_modules`, `.git`, `dist` and `.venv`, so `frontend/index.html`
and `frontend/ui` are in it. Connor approved the AGENTS.md edits.

**What reads them.** The live adapter (`frontend/ui/app/live.js`, through
`frontend/data.js`) and the UI fixture generator (`scripts/gen_ui_fixtures.py`)
read the findings answer with no window, and read only `projection_id` from the
preparation. The warm roster warms neither of the four evidence routes nor a clock
window. Each evidence route's other readers were its own tests, its own fixture
generator and fixture, and two lists in other tests: the follow-up-state survey and
the warm-roster builder count. The server's one other reader was the findings
snapshot. That snapshot prepared the past-setting event series beside the findings
on every cold read, and only the history-events route projected it. The QA
harness's `history_series` expectation was that route's projection, pinned again.
The demo set's only reader outside its own drift check and shape tests was two
Pattern-producer tests in `tests/test_findings_projection.py`, which read the
exposure rows in its `payload.json`.

**Decision.**

1. *The four evidence routes go*, with their modules (`ic_history_events.py`,
   `ic_block_evidence.py`, `basal_night_evidence.py`,
   `isf_rest_window_evidence.py`). Their derived-results codecs, preparations,
   recorded-data cache keys, fixtures, generators, CI drift steps and AGENTS.md
   lines go with them. The ISF route's `_isf_rest_window_steps` adjunct, which
   the pooled analysis stamped and `/api/analyze` then stripped, goes too, so the
   analysis answer is byte-identical.
2. *The findings snapshot holds the findings alone.* It keeps its durable key
   `findings-history-snapshot` and marker `findings-history-v1`. The derived-results
   file deletes an older row only under the same key and marker, so a renamed key
   would strand the last multi-megabyte snapshot every install wrote. The new code's
   source fingerprint already keeps a pre-change row from being read.
3. *The preparation serves no copy of the rows.* `wrap` keeps the identity,
   coordinates, case headers and withheld Findings. Building the rendered rows and
   recomposing their headlines go. The Queue reads its rows from the findings
   answer, whose headline composer is unchanged.
4. *Neither route takes a clock window.* The findings route answers the whole day,
   and a stray `start_min` changes nothing, as `selected_id` changes nothing (ADR 531).
   The preparation takes no parameter at all and refuses any one with
   `400 invalid_request`. That includes its old `lever`, which it validated and
   then ignored. Its in-memory key is now `("finding-case-file",)`.
5. *The demo set goes whole*: its ten files, `.claude/qa/gen_synthetic_fixtures.py`,
   `scripts/check_demo_fixtures.py` and its test, the shape tests
   (`tests/test_synthetic_fixture_shapes.py`), the allowlist lines and the scan's five
   `authorized-synthetic` clearances. The two Pattern-producer tests now read the
   findings fixture generator's own exposure feed (`gen.exposures()`). It holds
   the shapes they need, an unclaimed meal and Correction on active insulin lows,
   and both tests pass unchanged on it.
6. *Analyzer coverage that ran through a route moves to the analyzer.* The basal
   excluded-night reasons and accounting tests join `tests/test_analyzer_basal.py`.
   The carb-ratio block's published facts are run reasons, ends, fit weights, the
   rule sentence, post-correction totals, harm lows and groups, next-bolus minutes
   and fractional ownership. Their tests now read the analyzer's serialized block in
   `tests/test_ic_block_published_facts.py`, which was `test_ic_block_evidence.py`.
   The wrapping-window case membership test prepares the case file over each window
   directly. Tests that pinned only a route's projection, its guard or its HTTP
   errors are deleted.

**Not in this change, and why.**

- The clock-window projection stays. The Pattern Focus pin admits its scope through
  `FindingsProjection.project(WindowQuery.clock(...))`, and the follow-up
  comparison, the store's follow-up reads and the QA harness's `scoped_windows`
  read it too. The case-file module keeps its `query` parameter, and its tests
  exercise it with clock windows.
- The preparation's `behavioral_case_headers` and `withheld_findings` stay. #547
  does not name them, and they are the preparation's own account of which cases it
  serves and which it withholds (ADR 488), though the app reads neither.
- The analyzer's fasting-evidence hook (`analyze(..., isf_fasting_evidence_sink=)`,
  `analyze_isf(..., fasting_evidence_sink=)`) keeps no caller. It is analyzer
  code, which this change does not touch. So are the past-setting identity
  decoders in `ic_history.py`, which `tests/test_analyzer_ic.py` round-trips.
- The scanner's `authorized-synthetic` clearance stays as a mechanism with an empty
  list. It is the scan's tested policy for a human-cleared file, and only the files
  it cleared are gone.
- The findings route's source-window parameter (`window`) is not the scoped
  window, and is untouched.
- An install's derived-results file keeps the last row of each retired shape
  (`basal-night-evidence`, `ic-block-evidence-preparation`,
  `isf-rest-window-evidence`): one row each, never read again, and disposable with
  the file.

**Dosing.** No analyzer, staging predicate, cap, floor or served suggestion changes.
The analysis answer, the findings answer and the guidance serve the same bytes as
before. The QA cases keep every analyzer, queue, support, rest-window, behavioral,
title and Pattern expectation, and lose only the history series.

**Consequences.** The spec deltas remove "Historical findings and event evidence
share one restart-safe generation" and restate it, without the event evidence, as
"The findings answer carries one restart-safe generation". They also remove "The
basal analyzer names one reason for every excluded night" and restate it, without
its night-evidence scenario, as "Every excluded basal night carries one
analyzer-named reason", and they remove "A rendered Finding row states one
denominator". They modify the basal glucose-evidence, case-file preparation and QA
shared-expectation requirements, and drop the ADDED workstation-rows requirement.
The carb-ratio-block-evidence change loses its never-archived http-api delta, and
its QA and parameter-analysis deltas keep only the analyzer's facts. The missed-meal
fixture loses its row copies, and the scan's dose-ratio baseline is re-recorded
without the two deleted captures' entries. The backend's drift checks fall from ten
to five.

## ADR 528 — A standalone habit is its own Queue card, with its case file's chart and count, and a Focus under its own key

**Context.** Guidance serves a habit no Pattern owns as its own candidate,
`habit:<lever>`, admitted on its scenario Priority. Today that is only the missed
meal: the outcome roster owns the other six levers. The Queue's model dropped
every habit, so an admitted missed meal never showed. Its case file served a
count but no chart. A Focus matched its card only by `pattern_key`, which a habit
lacks. `POST /api/focus` already pinned a lever, but stored no subject for it, and
the Focus list and the active watch served a subject only beside a Pattern key.
The operator decided (#528, 2026-10-19): the count in a Pattern's form, "N of M";
the approved trace chart; no Uncertain unless the engine serves one; and habits
get their own Focus key. Then: "The standalone habit card can be built. Now."
Only a cause choice on a multi-cause Pattern's Pin waits for the drill-down
(#532).

**Decision.**

- *The chart.* A habit's case file (`finding:<lever>`) serves `traces` in the
  Pattern card's shape (ADR 523) when its lever is in `_HABIT_TRACE_CHART`.
  `pattern` holds the episodes the habit claims; `typical` holds its event
  comparison's comparison cohort. Each is aligned where that comparison aligns
  it, over the habit's own comparison window. Both cohorts come from
  `_event_cohorts`, the one membership the event comparison is built from, so
  the chart is that comparison. For the missed meal, each claimed rise is drawn
  from its detected onset against the completed carb-bolus meals from their
  bolus, −60 to 300 minutes, anchor `meal_start`. Bins, the ten-minute lead and
  the eight-episode cut are ADR 523's. The table holds exactly the levers no
  Pattern owns, and a test pins that.
- *The count.* The card prints the case file's `summary`: claimed of
  denominator, with its noun. That is the habit's own recurrence population. It
  equals the scenario confidence the guidance prices the habit on, and it is the
  population the chart draws. The habit's findings row is not read for its
  count, because its sentences count the exposure feed's attributions per
  family, over a different denominator. On the wearer who skips weekday lunch
  boluses, the row says 6 of 26 highs and the case file 6 of 24. The row is read
  only for its chips, the card's tone, as a Pattern's row is.
- *No Uncertain, no impact line.* ADR 485's Uncertain is a Pattern's verdict on
  its admission at the low end of its evidence, and the engine serves none for a
  standalone habit. The scenario confidence's own `wide` flag is a different
  fact and is not read as Uncertain.
- *The Focus key.* Every Focus has one subject: `pattern:<key>` when it carries a
  Pattern key, else `habit:<lever>` (`watched_change.focus_subject`). Every new
  pin stores it. The Focus list, the active watch and the pin's retry check all
  serve or compare it through that one function, so a record from before habits
  had a key reads as its habit. The live adapter pins a habit by its lever, with
  the habit's subject and no outcome window, which is a Pattern's scoped
  admission. The Queue marks a habit pinned by an active Focus under its subject,
  and a Pattern still by its `pattern_key`.
- *Changes.* The follow-up comparison's existing lever path follows a habit's
  Focus: no Pattern key, the fourteen-day elapsed gate, and the lever's own
  outcome series. Its card names no Pattern.

**Not changed.** Pattern pinning: a Pattern with several habits still pins its
first pinnable one (`_pinnable_pattern_member`), and no cause chooser is added
(#532). Guidance admission, priorities and the Queue's order. No analyzer, cap,
floor or staging predicate changes, and no served suggestion moves.

**Consequences.** The missed-meal comparison fixture's case files carry
`traces`. The UI fixtures add three stores: `missed-meal`, `missed-meal-pinned`
(with its Changes) and `wearer-habit`. They trim each habit case file to its
`summary` and `traces`, keep each admitted habit's findings row, and carry each
Focus's `subject`, as the live adapter does. A seventh contract leg,
`behavioral-missed-meal`, asserts the card and pins and ends a habit's Focus.
"Habit" joins the lock's glossary. The test that asserted a lever pin's active
watch carried no subject now asserts its habit subject. Its point from #385
stands: snoozing the habit leaves the watch unchanged.

## ADR 501 — The Overview's Meal size card reads one 90-day window of the engine's own meals

**Context.** #499 dropped the engine's eating-sequence detectors, and with them its
only answer to "how much more does glucose climb after a bigger meal". #501 asked for
that as an Overview report instead. An analysis of Connor's own sixteen weeks (562
meals) found bigger meals climb higher and peak later, and the landing at three to
four hours mostly flat but for 60 g and over. Shown the mock, Connor (2026-10-19):
"that meal size card is nice. Hell yeah." and "let's build the meal size card". He
then asked for none of the mock's explanatory text on the card (lock §2.3 ban 1).

**Decision.**

1. *One read, one fixed window.* `GET /api/explore/meal-size` serves the last 90
   pump-local calendar days ending after the newest CGM day: the glucose profile's
   window rule at the Overview's longest window. The card ignores the window switch
   and its title prints the served 90 ("Meal size 90 d"). At 14 or 30 days, 60 g+
   would hold a handful of meals.
2. *The engine's own meals.* A meal is `group_meals`' (ADR 470: a first carb bolus
   of at least 10 g and its same-meal top-ups), grouped over the whole bolus history,
   as the profile's meal count is. Its carbs are `Meal.carbs`.
3. *Which meals count.* The start is the last reading at or up to 15 minutes before
   the first bolus, and it must be at or under the range line
   (`segment_range_high_mgdl`, 180). The Late bolus classifier must have found
   glucose flat before the bolus, its `no_trigger` verdict. It is handed the engine's
   context, readings, boluses and basal within `engine_context_pad_min` of the meal.
   The meal's Arc peak must exist. A false low's readings are left out, as the
   profile leaves them out.
4. *Why that verdict, not `matched`.* `matched` (late) also requires the meal to have
   run above 180. Leaving out only matched meals would drop the rising meals that
   climbed high and keep the ones that did not, an outcome filter on the very climb
   being measured. `no_trigger` is the classifier's own judgement that the dose led
   the rise. A meal it calls rising for any reason (an upstream low, a prior dose, a
   high start, or nothing) is out, and so is one too sparse to judge. The card adds
   no slope rule of its own (AGENTS.md: keep policy in its owner). The event
   comparison already reads `no_trigger` as "fully judged, nothing fired".
5. *What is read per meal.* Climb is the Arc peak (`meal_peak`: the highest reading
   in the three hours after the bolus, cut at the next meal) less the start. To peak
   is the minutes from the bolus to that reading. At 3 h is the reading at three
   hours (the last at or up to 15 minutes before it) less the start, read only when
   no later meal began by then. The three hours is `ARC_PEAK_HORIZON_MIN`, served as
   `horizon_hours`, so the card prints the engine's own.
6. *The sizes and their statistics.* Under 25 g, 25–39, 40–59, 60 and over, served
   as `carbs_from` ≤ carbs < `carbs_to`. Each size serves its meals (time, carbs,
   climb, to peak, at 3 h), the median and inclusive 25th and 75th percentiles of the
   climbs (`trial_evidence`'s method), the median to peak, and the median at 3 h with
   its own count. A size with no meal serves nulls. The frontend computes no
   statistic.
7. *Every count names its population.* At 3 h is read from a subset of a size's
   meals, so the card prints that subset's count under it, beside the size's own
   count under its label.
8. *Cache.* The read is one fixed result, `("meal-size",)`, marker `meal-size-v1`,
   keyed by the recorded-data revision (ADR 538). It reads only recorded data, so it
   joins `_RECORDED_DATA_RESULTS`, and a follow-up write keeps it in memory. The warm
   roster warms it after the Overview's windows. The live adapter reads it once with
   the Overview tab, whatever window is shown, and keeps each meal as its dot (its
   climb), as `gen_ui_fixtures._meal_size` does.
9. *One dot row.* The beeswarm, the dot size and pitch and the dot styles move from
   EvidenceChart into the chart module (`Chart/scale.ts`, `Chart.css`), and both
   charts read them. The card's median and 25–75% are neutral ink, not the accent:
   a report's median is no setting's estimate.

**Words.** Meal size, Climb, To peak and At 3 h join lock §1.5. Median widens to a
size's meals, and "min" is a unit. Rise is the unbolused high's term already, so the
card never uses it. CONTEXT.md records Climb as the Arc peak less the start, the
card's one relative measure; the Arc peak stays absolute everywhere else.

**Dosing.** The card judges no setting and no habit. It is never a Queue item, a
Focus or a setting move, and no analyzer, staging predicate, cap or floor changes.

**Consequences.** The component library gains the MealSizeCard and its stories:
populated, sparse 60 g+, sizes with no meal, no data and loading. Stale is the
Overview's own story. The UI fixtures serve it for the wearer, its first days, the
unsynced store and the QA showcase, and the generator fails if any of those stops
serving its state. The showcase's contract leg asserts its literals. The lock's
§2.6 heading, dropped by #529's amendment, is restored.

## ADR 550 — A habit is counted over its recurrence population, from one source

> Superseded in part by `ADR 553` (below): no claim sits on a near-low, and the
> engine's clamp this record kept under "Not changed" is retired.

**Context.** A standalone habit's findings row and its case file counted one claim
set over two populations. On the synthetic `wearer-habit` store (the wearer
skipping the weekday lunch bolus) the missed-meal row said 12 of 26 highs and
added 1 of 52 correction clusters; its case file and the engine's confidence said
12 of 24 highs. ADR 528 had the Queue card read the case file to route around it.
The row is projected from the exposure feed, which emitted one Occurrence for every
anchor the episode walk visited, and marked a claim on every anchor at the
attribution's trigger time. The case file counts the engine's opportunity
populations (`opportunities.build_opportunities`, the recurrence population each
lever's policy names, ADR 202) and puts each claim on the one opportunity its
attribution is associated with. The feed was wider in three ways, each measured on
synthetic stores:

- *Near-lows.* Episodes anchor lows at the 75 mg/dL near-low line; the lows
  population is sub-70 runs (`gate_low_mgdl`, whose comment says a 71–75 dip "must
  not widen the LOWS denominator"). `wearer-habit`: 65 feed lows against 41.
  `pattern-near-tie`: Over-treated low 1 of 9 lows in the row, 1 of 7 in the case file.
- *Rebound Highs.* The #155 split synthesizes a High at an over-treated low's
  rebound peak, below 250 mg/dL. `wearer-habit`: two (199 and 228 mg/dL), so 26
  highs against 24.
- *The first correction.* Correction clusters are adjacent correction pairs,
  anchored at the second dose; the feed listed every correction, one more than the
  pairs. `behavioral-correction-stacking`: 2 of 8 against 2 of 7.

The claim placement split it further: one episode could claim in two families
(the missed meal's correction cluster, whose bolus sat at the rise's trigger
time), and an over-treated low claimed from its rebound High was counted in highs
("2 of 26 highs" beside "10 of 65 lows") though the engine counts it on the crash
low. Patterns read the same feed for both their row and their case file, so they
agreed with each other but counted over the widened population: Highs after
treating lows over 65 lows while its habit is priced over 41.

**Decision.**

- *The population is the recurrence population.* It is what the engine prices a
  habit on (scenario confidence `n`), what its case file counts and draws, and what
  ADR 202's policy names; the classifiers' own exposure gate is its low line. The
  exposure feed lists, per family, exactly that population: an episode anchor is an
  Occurrence only when it is one of its family's opportunities
  (`explore_exposures._opportunity_identities`), a correction being the pair it
  closes.
- *One association.* Each attributed episode's claim lands on the opportunity the
  engine's evaluation associates it with (`Evaluation.attributed`, its recurrence
  anchor), never on every anchor at the trigger time. The case file reads the same
  association; its own copy (`finding_case_file._association`) goes. An opportunity
  two claims share (a crash low with its own cause and an over-treatment claimed
  from its rebound) carries both in `attributed_levers`, the first as its cause; a
  later claim keeps the minute its consequence landed at
  (`lever_outcome_minutes`), so a clock window judges each lever where its own
  consequence landed, as the case file does (`window_membership.claim_minute`).
- *One row family.* A habit's row counts it once, in its own recurrence family,
  over every claim in `attributed_levers` there. Its count, appearance and band
  are that family's. The cause-outcome table narrows to the pairs that can now be
  printed: each lever with its own family, and each Pattern rate lever with its
  Pattern's family (Correction stacking's share of Lows after correcting highs).
  The event-chart family map goes: every lever's map family was its recurrence
  family, so every habit row carries its coordinate.
- *A claimed Occurrence is fired for its claimant* in the row's band, as its case
  file reads it, wherever the claim came from.
- *Patterns follow.* A Pattern's `n` is its family's feed count, so it is now the
  same population its rate habits are counted over. No Pattern's admission route,
  collapse, action or price changes on any QA case; their `n`, rate, interval and
  readiness count shrink where the feed held near-lows.

**Not changed.** The engine's scenario confidence and its compatibility clamp
(ADR 202): an over-treated low or a correction on active insulin claimed on a
near-low is still priced by the engine, which clamps `n` to at least `k`, but it
sits on no opportunity, so no row, case file or Pattern counts it, and its case
file is withheld as before. On `wearer-habit` the Over-treated low row says 10 of
41 lows where the engine prices 12 of 41; on a store whose every over-treatment
bottoms at a near-low, the habit's Pattern counts 0 of 0 lows and the Queue, which
leaves out a Pattern it has no row for, draws no card for it. ADR 528's card still
reads its count from the case file; the row now prints the same count. No analyzer,
cap, floor, staging predicate, priority or served suggestion changes.

**Consequences.** Every QA case with user corrections loses its first,
unpaired correction from its behavioral rows, `isf-range-hold` and
`pattern-near-tie` lose their near-lows, and four verdict tallies and two Pattern
rosters are re-recorded as literals. Two unreferenced row constants in the QA
catalog go. The findings-projection fixture's hand-built feed drops Carb
undercount's two claims on highs, which the producer can no longer emit, and its
highs reach 250. The UI fixtures regenerate; no Queue row prints a correction-cluster
sentence, so "clusters" leaves the UI allow-list. The two-family Cause scenario of
the count-sentence requirement now serves one sentence, and a new requirement
states the one population.

## ADR 553 — One low line: 70 mg/dL everywhere

**Context.** Harmonic drew two low lines. Episodes anchored a low at a 75 mg/dL
near-low line (`anchor_near_low_mgdl`, #112), so a 72 → 244 rebound was claimed as
an Over-treated low, while the lows every habit and Pattern is counted over stayed
the sub-70 runs (`gate_low_mgdl`). Such a claim sat on no member of its own
population. ADR 202 kept a compatibility clamp for it (`n = max(n, k)` in the
engine, `k = min(k, n)` in the trend), and ADR 550 left the engine pricing it while
the row and case file counted only claims on the population. On the synthetic
`wearer-habit` store the Over-treated low row said 10 of 41 lows while the engine
priced 12 of 41. The new QA case `behavioral-over-treated-near-low` (the
over-treated-low story plus one 72 → 244 dip) priced 3 of 6 at priority 34 beside
a 2 of 6 row, and its case file was withheld as inconsistent. The decision is
"70 everywhere" (Connor, 2026-10-19).

**Decision.**

- *One low line.* A low is a CGM run at or under `gate_low_mgdl` (70), anchored at
  its nadir. The near-low pass and `anchor_near_low_mgdl` go. A dip that stays above
  70 is no low: no anchor, no claim, no population member, no low prompt, and it
  owns no High. Its rebound High is judged on its own.
- *The levers it reached.* Over-treated low was the only lever that could claim a
  near-low, through its 180 mg/dL rebound bar for a nadir above 70. That bar is now
  unreachable (every judged nadir is a low anchor's, at or under 70) and goes, so one
  160 mg/dL bar applies. Highs after treating lows follows its habit. Correction on
  active insulin already required a nadir at or under 70 in its classifier. The
  other levers recur over meals, highs or correction pairs. The event comparison's
  Correction on active insulin "near" projection read a lows Occurrence at 71–75,
  which the lows feed has not served since ADR 550; it goes. Correction stacking's
  near read stays: it reads the CGM after a stack, not a low.
- *k is the members claimed.* The engine prices a habit's `k` as the distinct
  members of its recurrence population its claims sit on, through the evaluation's
  one association (`Evaluation.attributed`). Episodes claiming one member share one
  occurrence, represented by the worst. An episode whose claim sits on no member
  stays in the report but in no pattern. The trend's and the Overview's tally
  (`tally_attributions`) counts the same way. Every claimed member is one of the
  `n`, so `k <= n` holds by construction, and both ADR 202 clamps go. Measured
  before removing them: across every QA case, no claim is unassociated and no two
  claims of one lever share a member. A future unassociated claim cannot break the
  bound: it goes unpriced, and its case file is still withheld by name (ADR 488).
  The Overview clean rate's `min(k, n)` stays. It sums several levers into one
  family, and two of them can claim one low (a crash's own cause and its
  over-treatment), so it is not ADR 202's clamp. Correction stacking's trend clamps
  on its own classifier counts stay too.
- *Lines that are not a low.* Three thresholds keep their values because none
  anchors anything or denominates a habit. Meal over-delivery's suspend outcome
  line (`suspend_near_low_mgdl`, 75) feeds Lows after meals and its carb-ratio
  member. The pre-empted-low printed-low proximity line (75) feeds the
  correction-factor strengthen gate and the carb-ratio analyzer, and is now its own
  field, `preempted_printed_low_mgdl`, because the field it read is gone. The
  override tile's harm line (`user_override_harm_low_mgdl`, 80) is not a lever.
  Moving any of them would move a setting suggestion or a served count. Time below
  range, the Day's lows, low prompts and the settings analyzers' printed lows already
  used the 70 line.
- *The noun.* The population stays "lows". With one line it means one thing, and
  CONTEXT.md now defines a Low.

**Supersedes.** ADR 202's compatibility-clamp column, which recorded clamps
"because actionable near-low rebounds can exist without a sub-70 recurrence
opportunity". It also covers ADR 202's other clamp rationales: each lever's
attributed count is now a subset of its population by construction. It also
supersedes ADR 550's "Not changed" paragraph: no claim sits on a near-low, so the
engine, the row, the case file and the Pattern read one count. The rest of both
records stands.

**Not changed.** No suggestion, cap, support floor, staging predicate, segmentation
rule, gate lookback or rebound horizon.

**Consequences.** On every existing QA case, no count, price, priority, Pattern or
Queue row moves. `pattern-near-tie` and `isf-range-hold` each lose two lever-less
near-low episodes, so `pattern-near-tie`'s evidence episode ids renumber. The new
case prices 2 of 6 at priority 28 (was 3 of 6 at 34), and its row, case file and
price agree. Its literal expectation is the over-treated-low story's own: the dip
changes nothing. The UI fixtures regenerate. `wearer` prices Over-treated low 8 of
33 (was 9), and Highs after treating lows drops 39 → 38 (31 → 30 in the five
fixture stores built on it). `wearer-habit` prices Over-treated low 10 of 41 (was
12), and its Pattern drops 34 → 31. Its Missed / unannounced meal reads 13 of 24
highs (was 12) at 60 (was 58): the High a near-low's rebound used to own is now
judged on its own, as an unbolused rise. Such a High now raises a "did you eat
here?" prompt. The scenario configuration's identity changes (one field gone, one
added), so a Focus retained under the earlier configuration reads
`unsupported_retained_execution`, ADR 462's existing rule for a changed
computation. Unit fixtures whose boluses carried no `seq_num` gain one, as every
stored bolus has (`bolus_events.seq_num` is `NOT NULL`).

## ADR 554 — A maturing Trial shows its data as it forms, and a Trial's identity is not a configuration it never runs

Amends ADR 524. Connor, live on 2026-10-19, on a carb ratio Trial five days in
whose Changes screen showed only its head card and the Previous row: "Can we
work on the PR to get this page useful?", then "I want to be able to see the
data as it's forming."

**What was wrong.** ADR 524 had the live adapter read the active Trial's
comparison whether or not it had matured, and it did. The comparison it read was
unavailable, `unsupported_retained_execution`, for every Trial and Focus on
Connor's store: each retained context saved its scenario configuration with the
seven `meal_bolus_short_*` knobs #503 retired, and the identity check compared
the whole saved configuration to today's for equality. Its policy stamp, its
version and every knob the running code reads all matched. Maturity was never
the gate. The screen draws its modules only from an available comparison, so it
drew the head card alone, and an End would have saved the same unavailable
comparison.

**Decision.**

- **A Trial's identity is its context version and policy stamp.** ADR 462 named
  the scenario configuration "a Focus executes" as part of a retained
  computation's identity. A Trial's comparison runs none of it: the only reads
  of the retained configuration are a Focus's anchors and its habit's
  observations. Comparing a Trial's saved configuration refused it for a change
  it could not feel. #553 (ADR 553) showed the cost a second time on the day it
  merged: it retired the 75 mg/dL near-low anchor line and added
  `preempted_printed_low_mgdl`, so every record saved before it lacked a
  current knob and would have read unsupported again, Connor's Trial included.
  A Trial is now refused only for its version or its policy stamp.
- **A Focus executes its saved configuration, so the configuration stays its
  identity, by the knobs the running code reads.** Every current knob must hold
  its saved value, so a knob changed, added since, or moved refuses it. A saved
  knob the configuration no longer has, as #503 retired seven, can change no
  current computation and is ignored. No rename mapping is kept: #553 split the
  75 line in two, and the half a Focus anchors on moved to the 70 line, a
  change in what a pre-#553 Focus computes, so refusing it is the honest answer
  and a mapping that let the renamed half through would hide it.
- **An after period with no readings yet is served empty, not withheld.** In the
  hours after a change the after period has read nothing; the comparison is
  available with the before period in full and an empty after (no meals, a trace
  of no episodes, each row's after null with `no_readable_outcome`). Only a
  comparison with no readings in either period is unavailable.
- **A maturing Trial shows every module as its data forms.** Meals before and
  after, the trace, In range / Below 70 / Above 180, Mean / GMI / CV and, for a
  basal Trial, Control-IQ against the Pump profile, each over what the after
  period has read so far; an after with nothing read is drawn empty, with no Δ.
  Each glucose module closes with the readings it is read from, before → after
  (`outcomes[key=tir].denominators`), so its current n is on the screen beside
  Days, the meals and the trace legend's episodes.
- **Only the verdict waits for maturity.** The pill stays Maturing and the
  result stays hidden, as before; no Δ is toned while the Trial matures. The
  model reads the served Trial `state` for both, the same field the result
  already read. The engine's own directional states stay as served: a carb
  ratio Trial can meet its eight effective meal runs before fourteen meal days,
  so a judged row while maturing is reachable, and the screen does not claim it
  early.

**Consequences.** A new QA case, `c3-ic-trial`, retains a carb ratio Trial
through a configuration from before #503 and #553 (a retained context is written
once, so the case captures it that way); it backs an API test and a new contract leg
in CI's app job, and fails with Connor's symptom without the fix. The UI
fixtures gain each comparison row's readings and a store for a carb ratio Trial
in its first hours (`wearer-ic-first-hours`), which the stories draw beside the
existing maturing one; "Readings" joins the interface words. No synthetic store
yet serves a judged row while a Trial matures, so the untoned Δ is asserted on
the maturing stores and the contract case, not on a judged row.

## ADR 557 — An unreconciled admission names the change it admitted, and no write leaves a current frontier behind

**Context.** Two snapshots of the operator's store showed the follow-up frontier
one input revision behind, and in that state the admission named no active
change: Changes drew "No active change" over a live Trial, listed it under
Previous and dropped End. A fresh snapshot taken 30 minutes after a fetch was
current. Nothing but the fetch had written to the store, and the container log
since its last restart shows no API write. The lag is inside the fetch itself.
It commits window by window and reconciles once after the pull, then records its
status and reconciles again. On the operator's host a fetch wrote for about two
and a half minutes. The frontier is exactly one revision behind twice in that
span: after the settings capture, while the first window downloads, and after
the status write, until the fetch loop's own reconcile (0.75 s on a Mac, measured
on an in-memory copy of a read-only snapshot). A read in that span got the false
answer, and the browser keeps answers it read (#522). Three writes also advance
the input revision and never reconcile, so each left the frontier behind until
the next fetch: a credentials save, a pattern sign-off, and a late conclusion,
whose lifecycle skips reconciliation by design.

**Decision.**

1. *An unreconciled admission names the change the frontier admitted.* The
   verdict stays unavailable for reconciliation and grants nothing, with no End
   and no Focus pin. Its kind, identity, maturity and ending are the frontier's
   committed change, read as `follow_up_admission` reads it when current. The
   app reads only those fields and `can_finish_trial`, so Changes draws the last
   admitted Trial without End and needs no change. Its lock's stale state
   (Unavailable and Retry over the last answers) stays the one for a failed read.
   The watched change behind the outcomes trend and the guidance reads the same
   verdict, so it keeps the Trial too. This is the AGENTS.md rule that stale
   beats falsely current, applied in the owner rather than in a reader.
2. *A credentials save and a pattern sign-off reconcile after they commit*,
   through the same completion as carb, prompt and preference writes. ADR 538
   settled that every committed write advances the input revision, so these
   two stay writes that advance it. They now finish the way the other local
   writes do.
3. *A late conclusion carries a frontier that was current forward.* It still
   never reconciles: a conclusion can change which record of a legacy per-slot
   basal block is served (#510), and reconciling then could record another
   watch. Nothing a reconcile reads changes, so a frontier current when the
   conclusion's transaction began stays current. One already behind is left
   for the next reconcile.

**Rejected.** Making the fetch atomic, or reconciling after every window: either
holds the one writer for the whole pull, and the reconcile's own note records
a held write lock timing out every concurrent open. Stopping the
fetch status, credentials and sign-offs from advancing the input revision would
re-open ADR 538's decision for a smaller gain, since a fetch's own windows still
leave the frontier behind. A visible stale mark on Changes for this state would
change a locked screen, which needs the lock's own revision.

**Dosing.** No analyzer, staging predicate, cap, floor or served suggestion
changes. The admission grants nothing it did not grant before. Guidance still
reads unavailable while the frontier is behind.

**Consequences.** Four API tests: the unreconciled admission naming its Trial,
and the credentials save, the sign-off and the late conclusion each leaving the
admission available. All four failed first with the operator's symptom.

## ADR 558 — A change is coloured by its direction, never by the verdict

Amends ADR 554. Connor, 2026-10-19, of a maturing Trial whose every Δ was grey
while In range rose seven points: "Color shows direction. We can have vaguely
good or bad changes that should indicate that they're good or bad via color
plus arrow regardless of whether the change itself should be kept or not.
those are separate".

**Decision.**

- **Colour is the direction's.** Every Δ the app draws is green where its value
  moved the good way for its metric, red the bad way, and neutral where it
  prints unchanged or neither way is better: Changes' modules maturing or
  matured, a Focus's habit share and outcomes, the Overview's metrics against
  the previous period, and a Queue row's Peak or Nadir against Typical.
- **One table of good ways, in the library.** In range up; Below 70, Above 180,
  Mean, GMI and CV down; Peak down; Nadir up; a Focus's habit share down, as the
  engine assesses that rate; none for a basal Trial's Control-IQ rows. It lives
  in `frontend/ui/direction.ts`, beside the one function that builds every Δ,
  which the Changes, Overview and Queue models all call. The engine serves no
  direction per metric, so no served shape changes; this is a presentation
  rule, not a second verdict.
- **The verdict stays the pill's.** Better / Worse / Unclear is still the
  engine's served result, hidden until a Trial matures (ADR 554's "Only the
  verdict waits" stands for the pill). ADR 554's untoned Δ while maturing is
  withdrawn, and so is the earlier rule that a row takes colour only where the
  engine judged it.

**Consequences.** The models no longer read a row's `assessment.state` for
colour. The stories check each Δ's colour against the lock's own list of good
ways, and the contract test asserts each trial case's colours as literals.
