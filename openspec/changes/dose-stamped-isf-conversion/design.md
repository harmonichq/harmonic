## ADR 563 — Every glucose-to-insulin conversion reads the meal's dose-stamped ISF

**Context.** `settings.effective_isf(isf_rows, snaps)` chose one ISF for every
conversion of a glucose miss into insulin units. It returned the ISF analyzer's
fasting estimate when there was one and the median of the latest snapshot's
active ISF schedule otherwise, citing an "ADR 0001" that no longer exists.
`analyze()` passed it to the carb-ratio segment rows and blocks, and two private
wrappers (`scenario.engine._effective_isf`, `outcomes._effective_isf`) re-ran the
ISF analyzer over their own windows to feed it. Through the scenario wrapper it
reached the scenario engine, the event comparison, the finding case file, the
model view and the exposures explorer. The outcomes trend and the follow-up
comparison read the programmed median through their own copy
(`outcomes_trend._profile_settings`, #131), and a follow-up comparison retains
that median in its durable context (version `386:1`).

Every value reaches exactly three conversions, all anchored on a meal bolus:
the carb-ratio ledger's per-meal balance (`ic.meal_burdens`), its chained meal
runs, and the carb-undercount classifier. Every other reader only passes the
number through.

An investigation for #563 found no passive method that identifies ISF under
Control-IQ, and found the pooled fasting estimate leaning toward stronger
corrections. The carb-ratio ledger adds `(outcome − start) / ISF` to the insulin
that covered a meal, so a too-strong ISF moves every meal's balance and the
carb-ratio estimate with it. The ledger also treats a falsy ISF as "no ISF": the
chart-builder fixture's flat history yields an estimate of `-0.0`, so every one
of its meals was read with no glucose outcome.

The issue asks for "the programmed correction factor in force over its window".
On 2026-10-19 the operator chose the per-dose reading of "in force": the ISF the
pump stamped on each bolus (`BolusEvent.isf`, a **Dose-stamped setting**), which
is what the pump's own calculator used for that meal, under whichever profile
and segment was active.

A read-only local snapshot of the operator's own store (counts only) holds a
10-segment active ISF schedule. 192 of its 1362 meal boluses carry no stamp; 186
of those predate the first settings snapshot, and the 6 in the latest 90 days
each have a snapshot as of their time.

**Decision.**

1. A meal is converted with the ISF stamped on its bolus. A chained run, or a
   meal the classifier groups from several boluses, is converted with its first
   member's, the bolus whose start glucose anchors the travel.
2. A bolus with no stamp (the pump's `0` sentinel for phone and Remote doses is
   stored as none; rows ingested before #159 have none) is converted with the
   programmed ISF segment in force at its time of day, in the latest settings
   snapshot captured at or before it. Never a schedule median, never the
   analyzer's estimate.
3. With no stamp and no snapshot as of that time, the meal is not converted. The
   ledger reads its run as unconfirmed, through the existing correction-only
   fallback, and carb undercount leaves the meal unjudged. Settings before the
   first snapshot are unknown, and an assumed value would be falsely current.
   A stamp is durable recorded data, so a non-positive stamp reads as no stamp.
4. One module owns the choice: `settings.IsfSource`, with `at(bolus)` returning
   the ISF or none. Two adapters: `IsfSource.from_snapshots(snaps)` (rules 1–3)
   and `IsfSource.fixed(value)`, for a retained comparison. Every conversion
   takes a source; none takes a bare number. `effective_isf` and both private
   wrappers are deleted with their ISF analyzer runs.
5. A retained comparison keeps executing with what it captured (ADR 462, ADR
   554). A context of version `386:1` converts with `IsfSource.fixed` of its
   captured median, so its result does not move and it does not read
   `unsupported_retained_execution`. A context captured after slice 2 (version
   `563:1`) records that it converts with the dose-stamped ISF and carries no
   value; it converts with `IsfSource.from_snapshots` over the snapshots before
   its cutoff, as its carb-ratio and settings reads already are.
6. The ISF analyzer still runs for its own card, Queue row, staging and settling
   gate. Its output feeds no conversion. #564 removes it.
7. The work lands in two slices: slice 1 the carb-ratio ledger and its callers,
   slice 2 the scenario engine and its readers. Slice 1 reaches retained Trial
   comparisons only through `IsfSource.fixed` of their captured value, so no
   comparison moves in it. Between the slices, carb undercount still converts
   with the estimate-first value.

**Consequences.** A carb-ratio, carb-undercount or attribution result no longer
moves with the fasting estimate, and a zero estimate no longer switches off the
ledger's glucose term. On a timed schedule each meal is converted with the
segment it was eaten in, which a single median could not do. No staging
predicate changes; a verdict moves only because its ISF input moved.

The residual gap from "in force" is per-fetch. An unstamped bolus soon after a
profile edit converts with the previous snapshot's segment until the next capture
lands, and a pre-snapshot unstamped meal is not converted.

The result cache needs no new rule. Stamps are bolus rows and snapshots are
settings captures, both recorded data, and no builder newly reads follow-up
state, so `_RECORDED_DATA_RESULTS` and the recorded-data revision keys stand.

Every committed synthetic store programs a flat ISF. The QA cases and the UI
wearer (`scripts/ui_patient.py`) stamp their boluses with it, so there the
dose-stamped value equals the programmed median. The chart-builder,
findings-projection and missed-meal generators write unstamped boluses, so their
meals take rules 2 and 3; the chart-builder store's one snapshot is captured a
day after it starts, so its first day's meals are not converted. The build
re-measures those three. Measured with a median-only stand-in on the base
commit: two generated fixtures move. `frontend/__fixtures__/analysis.json`'s meals gain their glucose outcome
(the zero-estimate defect). In `frontend/ui/__fixtures__/ui-fixtures.json` the
synthetic wearer's habit attribution moves and two Day findings lists shrink.
Neither moves an `asserts_move`. The QA catalog, the QA database, the other two
generated fixtures and every live contract case are unchanged. Three Day story
plays assume the day with the most logged carbs names three habits; it now
names two, and other logged-carb days in the same history name three or four, so
the generator picks the `with_carbs` day by the habits its findings name.

Flat stores cannot tell the per-meal rule from a median, so new QA cases carry a
two-segment schedule, an ISF changed mid-window and unstamped meals, with
literal expectations.

**Staging movement.** On every committed synthetic store, no carb-ratio staging
verdict moves. Slice 1 runs the analysis before and after its change on the
operator's read-only snapshot and adds here only the count of carb-ratio blocks
and segments whose staging verdict or direction changed, by direction, with no
values.
