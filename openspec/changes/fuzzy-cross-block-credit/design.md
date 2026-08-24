# Design — fuzzy cross-block credit (#117)

## ADR 117 — Fuzzy cross-block credit is admitted, and ships as the block estimator

**Status:** accepted, 2026-08-23. Applies ADR 23's ladder and ADR 109's pins;
amends neither.

### The candidate that was pinned

ADR 23 named the candidate by one example phrase — a logarithmic ownership curve
over a run's time in each block. Prototyping eliminated that whole family before
it reached a bar. Three crediting schemes were built against chained truth sets
with known per-block ratios:

- **Carb-share weighting** — split each chained run's own ratio pro rata and
  pool the pieces. Confidently wrong: biased toward the starved block's
  neighbour, with an interval that covered the truth almost never. This is the
  identity argument in `analyze_ic_blocks` restated as a measurement, and it is
  why per-run splitting is not the proposal.
- **Majority-with-threshold** — credit a chained run wholly to the block owning
  most of its carbs, above a share threshold. Honest but useless for the case
  that motivated the work: it only ever helps on lopsided chains, and the
  starved pool stayed starved.
- **Inverse-ratio regression** — fit all runs jointly, weighting by carbs, and
  read each block's ratio off the fitted mixture. Recovered truth without bias,
  at roughly half the incumbent's error, with interval coverage matching its
  nominal confidence.

The third is what "fuzzy cross-block credit" means from here, and it is the
design ADR 23's permanent-rejection clause attaches to. A materially different
crediting scheme is a new candidate, not a second attempt at this one.

The information does not come from splitting a run. It comes from contrasting
runs that own *different* shares of the same two blocks: two blocks' ratios are
two unknowns, and enough chained runs at varied shares determine both.

### Floor semantics: fractional ownership counts

A chained run counts toward `_MIN_SUPPORTED_BLOCK_RUNS = 8` by the carb share it
owns in that block. The floor is met when whole runs plus fractional ownership
sum to eight.

Counting lone runs only would defeat the ticket — the starved block would stay
starved no matter how much chained evidence accrued. Counting any run that
touches a block would let eight barely-touching runs unlock a move on almost no
evidence. Ownership-weighted counting is the honest middle, and it is what
actually lifts the starved block off its floor.

`IcBlock.n_runs` keeps carrying the floored integer effective count, so every
existing reader keeps its meaning. The whole/fractional split is stamped beside
it as additive eligibility evidence. The visible consequence — a block built
only of chained runs can now present as measurable — is accepted, and is the
point.

### Both bars passed

- **Entry bar (synthetic ground truth).** The candidate recovered every gated
  truth set within ADR 109's tolerance, including the chained cross-block set
  the incumbent is not expected to recover, and stayed clean on both placebos
  non-vacuously: each placebo block reached a scoreable state, excluded no
  programmed value, and asserted no move. No placebo finding fired, so ADR 23's
  permanent-rejection clause was never reached.
- **Real-data bar (stable-era replay).** Run read-only against a local snapshot
  on a floor-passing stretch the operator named: **pass** — converged no later,
  no less precisely, and off strictly more meals than the incumbent. The
  incumbent's self-run on the same window agreed with itself, so the harness was
  not passing vacuously. Per ADR 23 the morning block has no ledger reference
  and is validated by the synthetic bar alone. No number, count, or window date
  from that run is recorded anywhere.

### What ships, and what stays

The candidate becomes the engine's block estimator: `analyze` defaults to it,
and the browser fixtures are regenerated from it, so no committed artifact
depicts an engine the app no longer runs.

`analyzers.ic.analyze_ic_blocks` stays. It is the admission ladder's incumbent
reference — the thing a future candidate's replay is judged against — and the
calibration leg that proves a bar is honest. It is reachable from the harnesses
only; nothing on the serving path calls it.

Nothing about the assertion rule moves. A block still stages a move only through
`ic_asserts_move`, still needs eight runs of support, and the frontend still
re-derives no floor, threshold, or direction of its own.
