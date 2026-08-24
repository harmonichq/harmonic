# Scope ledger — I:C trial acceptance criteria (#24)

Ticket #24 asked whether the reworked I:C engine changes how much data a 14-day
trial yields. It does, and the re-assessment turned into a design question: what
a Trial on a carb-ratio change should accept as "ready to judge".

## Decisions

- **Trials carry per-parameter acceptance criteria; an I:C trial's criterion is
  meal captures, not data-days.** Operator decision, 2026-08-24.
  Why: the Trial's day clock and the engine's evidence bar are different
  quantities, and on the current era they disagreed in the unsafe direction (the
  Trial reported ready while neither block could assert). Disposition: → ADR.

- **The bar counts the estimator's credited total, not whole meals in the block.**
  Operator decision (Q1), 2026-08-24. Why: it is the same quantity the
  recommendation is already gated on, so a trial can never report ready while the
  recommendation stays withheld. Disposition: → ADR.

- **Each changed block matures and is judged on its own.** Operator decision (Q2),
  2026-08-24. Why: on the current era the busy block had a real answer at day 15
  while the quiet block is roughly two months out; one shared verdict hides both.
  Disposition: → ADR.
- **A whole-profile switch runs the meal bar for its ratio part.** Operator
  decision (Q3), 2026-08-24. Why: the live case classified as a profile switch and
  matured on glucose days, reporting ready while neither block could assert.
  Disposition: → ADR.

- **The foregrounded window is a fixed stretch, not the evidence bar.** Operator
  decision (Q4), 2026-08-24: keep the window fixed and short (30 days), let
  evidence keep accruing quietly after it, and accept that a block which never
  gathered enough simply expires without a verdict. Why: tying the window to the
  bar would lock Focus out for months on a quiet block. Disposition: → ADR.
- **No minimum elapsed time; the capture count alone decides.** Operator decision
  (Q5), 2026-08-24. Why: the bar is already an evidence count. Disposition: → ADR.
- **Carb ratio only; basal and correction factor keep their day count.** Operator
  decision (Q6), 2026-08-24, with all-parameters noted as a possible later move.
  Why: a basal change accrues usable nights at about one a day, so 14 days already
  clears its eight-night bar. Disposition: → ADR, plus → issue for the later move.
- **The one-Focus / one-Trial model needs a rethink** (engine, experience and
  visualization together). Operator note, 2026-08-24: out of scope here, taken as a
  separate effort. Disposition: → issue.

- **An expired window states how far the block got.** Operator decision (Q7),
  2026-08-24: name the progress reached and that the change is no longer watched.
  Why: on a quiet block this is the normal ending, and a bare disappearance reads
  as a defect. Disposition: → ADR.
- **An uncomputable count reports not ready, with a reason.** Operator decision
  (Q8), 2026-08-24. Why: reporting ready without evidence is the failure this
  ticket exists to close. Disposition: → ADR.

### Risk contract

- **Must prevent:** reporting a carb-ratio change ready to judge while the block's
  evidence bar is unmet; any widening of what the app may recommend. Both are the
  silent-incorrect-success default, and this ticket exists because the first one
  was observed live.
- **Must recover:** nothing automatically.
- **Accepted failure:** a block that never reaches the bar inside the window
  expires with no verdict, stating the progress it reached (Q7). A quiet block is
  expected to do this routinely.
- **Unsupported:** eras with no stamped regime identity (before settings history
  begins) yield no trial evidence; parameters other than carb ratio keep their day
  count (Q6).
- **Evidence owed:** the readiness verdict is read from the engine's stamped
  eligibility rather than re-derived; tests through the public interface at counts
  below, at, and above the bar; the dock and the Verify roster report the same
  verdict for the same change; an absent or uncomputable count reports not ready.

Why: advisory dosing guidance, one operator, and a live observed case of ready
appearing without evidence. Disposition: → ADR, copied into the work order.

## Grounding (read-only snapshot, 2026-08-24)

Measured through the shipped path (`analyze` with the fuzzy estimator, the
engine's own stamped eligibility), replaying the current era's ratio change at
successive cutoffs:

| Day after change | Evening credited runs | Evening whole runs | Morning credited | Trial says |
|---|---|---|---|---|
| 7  | 3.00 | 3 | 1.00 | maturing |
| 10 | 3.78 | 3 | 1.22 | maturing |
| 14 | 7.69 | 7 | 1.31 | **complete** |
| 15 | 8.56 | 8 | 1.44 | complete |
| 19 | 12.81 | 12 | 2.19 | complete |

- The assert bar is eight runs (`safety._MIN_SUPPORTED_BLOCK_RUNS`), read as the
  estimator's `effective_run_count`.
- At the 14-day mark the Trial reported ready to judge while the busiest block
  was still short of the floor and the quieter block was at 1.31.
- Stamped settings history begins 2026-07-04, so the current era is the only
  cleanly measurable one; earlier eras admit no runs for lack of regime identity.
- The quieter block extrapolates to roughly two months to reach the same bar, so
  one global window cannot serve both blocks.
- Three different clocks can gate the same ratio change today: glucose data-days
  (whole-profile switch), any-meal days (`watched_change.detect_trial`), and
  in-block meal days (`watched_change.review_trials`). None counts the
  I:C-identifiable meals closing a ledger in the current dose-stamped regime,
  which is what the engine's bar actually requires.
- The current era's change classified as a whole-profile switch (it moved a basal
  rate and a carb ratio together), so it matured on glucose days, the weakest
  available proxy for meal evidence.

### Established facts (from the shipped estimator)

- **Blocks are runs of equal programmed ratio, not profile segments.** Consecutive
  segments with equal values merge (`ic.ic_blocks_from_segments`), so a span where
  only basal changes remains one I:C block. Distinct recommendations for two parts
  of the day require distinct programmed ratios; no trial rule unlocks them.
- **Credit follows the dose, never digestion.** Each member meal is assigned to the
  block containing its own timestamp and weighted by its carbs as a share of the
  run's covered carbs (`ic_regression._regression_block_fits`). A block a meal
  merely digests through earns nothing, and an unbolused hour earns nothing
  anywhere.

- **Watching a change is exclusive, and the lock rides the same clock as maturity.**
  While a Trial is live, pinning a Focus is rejected (409) and any active Focus is
  *dropped*, persisted, not paused (`api` pin endpoint, `active_watched_change`).
  "Live" means within the watch horizon, not "still maturing", so a horizon that
  followed a slow block's meal bar would lock Focus out for that whole stretch.
  Consequence: maturity and exclusivity have to be separated, or a quiet block
  freezes all other work for months.

## Open questions
- Whether a multi-block ratio change matures per block or as one verdict.
- Whether a whole-profile switch that moves the ratio runs the meal bar for its
  ratio part.
- Risk contract, once the shape is bounded.

## Spawned tasks

- None yet.
