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

## Open questions

- Q1: is the real-snapshot calibration replay run inside this ticket, or post-merge
  by the operator?
- Q2: placebo "no finding" — strict (no band-excludes-programmed numeric block at
  all) or asserts-only?
- Q3: what does "recovers known ratios within the engine's tolerance" pin to?

## Spawned tasks

- (none)
