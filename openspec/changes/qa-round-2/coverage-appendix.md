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

## #465 basal-recurring-low-within-floor case — 2026-09-24

Task 38 adds the manufactured case `basal-recurring-low-within-floor`: thirty
steady nights delivering 0.59 U/h against a programmed 0.60, with lows at 03:00
on two nights, scoped to the (180, 240) window. At task 38's commit (cc87c41c)
its `execute_case` dump served 03:00 as "lower (recurring lows)" at 0.59, and
that dump was its first literal expectation. After ADR 465 its dump serves
03:00 held at 0.60 with the recurring-lows hold sentence, no whole-day row and a
held (180, 240) row, and task 43 rewrote the literal from that dump. The
expectations of `basal-recurring-low-lower`, `basal-recurring-low-no-clean-median`
and `basal-recurring-low-gate` did not move under #465. The committed showcase is
unchanged.

The five budgets were measured once for the slice, by `acceptance.py budget` on
the slice branch at d705ac0a (which also carries #466's tasks 48–54), and the
base 718fcf77 was measured on the same machine, back to back, for the
whole-pytest comparison ADR 463's ruling uses. No limit was raised:

| Budget | Slice d705ac0a | Base 718fcf77 | Unchanged limit |
| --- | ---: | ---: | ---: |
| Committed showcase size | 1,409,024 bytes | 1,409,024 bytes | 25 MiB (26,214,400 bytes) |
| Showcase drift check | 0.303 s wall | 0.285 s wall | 30 s |
| Focused QA suite | 59.909 s wall | 60.254 s wall | 90 s |
| Slowest generated case | 11.55 s (`test_case_c4_profile`), 76 cases | 12.58 s (`test_case_c4_profile`), 74 cases | 15 s |
| Whole pytest | 392.41 s wall | 449.64 s wall | 400 s |

The new case's own generated test takes 0.07 s (measured separately in the
worker). The slice's whole pytest is within its ceiling, and the base ran
57.23 s slower in the same sitting. By ADR 463's ruling the slice is judged
against the base on the same machine; the gap is machine noise, not a code
saving. Both receipts are the `budgets.json` each run wrote; in the coordinator's
logged re-run each `--out` directory already held its receipt, so the re-run
refused ("use a fresh --out for each run") and the receipts were read back.

## #466 basal-recurring-low-spread case — 2026-09-24

Task 48 gives `_materialize_basal_coverage` a `clean_rates` parameter (one
delivered rate per informative night; `None` keeps `clean_rate` for every night,
so no other case moves) and adds the manufactured case
`basal-recurring-low-spread`: fourteen nights at 0.45, two at 0.54 and fourteen
at 0.66 against a programmed 0.60, with lows at 03:00 on two nights. Its
`execute_case` dump at task 48's commit (5377e044) serves 03:00 as
"lower (recurring lows)" at 0.54 with an interval of 0.45–0.66, and its literal
expectation was transcribed from that dump. Task 50 rewrote the headline
literals of `basal-recurring-low-lower`, `basal-recurring-low-no-clean-median`
and `basal-recurring-low-spread` from their dumps ("overnight"). The committed
showcase is unchanged.

The five budgets are the one slice measurement recorded in the #465 section
above (d705ac0a carries this case), with no limit raised: showcase 1,409,024
bytes, drift 0.303 s, focused QA suite 59.909 s, slowest generated case 11.55 s,
whole pytest 392.41 s against the base's 449.64 s on the same machine. The new
case's own generated test takes 0.08 s (measured separately in the worker).

## #467 and #469 scoped Pattern membership and the one urgency ranking — 2026-09-25

Neither ticket adds or rewrites a QA case: every `QaExpectation` literal passes
unchanged under both, as their spikes measured. The committed showcase is
unchanged. The five budgets were measured by `acceptance.py budget` on the slice
head `bb694f14` (which carries both tickets). The first run shared the machine
with other work and breached two limits; the coordinator re-ran it alone, under a
load average of 3 to 4 from other processes. No limit was raised:

| Budget | Under load (bb694f14) | Alone (bb694f14) | Unchanged limit |
| --- | ---: | ---: | ---: |
| Committed showcase size | 1,409,024 bytes | 1,409,024 bytes | 25 MiB (26,214,400 bytes) |
| Showcase drift check | 0.231 s wall | 0.28 s wall | 30 s |
| Focused QA suite | 77.300 s wall | 64.67 s wall | 90 s |
| Slowest generated case | 16.133 s (`test_case_c4_profile`), 76 cases | 12.387 s | 15 s |
| Whole pytest | 498.69 s wall | 460.78 s wall | 400 s |

Alone, only the whole pytest breaches. The base measured 417.88 s (origin/main
59fa4737, #463's section) and 449.64 s (718fcf77, #465's section) earlier in this
run on the same machine, so the ceiling of record is already exceeded by the
base here. By ADR 463's ruling the slice is judged against the base on the same
machine; no limit was raised, and the breach is flagged for Connor with
re-baselining the 160 s figure. The slice's worker ran the whole suite once on
bb694f14 (2693 passed, 1 skipped, 408.54 s reported by pytest), and the
QA-case files alone at 79.83 s. Both budget receipts are coordinator-run records
outside this tree.
