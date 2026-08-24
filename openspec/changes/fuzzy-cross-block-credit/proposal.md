# Fuzzy cross-block credit (#117)

## Why

A meal run whose member meals were dosed in more than one carb-ratio block is
information-free to the shipped engine: it enters no block's pool, on the
identity argument that splitting one run's ratio pro rata just re-derives that
same ratio. The argument is sound for per-run splitting, and it is why the
morning block can watch meal after meal go by without its evidence pool ever
filling — the breakfast that straddles the boundary is the common case, not the
exception.

ADR 23 named fuzzy cross-block credit as the first candidate to answer that, and
ADR 109 built the two bars a candidate must clear before it may be trusted. This
is that candidate, run through those bars.

## What changes

- A cross-block estimator fits every run at once — lone and chained together —
  as one weighted regression of inverse ratios on each run's carb share per
  block, and reads each block's ratio off the fitted mixture. Per-run pro-rata
  credit is not what is being proposed and would carry no information; the
  information comes from contrasting runs at *different* shares.
- A chained run counts toward the eight-run floor by the carb share it owns in a
  block. The floor is met when whole runs and fractional ownership sum to eight,
  so a barely-touching run cannot unlock a block on its own and a block built
  only of chained evidence can still become measurable.
- A new chained-run truth set, with per-block ratios known in advance and
  ledgers spread across varied carb shares, gates cross-block candidates. It
  stays exploratory for the incumbent, which is not expected to recover it.
- The estimator ships as the engine's block estimator once both bars pass. The
  whole-run estimator stays in the tree as the admission ladder's incumbent
  reference, which every future candidate is replayed against.
- The browser fixtures are regenerated from the shipped estimator, which is what
  the drift checks then hold them to.

## Impact

- The eight-run floor, the single eligibility predicate `ic_asserts_move`, and
  the withhold-only posture are all unchanged. What changes is how much evidence
  a block is allowed to count, not what it takes to assert a move.
- A block whose evidence is entirely chained can now reach a numeric state and
  become assertable. That is the intended consequence, and it is what the
  starved morning block was waiting for.
- No UI change, no new write path, no cache-invalidation surface, no new CI step
  beyond the existing drift checks.

The admission verdict and the design pins are recorded in `design.md` as
ADR 117.
