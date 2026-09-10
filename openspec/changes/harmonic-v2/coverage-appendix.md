# #393 coverage appendix

All measurements use only committed manufactured QA recipes. The load-bearing
whole-pytest baseline is **62.93 s**, read from the earlier coverage appendix's
chunk-1 measurement; its unchanged 2.5× ceiling is **157.33 s**.

| Budget | c4 measurement | Unchanged limit |
| --- | ---: | ---: |
| Committed showcase size | 1,314,816 bytes | 25 MiB (26,214,400 bytes) |
| Showcase drift check | 0.15 s | 30 s |
| Focused QA suite | 18.56 s (66 tests) | 90 s |
| Slowest generated case | 1.52 s (`test_case_pattern_near_tie`) | 15 s |
| Whole pytest | 202.62 s c5 run (2401 passed, 1 skipped); 158–162 s pre-change on the same machine | 157.33 s |
| Analyze path | 1.388 s cold; 1.406 s warm | no limit; recorded for regression context |

The first four budgets remain within their limits. Whole pytest breaches the
archived 157.33-s ceiling on this machine both before and after the change:
the pre-change tree's 158–162 s is 0.67–4.67 s over, and the c5 run's 202.62 s
is 45.29 s over (the coordinator's re-measurements on the merged head were
197.07 s and 198.25 s).

**Operator ruling (Connor, 2026-09-09): re-baseline on the current machine.** The
62.93-s baseline was never measured on this machine and CI, not this Mac, is the
check of record. The chunk-1 baseline for this and later chunks is the
pre-change tree's 160 s on the current machine, giving a 2.5× ceiling of
**400 s**; the c5 head at 202.62 s is within it. No other limit changed. Task
2.5.2 is ticked under this ruling.

## #395 c2c amendment 2 roster remeasurement

Chunk c2c re-ran the same five budgets after the operator-amended Pattern
roster, the coordinator's target-family attribution and nesting corrections,
and their generator-owned literal expectations were regenerated. All inputs
remain manufactured.

| Budget | c2c measurement | Limit |
| --- | ---: | ---: |
| Committed showcase size | 1,314,816 bytes | 25 MiB (26,214,400 bytes) |
| Showcase drift check | 0.91 s | 30 s |
| Focused QA suite | 28.95 s wall (58 tests) | 90 s |
| Slowest generated case | 3.81 s (`test_case_showcase`) | 15 s |
| Whole pytest | 293.85 s (2420 passed, 1 skipped) | 400 s |

## #389 c2b Pattern Focus readiness measurements

These are the c2b worker's measurements, not the integrated acceptance receipt.
C4 remains the QA budget of record. The operator's 160-second current-machine
baseline and 400-second ceiling remain unchanged.

The new `pattern-focus-meals` recipe manufactures 24 meals over eight days.
Its complete `execute_case` output was captured before copying the analyzer,
queue, support, Rest-window, history, behavioral, verdict-tally, finding-title,
uncaused-high and complete Pattern expectations into literal `QaExpectation`
values. `test_case_pattern_focus_meals` passed through the catalog runner.
The committed showcase and its generator output remain unchanged.

| Budget | c2b measurement | Unchanged limit |
| --- | ---: | ---: |
| Committed showcase size | 1,417,216 bytes; delta from starting commit: 0 bytes | 25 MiB (26,214,400 bytes) |
| Showcase drift check | 0.160 s wall | 30 s |
| Focused QA suite | 22.023 s wall; 68 passed | 90 s |
| Slowest generated case | 2.63 s (`test_case_showcase`); new case 0.06 s | 15 s |
| Whole pytest over both built shells | 258.593 s wall; 2435 passed, 1 skipped | 400 s |

Relative to the previous c2c measurements recorded above, drift is −0.750 s,
focused QA is −6.927 s, the slowest case is −1.18 s and whole pytest is
−35.257 s. These are differences between recorded runs, not an isolated estimate
of this change's runtime cost. Whole pytest is +98.593 s relative to the
operator's 160-second baseline. The starting #389 showcase was already
1,417,216 bytes; its difference from the older c2c receipt is not a c2b change.

The six-file c2b focused command separately passed 128 tests in 169.114 s wall.
Both shells built after `npm ci`. Strict OpenSpec validation, the ADR-number,
owned-identifier and public-allowlist guards, and showcase drift all passed.
Raw, unedited outputs and exact commands are retained in the worker's declared
`s389/c2b` Scratch directory: `verification.json`, `build.txt`, `focused.txt`,
`qa-budget.txt`, `full-pytest.txt`, `showcase-drift.txt`, `openspec.txt`, `adr.txt`,
`identifiers.txt` and `public-allowlist.txt`. `qa-execution.json` and
`qa-expectation.txt` retain the complete manufactured capture and literal oracle.

`fail-first.txt` records the original twelve-meal/four-day hold.
`mapped-gate-perturbation.txt` records the regression rejecting a bypassed
opportunity gate. `readiness-examples.json` and `api-receipt.jsonl` retain the
serialized per-arm and selected/ending responses. Public tests preserve readonly
database bytes, source revision, original comparison context and saved endings.

The implementation follows the lock's explicit removal of the Pattern-only
elapsed floor from mapped direction, preserving measurement, coverage and
uncertainty checks. Connor confirmed on 2026-09-10 that the lock governs:
the published opportunity verdict replaces the fourteen-day floor entirely.
The mapped-direction regression asserts withholding while that verdict is
withheld and publication once it is ready, including before fourteen days.
Setting Trial criteria remain unchanged.

### #389 c2b Coordinator Amendment 1 — 2026-09-10

F1 restores the shared Focus arm fields, including measured/unmeasured behavior
counts and a null `required_elapsed_days` for Pattern arms; the dated Chunk 3
contract records their relationship to the opportunity fields. F2 confines the
opportunity verdict to mapped-glucose direction. Other outcome directions and
adherence keep their existing elapsed-plus-measured criterion.

Four regressions failed first: missing shared fields in comparison and selected
API reads, missing measurement counts, and a four-day, twelve-low-per-arm
comparison incorrectly publishing a non-target direction. All four then passed.
The latter uses manufactured Store data with no measured correction-stacking
behavior: the mapped TBR direction publishes while supported TIR/TAR differences
remain unclear. The existing mapped-direction gate/coverage regression, setting
criteria, legacy Focus and immutable selected/ending tests also pass.

| Budget | Amendment 1 measurement | Delta from prior c2b run | Unchanged limit |
| --- | ---: | ---: | ---: |
| Committed showcase size | 1,417,216 bytes | 0 bytes | 25 MiB |
| Showcase drift check | 0.181 s wall | +0.021 s | 30 s |
| Focused QA suite | 22.058 s wall; 68 passed | +0.035 s | 90 s |
| Slowest generated case | 2.82 s (`test_case_showcase`) | +0.19 s | 15 s |
| Whole pytest over both built shells | 267.293 s wall; 2436 passed, 1 skipped | +8.700 s | 400 s |

The six-file focused suite separately passed 129 tests in 175.436 s wall
(+6.322 s). The catalog-generated `test_case_pattern_focus_meals` passed in
0.07 s. Whole pytest is +107.293 s against the unchanged 160-second baseline.
These deltas compare recorded runs, not isolated implementation costs. C4
remains the QA budget of record; no limit, literal oracle or showcase changed.

`npm ci && npm run build`, strict OpenSpec validation (74 items), the ADR-number,
owned-identifier and public-allowlist guards, and showcase drift passed.
Complete unedited outputs live under the declared `s389/c2b` Scratch directory
in `review-1/`: `verification.json` (exact commands, exit codes and wall times),
`build.txt`, `focused.txt`, `qa-budget.txt`, `full-pytest.txt`,
`showcase-drift.txt`, `openspec.txt`, `adr.txt`, `identifiers.txt`,
`public-allowlist.txt`, `fail-first.txt` and `regressions.txt`.
`comparison-examples.json` and `api-receipt.jsonl` preserve complete synthetic
comparison and selected/ending responses; `capture.txt` records their passing
public-interface assertions, including read-only bytes and immutable records.
