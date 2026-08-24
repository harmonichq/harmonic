# Scope ledger — fuzzy cross-block credit (#117)

First candidate I:C estimator through the admission ladder (#109 / PR #116).
Routed to interview mode 2026-08-23: the candidate exists as one example phrase
in ADR 23 ("logarithmic ownership curve"); its estimand, floor semantics, gating
sets, and ship-vs-stop boundary are undecided.

## Grounding facts (verified in-tree, post-#116)

- The shipped engine excludes boundary-spanning runs from block pools with a
  stated identity argument: a pro-rata split of a run's ratio IS the whole-run
  ratio, so per-run proportional credit carries no block-level information
  (`analyzers/ic.py`, analyze_ic_blocks docstring). A candidate that is just
  pro-rata credit re-derives a constant and cannot beat the incumbent.
- `runs_floor_met` is `n_runs >= _MIN_SUPPORTED_BLOCK_RUNS` with integer
  `n_runs`; fractional ownership needs a pinned counting rule.
- The truth generator's boundary-spanning set (`exploratory-multi-block`) is
  deliberately non-gating (ADR 109) and the incumbent does not recover it; the
  candidate's motivating case has no gating truth set yet.
- The admission harnesses take any callable satisfying `IcBlockEstimator`;
  no candidate module exists in the tree, and nothing must make one reachable
  from `serve` or the CLI.
- ADR 23: placebo fire rejects a candidate permanently; a replay miss re-queues
  after a design change. Morning block validates on the synthetic bar alone.

## Decisions

- Q1 (2026-08-23): admit-and-ship in one ticket — on a bars-pass, fuzzy credit
  becomes how the shipped engine builds block pools. Why: single-operator app;
  Connor accepts on-the-fly change here. `inline`
- Grounding correction (2026-08-23): run-to-block membership is by member-meal
  DOSE times (`ic.py:2308`), not the run's absorption span. A lone 9:00 meal
  digesting past 11:00 already credits the 7–11 block. The dropped case is
  CHAINED runs whose member meals were dosed in different blocks — one shared
  outcome ledger, two dosing regimes — which is what fuzzy credit must split.
  `inline`
- Q2 (2026-08-23): prototype the three crediting schemes — carb-share
  weighting, majority-with-threshold, inverse-ratio regression — against
  chained-run truth sets with known per-block ratios; recovery decides.
  Scratchpad-only prototype, synthetic data only, findings land here.
- Prototype verdict (2026-08-23, ledger-level Monte Carlo, 400 reps/cell,
  8% relative outcome noise, chained carb-share U(0.3,0.8)):
  * carb-share weighting is confidently wrong — bias +0.39 (starved) / +0.24
    (balanced), 80% CI covers truth 0–6% of the time. Eliminated.
  * majority-threshold (≥0.8 share) is honest but never fills the starved
    pool (median 3 runs) — it only helps on lopsided chains. Eliminated as
    the primary scheme.
  * inverse-ratio regression (WLS of insulin/carbs on carb share across ALL
    runs; per-block ratio from the fitted mixture) recovers truth unbiased
    (bias −0.00, RMSE 0.11 vs incumbent's 0.23), 79–81% coverage on an 80%
    CI, and turns 33 runs of chained evidence into a real starved-block
    estimate. Lowest placebo false-band rate of the four (19% vs 25–39% at
    this crude bootstrap; the committed placebo bar remains the real test).
  Caveat: noise model is multiplicative on effective insulin; the engine's
  clustered pooling and the committed placebo construction are stricter.
  Prototype: scratchpad `proto_fuzzy_credit.py` (session-local, not kept).
- Real-snapshot grounding (2026-08-23, read-only copy, deleted after the run;
  word-only here per the data boundary): chained cross-block runs are a large
  fraction of the window's ledgers, the morning block is starved exactly as
  predicted (meals plentiful, whole runs almost absent, `unmeasured-alone`),
  and the regression preview agreed closely with the shipped ledger's estimate
  on the floor-passing block while giving the morning block a plausible
  estimate near its programmed value off ample fractional ownership. The
  preview did not apply the engine's regime filtering; the real candidate
  must. `inline`
  `inline`

- Q2 final (2026-08-23): the candidate IS inverse-ratio regression — infer
  each block's ratio jointly from all runs, lone and chained, weighting by
  carbs; per-block ratio read off the fitted mixture. Pinned as "the candidate
  design" for ADR 23 permanence. Why: prototype won every metric; carb-share
  weighting eliminated (confidently wrong), threshold eliminated (never fills
  the starved pool). `→ ADR` (record at execution in the change's design.md)
- Q3 (2026-08-23): floor semantics — a chained run counts toward the eight-run
  floor fractionally by the block's carb-share ownership; the floor is met
  when lone runs plus fractional ownership sum to eight. Real-snapshot
  grounding showed this actually unlocks the starved morning block. Why:
  lone-only defeats the ticket; count-any-touch lets barely-touching runs
  unlock a move. `→ ADR` (same record)
- Q4 (2026-08-23): ADR 23 placebo permanence attaches to the PINNED design;
  one formal bar run decides it; a materially different scheme is a new
  candidate. Development may iterate before pinning. `inline`
- Q5 (2026-08-23): a new chained-run truth set (known per-block ratios,
  chained ledgers at varied carb shares) gates cross-block candidates and
  stays exploratory for the incumbent; the incumbent's existing gated sets
  and placebos still gate every estimator. No ADR 109 pin moves. `inline`

### Risk contract

- Must prevent: real glucose/insulin data or any number/count/date from it in
  the repo, PR, or CI output; dosing advice in any output; the candidate code
  path reachable from `serve`/CLI before both bars pass; silent incorrect
  success (a bar reporting pass vacuously); secret exposure.
- Must recover: —
- Accepted failure: bar run fails or refuses → clear stop, rejection or refusal
  recorded (a placebo fire closes the ticket as rejected, with its ADR).
- Unsupported: blocks with no ownership in the window; regimes the engine's
  own filtering excludes; recovering 2025 unstamped history.
- Evidence owed: candidate through the public estimator interface only; both
  bars via the committed harnesses; fractional-floor semantics pinned by test;
  placebo non-vacuity preserved; cache bump untouched (no new write path).
- Why: advisory insulin dosing, one wearer, public repo/CI. Disposition: copy
  into the work order at posting.

## Open questions

- Q1 ship-or-stop; Q2 crediting scheme; Q3 floor counting; Q4 what "permanent
  placebo rejection" attaches to during development; Q5 gating of new truth
  sets. Asked round 1, 2026-08-23.

## Spawned tasks
