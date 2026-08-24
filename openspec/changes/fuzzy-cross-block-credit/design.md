# Design — fuzzy cross-block credit (#117)

## ADR 117 — Pin inverse-ratio regression as the cross-block candidate

**Status:** accepted, 2026-08-23. Applies ADR 23's ladder and ADR 109's pins;
amends neither.

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

The candidate passed the entry bar and real-data bar. It therefore becomes the
engine's block estimator: `analyze` defaults to it, and the browser fixtures are
regenerated from it, so no committed artifact depicts an engine the app no longer
runs. Bar outcomes: **pass**, **pass**.

`analyzers.ic.analyze_ic_blocks` stays as the admission ladder's incumbent
reference and calibration baseline. Nothing on the serving path calls it.

## ADR 117 — Count fractional ownership and floor n_runs for display

**Status:** accepted, 2026-08-23. Applies ADR 518's I:C support floor; changes
neither the floor nor `ic_asserts_move`.

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

Nothing about the assertion rule moves. A block still stages a move only through
`ic_asserts_move`, still needs eight runs of support, and the frontend still
re-derives no floor, threshold, or direction of its own.

## ADR 117 — Read replay meals as estimator-consumed fit_meals

**Status:** accepted, 2026-08-23. Interprets ADR 23's replay clause; amends none
of ADR 109's admission pins.

ADR 23 requires a candidate replay to converge off strictly more meals than the
incumbent. `IcBlock.n_meals` is coverage: it counts meals from every run touching
the block, whether or not the estimator consumes that run. Comparing it cannot
show that a cross-block estimator used more evidence.

The replay therefore reads “meals” as `evidence["eligibility"]["fit_meals"]`:
member meals in the runs the numeric estimate actually consumed. Both estimators
stamp that field, and the existing replay report meal fields carry the same
reading. The real-data bar outcome under this reading was **pass**. The incumbent
self-run also passed, so the harness was not vacuous. Per ADR 23, the morning
block has no ledger reference and remains synthetic-bar-only. No number, count,
block label, or window date from the local snapshot is recorded.

## ADR 117 — Gate chained truth at the caller for cross-block candidates

**Status:** accepted, 2026-08-23. Applies ADR 109's fixed admission inventory;
moves none of its tolerances or placebo rules.

The chained cross-block truth set gates estimators that claim cross-block credit.
The committed runner passes it with `gated=True` for the candidate and
`gated=False` for the incumbent. The truth set remains visible but exploratory
for the incumbent, whose stated estimand excludes those ledgers. Existing gated
known-ratio sets and both placebos still gate every estimator.

This distinction belongs at the harness caller, not inside the truth set or the
estimator. One synthetic inventory can therefore calibrate the incumbent and
judge a cross-block candidate without changing ADR 109's shared bar.
