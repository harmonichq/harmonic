# Scope ledger — IC-ratio held-out backtest as assertion gate (#12)

## Decisions

- Backtest ships in-app, runs continuously on the user's live DB, and gates whether a
  block asserts a move; it can only withhold, never create, a recommendation. Why:
  Connor's settled design, session 2026-08-18. `→ issue` (rewrite of #12)
  *Superseded 2026-08-23, see Outcome.*
- It is the evidence-based successor to the eight-run floor; `_MIN_SUPPORTED_BLOCK_RUNS = 8`
  becomes the fallback for unscored blocks. Why: floor is a proxy, backtest is direct
  evidence. `→ issue`
  *Superseded 2026-08-23, see Outcome.*
- Computed on a schedule and cached, never per-request; write paths bump the cache. Why:
  matches the hourly fetch loop shape. `inline`
- Breakfast/morning is unmeasurable alone, permanently (meals chain into lunch; 2 runs sit
  wholly inside). Closed question. Why: rule structure, not data shortage. `→ issue`
- Issue #12 shrinks from three questions to one: "does the ledger predict held-out
  outcomes better?" Why: three-block picture and floor-lowering died on fresh data
  (5 Aug 2026 reprogramming). `→ issue`
- Scoring is two numbers (cleanup insulin per gram, meal-attributed lows) with a lows
  veto. Why: without the veto the backtest licenses the move the harm gate withholds. `→ issue`
- Prototype first, scratchpad-only, against a fresh snapshot; nothing posted to #12 until
  the prototype informs the rewrite. Why: Connor's explicit sequencing. `inline`

- Option C is approved to ship (Connor, 2026-08-18): dose-stamped regime measurement,
  current-regime-only asserting, information-only findings for other regimes. Lands as
  a build issue via the agentflow intake path, charted on the I:C wayfinder map.
  `→ issue` (#10 resolution + build issue)
- 2025 unstamped history is unrecoverable — the tandem app wasn't running then; it is
  now, so stamps accrue going forward. Closed, not actionable. `inline`
- Fuzzy/proportional cross-block credit (e.g. logarithmic ownership curve for meals
  spanning boundaries) is a candidate estimator idea, same family as the spanning-chain
  estimator: it may only enter through the #12 held-out gate, never on plausibility.
  `→ issue` (candidate list in the #12 rewrite)
- I:C trials stay at 14 days; re-assess trial length after the I:C engine rework ships.
  `→ issue` (note on the map)
- Durability home: a wayfinder map for the I:C engine rework (option C, #12 gate,
  spanning-chain/fuzzy-credit candidates, #11 boundary question, trial-length
  re-assessment). `→ issue` (map root)

### Risk contract

- Must prevent: real glucose/insulin data landing in any repo, publish, or artifact;
  dosing advice or ratio recommendations in any output; the gate ever *creating* a
  recommendation; secret exposure.
- Must recover: —
- Accepted failure: prototype crashes or scores nothing → clear stop, rerun by hand.
- Unsupported: mid-run reprogrammed runs; meals scored against ratios they weren't dosed
  on; the morning block (unmeasurable alone).
- Evidence owed (shipped gate only, not the prototype): synthetic-fixture tests via a
  committed generator; withhold-only property; cache-bump on write paths.
- Why: medical-adjacent personal data, public CI logs. Disposition: copy into the #12
  rewrite at admission.

## Refocus (2026-08-18)

- Session refocused onto #10 (the anchor question) as the upstream decision: the assert
  predicate has never fired on real data, so #12's gate is a no-op until #10 settles.
  Why: profile/ratio switching starves the dose-stamped pool the predicate filters on.
  `inline`
- Prototype for #12 stays parked until the anchor is decided. `inline`
- Anchor decision (provisional, pending prototype): option C — measure each regime
  against the ratio its doses were actually given under (dose-stamped pooling), but
  only assert a recommendation when the current-ratio pool is itself sufficient;
  otherwise surface the dose-stamped finding as information, not a recommendation.
  Why: recovers measurement power without recommending against settings the data
  wasn't collected on; same rule as #12's honesty filter. `→ issue` (#10, after
  prototype)

## Prototype result — anchor sweep (2026-08-18, scratchpad `anchor-results.md`)

- Sweep of 22 weekly endpoints × all blocks (77 cells), engine-owned predicate
  (`analyze_ic_blocks` eligibility, all five conditions).
- Status quo reproduces #10: **zero asserts ever**, 13/77 cells even measurable.
- Option C: 20/77 measurable (+54%), **still zero asserts** (assert gate unchanged by
  construction), +7 information-only findings — chiefly the retired overnight 5.0
  regime, which from late June measures 4.56–4.73 with a CI excluding its own 5.0,
  invisible under today's rule once the block was reprogrammed away.
- Even under C nothing asserts today: the current evening 5.6 pool is 7 runs (floor 8);
  first possible assert ≈ one more week of data.
- First Sol pass hand-rolled a 3-condition predicate and false-fired 3 asserts;
  caught at coordinator verification, fixed by wiring the engine's own eligibility
  path. Lesson: the sweep must read `IcBlock.asserts_move`, never re-derive.

## Data feasibility (explored 2026-08-18, fresh snapshot)

- Meal-bolus history: 1,004 meals 2025-07 → 2026-08, but a six-month hole
  (2025-09 → 2026-02, zero boluses) and the 2025 tail has no dose-stamped ratio.
  Usable: ~820 meals, 2026-03 → 2026-08.
- Three regimes: flat 5.0 era (Mar–Jun, ~520 meals, one ratio — no held-out contrast);
  July churn era (~7 weeks, 3–4 distinct dosed ratios per week at ~40 meals/week:
  4.0/4.5/5.0/5.1/5.4/5.7 — the only stretch with real outcomes at multiple ratios);
  current two-block era (5.6/4.0, ~2 weeks, ~90 meals).
- Consequence: the honest match-only backtest has essentially ONE evaluation window —
  the July churn. Cutoffs in the flat era can't score non-programmed candidates
  without analytic rescaling (a modeling assumption, exactly what the honesty filter
  exists to avoid). The prototype's verdict will rest on ~250 July–August meals.
- Lows signal exists every month (47–200 readings <70, 10–44 <55), peaking in July.
- Issue #10's finding is confirmed in the raw data and bears directly: profile/ratio
  switching is why on-regime pools starve — the same dose-stamp filter the backtest's
  honesty rule uses.

## Outcome (2026-08-23)

- The held-out backtest gate is rejected. Recorded as ADR 21 in
  `openspec/changes/ic-dose-stamped-anchor/design.md` — no retrospective backtest gates or
  relaxes I:C assertion, and the eight-run floor stays a mandatory condition of
  `ic_asserts_move` rather than a fallback.
- The prototype scored nothing: 0 of 32 challenger cells were scoreable at both the 14-day
  and 7-day horizons (no estimator candidate 14, candidate equal to programmed 8, incomplete
  horizon 6, candidate never dosed 4). The prespecified stop condition (fewer than 10
  scoreable cells) fired.
- The two Decisions bullets above marked *Superseded 2026-08-23* — the in-app continuous
  gate, and the backtest as evidence-based successor to the eight-run floor — are superseded
  by this Outcome. They stay in the list as history, not as live design.
- Evidence for a new ratio is prospective only: program a ratio, hold it, let closed runs
  accrue under it (the Trial path). Candidate estimators move to #23 and need a separately
  settled evidence path.
- Answered — the two open questions carried from 2026-08-18 close here. Held-out prediction:
  the ledger was never shown to beat the incumbent or programmed-as-is, because nothing was
  scoreable. Counterfactual method: match-only was the method used, and it scored nothing;
  analytic rescaling stays out of bounds.
- The binding constraint is holding one ratio steady. Ratio churn starves every pool, so no
  scoring rule recovers evidence the history does not contain.

## Open questions

- Connor's call, clinician conversation: whether a separate breakfast ratio is worth
  carrying at all. Unrouted.
- Whether meal-attributed lows become their own thread (separate from #12). Unanswered.

## Dispositions discharged (2026-08-18)

- Wayfinder map filed: harmonic #19; decision tickets #20 (closed — option C, ADR 20 in
  `openspec/changes/ic-dose-stamped-anchor/design.md`), #21 (gate spec + spec
  amendments), #22 (surface lock, blocks the option C handoff), #23 (estimator ladder),
  #24 (trial length, deferred). All earlier `→ issue` dispositions now live on the map
  or its tickets; the #12 rewrite itself happens in ticket #21.

## Spawned tasks

- Sol prototype run (dispatched 2026-08-18, stopped by Connor before any work; spec at
  session scratchpad `backtest-spec.md`). Relaunch pending Connor's go-ahead.
