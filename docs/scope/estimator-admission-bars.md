# Scope ledger — estimator admission bars (#109, ADR 23)

## Decisions

- Candidates are exercised only through `analyze_ic_blocks` / `IcBlock.asserts_move`;
  re-deriving eligibility is a defect. Why: ADR 20 consequence, #273/#465 lesson. `inline`
- The replay measures agreement with the incumbent ledger, not truth; a single held
  ratio has no contrast. Why: ADR 23 ruling. `inline`
- No live shadow-mode runtime surface; the replay is offline tooling. Why: ADR 23. `inline`

### Risk contract

- Must prevent: real glucose/insulin data landing in any repo, publish, CI log, or
  artifact; dosing advice or ratio recommendations in replay output (counts, deltas,
  verdicts only); a candidate admitted on plausibility; secret exposure; silent
  incorrect success (a bar that passes while running zero assertions).
- Must recover: —
- Accepted failure: replay refuses a window that fails the stable-era precondition —
  clear stop naming the reason, operator picks another window.
- Unsupported: windows spanning a reprogramming; blocks with no floor-passing ledger
  pool (synthetic bar only, per ADR 23); analytic rescaling of any kind.
- Evidence owed: synthetic-fixture tests via the committed generator through the
  public interface; incumbent passes both bars (calibration); a deliberately broken
  estimator fails the placebo bar; refusal paths tested.
- Why: medical-adjacent advisory output, public CI logs. Disposition: copy into the
  #109 work order at admission.

- Real-snapshot calibration replay runs inside this ticket, read-only on a snapshot
  copy; the PR reports pass/fail verdict only, no numbers. Why: the calibration
  acceptance is only meaningful on the one real floor-passing window (Connor,
  2026-08-23, Q1). `→ issue` (#109 work order)
- Placebo "no finding" is strict: any numeric block whose measured band excludes its
  programmed ratio disqualifies, information-only included. Why: the spanning-chain
  candidate died on confident placebo findings, not staged moves (Connor, 2026-08-23,
  Q2). `→ issue` (#109 work order)
- "Within the engine's tolerance" pins to: the block's CI covers the true ratio AND
  the point estimate is within 0.1 g/u of it. Why: 0.1 is the engine's display step;
  no point tolerance lets a wide-but-covering candidate through (Connor, 2026-08-23,
  Q3). `→ issue` (#109 work order)
- Placebo construction (spiked, docs/scope/spikes/109-admission-bar-spike.py): meals
  dosed exactly at programmed with zero-mean, dose-independent CGM outcome noise at
  realistic ISF (~50 mg/dL/u). Dose jitter and low-ISF noise both fake a finding —
  the convex carbs/(dose+burden) pooling turns zero-mean noise into downward bias
  (measured: jittered doses asserted at 5.45 vs programmed 5.6). `inline`
- Recovery recipe (same spike): dosing carbs/R_true against a different programmed
  value recovers R_true within 0.1 with the CI covering it. `inline`
- Defaults accepted: generator is a committed script whose functions tests import
  (no committed fixture bytes, no new CI drift step); replay harness is a standalone
  stdlib script under scripts/. `inline`

## Open questions

- (none)

## Review instrumentation (#109 order)

- Round 1 (cold Opus panel): 5 blockers + 5 notes, all tagged `authoring` (missing
  real snapshot; analyze() settings leak; store round-trip contract gap; vacuous
  placebo pass; unspiked gated sets).
- Round 2 (same reviewer, delta pass): 3 blockers, all tagged `injected` by round-1
  fixes (grep clause outlawed the pins' own CI comparisons; endpoint-only
  precondition missed reverted reprogramming; round-trip asserted values with no
  public surface). Fixed with the reviewer's wording; countersign pending.

## Spawned tasks

- (none)
