# Design — ic-dose-stamped-anchor

## ADR 20 — The I:C anchor is dose-stamped for measurement, currently-programmed for assertion

**Ruling.** Carb-ratio meal runs pool by the ratio their doses were actually given under
(dose-stamped regimes), each regime estimated against its own ratio. Assertion authority is
unchanged: only the currently-programmed regime's pool, passing the existing five-condition
`ic_asserts_move` predicate, can assert a move. Other numeric regimes are information-only
findings.

**Consequences.**
- Measurement survives reprogramming: a retired regime's evidence remains visible as
  information instead of being discarded (issue #10's starvation is resolved as an
  information-recovery problem, not by weakening the gate).
- The assert path is byte-identical to today's predicate; the change is additive and
  withhold-only by construction.
- Any sweep, gate, or surface reads the engine's `IcBlock.asserts_move` and eligibility
  dict; re-deriving eligibility conditions is a defect (first prototype pass produced 3
  false asserts that way).
- Regime identity is `(block schedule membership, dose-stamped ratio)` as of dose time;
  runs spanning a reprogramming are dropped.

Decision: harmonichq/harmonic#20 (map #19), 2026-08-18. Evidence: weekly 77-cell sweep on
real history — status quo 13 measurable / 0 asserts (reproduces #10); option C 20
measurable / 0 asserts / +7 information-only findings.

## ADR 21 — No held-out backtest gates I:C assertion; the eight-run floor stays mandatory

**Ruling.** No retrospective held-out backtest — neither a continuous per-block withhold gate
nor a one-time per-user estimator-admission check — gates or relaxes carb-ratio assertion.
`_MIN_SUPPORTED_BLOCK_RUNS = 8` stays a mandatory condition inside the single eligibility
predicate `ic_asserts_move`, not a fallback for unscored blocks. Evidence for a new ratio is
prospective only: a ratio is programmed, held, and closed runs accrue under it — the Trial
path. A Trial cannot authorize the recommendation that would cause the change it is testing.

**Consequences.**
- The shipped basal Backtest stays retrospective corroboration only, with no authority over
  I:C. This resolves the glossary "Backtest" term collision noted in #21: one meaning,
  corroboration.
- Candidate estimators (#23) cannot be admitted by per-user held-out scoring; the estimator
  ladder needs a separately settled evidence path before any candidate can enter.
- Hierarchical pooling across retired regimes waits on #23, not on a gate.
- Match-only scoring remains the only honest counterfactual rule: meals are never scored
  against ratios they were not dosed under, and no analytic rescaling is permitted.
- The binding constraint on evidence is holding one ratio steady, not per-meal hygiene —
  ratio churn starves every pool, however the pool is assembled.

Decision: harmonichq/harmonic#21 (map #19), 2026-08-23. Evidence: prototype 2026-08-23 on a
fresh read-only snapshot, engine-owned `analyze_ic_blocks` / `IcBlock.asserts_move` path,
weekly cutoffs over the July 2026 churn era + current era + one flat-era control, at 14-day
and 7-day horizons: 0 of 32 challenger cells scoreable at both horizons (no estimator
candidate 14, candidate equal to programmed 8, incomplete horizon 6, candidate never dosed
4). The prespecified stop condition (fewer than 10 scoreable cells) fired. Supersedes the
2026-08-18 design that made the backtest the evidence-based successor to the eight-run floor.
