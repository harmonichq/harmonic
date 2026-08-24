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
