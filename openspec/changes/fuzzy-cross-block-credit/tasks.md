# Tasks — fuzzy cross-block credit (#117)

## 1. The candidate

- [x] Extract the block-stamping machinery in `analyzers/ic.py` into a shared
      path both estimators run through, so a candidate cannot fork the safety
      seam; incumbent behavior held by the existing suite.
- [x] Add the cross-block estimator: one carb-weighted regression of inverse
      ratios on per-block carb share across all runs, lone and chained, with each
      block's ratio read off the fitted mixture and its interval bootstrapped.
- [x] Count a chained run toward the eight-run floor by its carb-share ownership;
      stamp the whole/fractional split as additive eligibility evidence and leave
      `n_runs` carrying the floored effective count.
- [x] Stamp `fit_meals` — the meals the numeric estimate actually consumed — from
      both estimators, so the replay's "strictly more meals" clause compares
      eligibility evidence rather than coverage.
- [x] Add the chained-run truth set: known per-block ratios, ledgers spread
      across varied carb shares, gating for cross-block candidates and
      exploratory for the incumbent.

## 2. The bars

- [x] Entry bar: recover every gated truth set within tolerance, including the
      chained set, and stay non-vacuously clean on both placebos.
- [x] Real-data bar: stable-era replay read-only against a local snapshot on a
      floor-passing stretch, with the incumbent self-run as calibration. Record
      one verdict phrase; no number, count, or date leaves the machine.

## 3. Ship it

- [x] Default `analyze` to the shipped estimator; keep the whole-run estimator as
      the ladder's incumbent reference, reachable from the harnesses only.
- [x] Pin the shipped path by a test through `analyze`: chained evidence reaches
      the floor and a numeric state where the incumbent leaves the block short.
- [x] Regenerate the block and findings-projection browser fixtures from the
      shipped estimator, and point their generators at it so the drift checks
      hold them there.
- [x] Record the verdict and the design pins as ADR 117.
- [x] Run the fast gate: backend suite, frontend suite, the eight drift checks,
      and the decision-record, product-name, and publishable-tree guards.
