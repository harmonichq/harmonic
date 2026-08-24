# Design — ic-trial-acceptance

## ADR 24 — An I:C trial is ready to judge on meal captures, not elapsed days

**Ruling.** A Trial watching a carb-ratio change is ready to judge when the changed
block's own evidence reaches the engine's bar. The verdict is the analyzer's
already-stamped support flag (`evidence['eligibility']['runs_floor_met']`), read as
published; the stamped `effective_run_count` and `runs_floor` beside it are for
showing progress, not for re-deciding the bar. A Trial never re-applies
`safety._MIN_SUPPORTED_BLOCK_RUNS` itself. Readiness is no longer decided by
`TRIAL_WINDOW_DAYS` of target-metric data-days. Each changed block
matures and is judged on its own. A whole-profile switch that moves a carb ratio
runs this bar for its ratio part rather than maturing on glucose data-days. The
foregrounded window stays a fixed stretch (30 days) that is deliberately *not* the
evidence bar: when it ends with the bar unmet, the change stops being watched and
states the progress it reached. No minimum elapsed time applies; the capture count
alone decides. Basal, correction factor and target keep their existing day count.

**Context.** #24 asked whether the reworked engine changed how much data a 14-day
trial yields. It did, and measuring it exposed a live defect rather than a tuning
question. Replaying the current era through the shipped path at successive cutoffs:
at the 14-day mark the Trial reported ready to judge while the busiest block held
7.69 credited runs against a bar of 8, and the quieter block held 1.31. The busy
block crossed the bar around day 15; the quiet block reached 2.19 by day 19 and
extrapolates to roughly two months. The change under measurement classified as a
whole-profile switch, so it matured on glucose days, the weakest available proxy for
meal evidence. Three different clocks could gate the same ratio change — glucose
data-days for a profile switch, any-meal days in `detect_trial`, in-block meal days
in `review_trials` — and none counted the I:C-identifiable meals the engine's bar
actually requires. Stamped settings history begins mid-2026, so the current era is
the only cleanly measurable one; earlier eras admit no runs for want of regime
identity.

**Consequences.**
- Readiness is read from the engine's stamped eligibility, never re-derived. This is
  the same one-predicate discipline ADR 20 fixed for assertion, applied to the Trial:
  a Trial that compared the count against the floor itself would be the second
  predicate again, even though it would agree with the first one today.
- Ready to judge is not the same as recommending. The support flag is one of the
  five conditions `ic.ic_asserts_move` requires; a block can be ready to judge while
  the recommendation stays withheld for want of a band excluding the programmed
  value, regime-bracket support, or a real move. A future build that treats
  `asserts_move` as the readiness signal has read this record backwards.
- A quiet block routinely expires without a verdict. That is the accepted outcome,
  not a failure to fix: evidence keeps accruing through the ordinary reading, and a
  recommendation surfaces later if one is warranted.
- The window and the bar are deliberately separate quantities. Tying the watch
  horizon to the bar would extend the Trial-XOR-Focus lock for as long as a quiet
  block took, freezing all other work for months. The one-Focus / one-Trial model
  itself needs revisiting; that is a separate effort, not this record.
- An absent or uncomputable count reports not ready, with a reason. Reporting ready
  without evidence is the exact failure this record closes.
- Block identity follows the programmed ratio, not the profile segment: consecutive
  segments with equal ratios merge, so distinct recommendations for two parts of the
  day require distinct programmed ratios. No trial rule unlocks them.
- Credit follows the dose, never digestion: a meal is credited to the block holding
  its own timestamp, weighted by its carbs as a share of the run. A block a meal
  merely digests through earns nothing.
- Withhold-only in the sense that matters: nothing here widens what the app may
  recommend, because assertion authority is untouched. Readiness timing is not
  withhold-only and is not claimed to be — with no minimum elapsed time, a block
  that reaches the bar quickly reports ready sooner than today's fourteen data-days
  would have allowed. That is the intended effect of tying readiness to evidence.

**Not built here.** This record is locked ahead of its implementation, deliberately.
The per-block judging rulings sit inside the decision space of #136 (Verify's
per-lever attribution and outcome uncertainty), the surfaces that would report them
are covered by #135's evidence-canvas lock, and #133 blocks Verify build handoffs on
the #19 rework. #136 honours this record rather than reopening it. Building before
those settle would rebuild a surface about to be re-locked.

Decision: harmonichq/harmonic#24 (map #19), 2026-08-24. Evidence: read-only snapshot
replay through `analyze` with the shipped fuzzy estimator, cutoffs across the current
era; scope ledger `docs/scope/ic-trial-acceptance.md`.
