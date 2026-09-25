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

## #462 c4-isf-late-read case — 2026-09-24

Task 19 adds the manufactured case `c4-isf-late-read`: c4-isf's recipe with one
unchanged pump read at 2024-06-30 12:00 written before its one reconcile, so
its record's retained context reads a pump read later than its ending and the
ending saves `context_after_ending`. Its `execute_case` dump equals c4-isf's,
and its literal expectation was transcribed from that dump. The committed
showcase is unchanged. The five budgets were measured once, by
`acceptance.py budget` on the slice branch at 403cfd67 (which also carries
#463's tasks 28–35), with no limit raised:

| Budget | #462 measurement | Unchanged limit |
| --- | ---: | ---: |
| Committed showcase size | 1,409,024 bytes | 25 MiB (26,214,400 bytes) |
| Showcase drift check | 0.233 s wall | 30 s |
| Focused QA suite | 62.546 s wall; 95 passed | 90 s |
| Slowest generated case | 12.22 s (`test_case_c4_profile`); the new case 1.15 s | 15 s |
| Whole pytest | 398.82 s wall; 2669 passed, 1 skipped | 400 s |

The whole-pytest time is within its ceiling by 1.2 s, measured in a sandboxed
worker; like #459's 372.60 s it is a run-to-run figure, not an isolated code
cost, and the next change that adds tests should expect to meet this ceiling.

## #463 review round 1: whole pytest against the base — 2026-09-24

The budget leg on the slice head `fbe632d8` breached the whole-pytest ceiling:
406.50 s in a sandboxed worker, then 421.12 s on a quiet machine. Every test
passed. The coordinator then timed the unchanged base on the same machine, back
to back, quiet:

| Run | Commit | Whole pytest | Result |
| --- | --- | ---: | --- |
| Base | origin/main 59fa4737 | 417.88 s wall (pytest reports 416.74 s) | 2656 passed, 1 skipped |
| Slice | fbe632d8 | 421.12 s wall (the budget leg's own timing) | every test passed |
| Limit of record | — | 400 s | 2.5× the 160 s baseline |

The other four budgets in the quiet run were within their limits: showcase
1,409,024 bytes, drift 0.285 s, focused QA suite 58.080 s, slowest generated case
11.82 s. The base already exceeds the ceiling on this machine, and wall against
wall the slice adds 3.24 s (0.8%). By the coordinator's ruling (ADR 463), this
run judges the whole-pytest budget against the base on the same machine. No
limit was raised. Lock #462's Expectation on the budget leg is unmet as written;
the ruling accepts it pending Connor, and re-baselining the 160 s figure is
Connor's decision. The budget leg's own output (`full_pytest_seconds
[421.12, 400]`) and the base timing are coordinator-run records outside this
tree.
