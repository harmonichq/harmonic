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

- Plan-review round 1 (2026-08-23): 7 blockers + 5 notes, all tagged
  `authoring`; all reproduced against the tree before fixing. Rulings folded
  into the order: (a) ADR 23's "strictly more meals" is interpreted as meals
  the estimate consumed — `n_meals` is coverage and already maximal, so the
  replay gains an eligibility-evidence comparison (`fit_meals`) stamped by
  both estimators; narrow replay.py change owned by chunk 1, recorded in ADR
  117. (b) `IcBlock.n_runs` carries the floored integer effective run count;
  whole/fractional split lands in additive eligibility fields; the display
  consequence (chained-only blocks can reach numeric) is accepted and
  recorded. (c) Chunk 1 may extract ic.py's block-stamping machinery into
  shared helpers rather than forking it; incumbent behavior pinned by the
  existing suite. (d) A placebo fire in any chunk stops work and reports; the
  coordinator adjudicates implementation-defect vs design-fire; chunk 2's run
  is the recorded verdict. (e) Verification baseline corrected to 1994/1 with
  the api+sync extras. `inline`

- Plan-review round 2 (2026-08-23): all 12 round-1 items verified resolved;
  2 new blockers, both `injected` by round-1 fixes, both fixed: the incumbent
  stamping `fit_meals` stales the two drift-checked committed fixtures
  (regeneration ownership + both --check gates added to Verification), and the
  replay report's meal counts had to follow the clause onto fit_meals so the
  render explains its own verdict. One note applied (shared machinery resolves
  the pooled estimator through the ic namespace so existing patches bind).
  Conditional countersign satisfied by applying the reviewer's own prescribed
  fixes. Operator directive folded in: sub-agents are codex models only, via
  /orchestrate. `inline`

## Open questions

- Q1 ship-or-stop; Q2 crediting scheme; Q3 floor counting; Q4 what "permanent
  placebo rejection" attaches to during development; Q5 gating of new truth
  sets. Asked round 1, 2026-08-23.

## Spawned tasks

## Verdict — admitted (2026-08-23)

Both bars run in-ticket, through the committed harnesses only.

- **Entry bar:** every gated truth set recovered within ADR 109's tolerance,
  including the chained cross-block set; both placebos non-vacuously clean —
  each placebo block reached a scoreable state, excluded no programmed value,
  asserted no move. No placebo fire, so ADR 23's permanent-rejection clause was
  never reached.
- **Real-data bar:** stable-era replay, read-only against a local snapshot on a
  floor-passing stretch, incumbent self-run as calibration: **pass**. No number,
  count, or window date from it is recorded here or anywhere else; the snapshot
  was deleted from the host and this machine when the run finished.
- **Shipped:** the candidate is now the engine's block estimator (ADR 117 in
  `openspec/changes/fuzzy-cross-block-credit/design.md`); the whole-run
  estimator stays as the ladder's incumbent reference.

Q4's permanence attaches to the pinned inverse-ratio regression design, as
recorded. Hierarchical pooling across retired regimes is the next candidate
through the same ladder.
