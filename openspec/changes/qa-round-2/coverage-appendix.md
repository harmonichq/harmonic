# QA round 2 coverage appendix

This records the QA-coverage-era budgets re-measured for this round's changes,
against the limits of record in `openspec/changes/harmonic-v2/coverage-appendix.md`
(the active QA change's appendix): committed showcase ≤25 MiB, showcase drift
≤30 s, focused QA suite ≤90 s, slowest generated case ≤15 s, whole pytest ≤400 s
on the operator's 160 s re-baseline of 2026-09-09. It lives with this change so a
round-2 diff touches one active OpenSpec change (ADR 459, coordinator ruling on
the budget-record location).

## #459 basal-and-carb-ratio-lower case — 2026-09-24

Task 11 adds the manufactured case
`basal-and-carb-ratio-lower`: the `basal-lower` and `ic-lower` recipes composed on
one store, the carb-ratio source span stretched to 93 days so both lanes end on
the basal lane's last day. Through `execute_case`, basal 03:00 and the all-day
carb ratio both assert a lower move and serve assert rows in the whole-day
queue; its literal expectation was transcribed from that dump. The committed
showcase is unchanged. The five budgets were re-measured on the slice branch
with no limit raised:

| Budget | #459 measurement | Unchanged limit |
| --- | ---: | ---: |
| Committed showcase size | 1,409,024 bytes | 25 MiB (26,214,400 bytes) |
| Showcase drift check | 0.162 s wall | 30 s |
| Focused QA suite | 45.785 s wall; 85 passed | 90 s |
| Slowest generated case | 9.72 s (`test_case_c4_profile`); the new case 0.10 s | 15 s |
| Whole pytest | 372.60 s wall; 2645 passed, 8 skipped, 5 failed | 400 s |

The five whole-pytest failures were `tests/test_credentials.py`, whose
`ModuleNotFoundError: No module named 'tconnectsync'` came from a worktree
virtualenv synced without the `sync` extra. After
`uv sync --frozen --extra api --extra sync` those tests and
`tests/test_tandemsource_map_real.py` pass (18 passed). The whole-pytest time is
within its ceiling but is the highest recorded here, measured in a sandboxed
worker; it is a run-to-run figure, not an isolated code cost.
