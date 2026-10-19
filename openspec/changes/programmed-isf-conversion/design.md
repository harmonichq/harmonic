## ADR 563 — Every glucose-to-insulin conversion reads the programmed ISF

**Context.** `settings.effective_isf(isf_rows, snaps)` chose one ISF for every
conversion of a glucose miss into insulin units. It returned the ISF analyzer's
fasting estimate when there was one and the median of the latest snapshot's
active ISF schedule otherwise, citing an "ADR 0001" that no longer exists.
`analyze()` passed it to the carb-ratio segment rows and blocks, and two private
wrappers (`scenario.engine._effective_isf`, `outcomes._effective_isf`) re-ran the
ISF analyzer over their own windows to feed it. Through the scenario wrapper it
reached the scenario engine, the event comparison, the finding case file, the
model view and the exposures explorer. The outcomes trend and the follow-up
comparison did not use it: since #131 they read the programmed median directly,
through a second copy of that median in `outcomes_trend._profile_settings`.

An investigation for #563 found no passive method that identifies ISF under
Control-IQ, and found the pooled fasting estimate leaning toward stronger
corrections. The carb-ratio ledger adds `(outcome − start) / ISF` to the insulin
that covered a meal, so a too-strong ISF moves every meal's balance and the
carb-ratio estimate with it.

A second defect sat in the same read. The ledger treats a falsy ISF as "no ISF"
and drops the glucose-travel term. The chart-builder fixture's flat synthetic
history yields an estimate of `-0.0`, so every one of its meals was read with no
glucose outcome.

**Decision.**

1. `settings.programmed_isf(snaps)` is the one programmed-ISF read: the median
   of the latest snapshot's active ISF schedule, or `None` without one. It takes
   no estimate. `effective_isf` is deleted.
2. Every glucose-to-insulin conversion reads it. `analyze()` passes it to both
   carb-ratio calls. The two private wrappers are deleted with their ISF
   analyzer runs, and their callers read `settings.programmed_isf` with the
   snapshots they already hold. `outcomes_trend._profile_settings` reads it
   instead of its own median, so the programmed-ISF fact has one implementation.
3. "In force" keeps today's meaning: the latest snapshot the caller passes,
   which is the store's current profile, also for a historical window. Which
   snapshot applies is unchanged by this decision.
4. One value per window, as before. A per-segment or dose-stamped conversion
   would change the carb-ratio ledger's interface and every consumer of the
   scenario engine, and is not this decision.
5. The ISF analyzer still runs for its own card, Queue row, staging and settling
   gate. Its output feeds no conversion. #564 removes it.

**Consequences.** A carb-ratio, carb-undercount or attribution result no longer
moves with the fasting estimate, and a zero estimate no longer switches off the
ledger's glucose term. No staging predicate changes; a verdict moves only
because its ISF input moved.

The result cache needs no new rule. Every builder that read the estimate read
recorded data (the streams the ISF analyzer reads); the programmed read is a
settings capture, which is also recorded data. No builder newly reads follow-up
state, so `_RECORDED_DATA_RESULTS` and the recorded-data revision keys stand.

Two generated fixtures move, and nothing else committed does
(measured with the change applied on the base commit):

- `frontend/__fixtures__/analysis.json`: the chart-builder history's meals gain
  their glucose outcome (the zero-estimate defect above). No `asserts_move`
  moves.
- `frontend/ui/__fixtures__/ui-fixtures.json`: the synthetic wearer's habit
  attribution moves (carb undercount and late bolus counts, the "Highs after
  meals" count, the Queue order, one guidance priority) and two Day findings
  lists shrink. No `asserts_move` moves.

The QA catalog's expectations, the QA database and the other two generated
fixtures are unchanged, and every live contract case passes unchanged.

Three story plays fail on the regenerated component fixtures. The Day screen's
two Findings stories and the DayChart's logged-carbs story assume that the day
with the most logged carbs also names at least three habits, carb undercount
among them. With the programmed ISF that day names two. Other logged-carb days
in the same history still name three or four, so the generator picks the
`with_carbs` day by the habits its findings name, and no assertion weakens.

**Staging movement.** On every committed synthetic store, no carb-ratio staging
verdict moves. The build also runs the analysis before and after the change on
a read-only local snapshot of the operator's own store and adds here only the
count of carb-ratio blocks and segments whose staging verdict changed, by
direction, with no values.
