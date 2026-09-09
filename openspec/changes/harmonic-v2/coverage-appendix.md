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
unchanged 157.33-s ceiling on this machine both before and after the change:
the pre-change tree's 158–162 s is 0.67–4.67 s over, and the c5 run's 202.62 s
is 45.29 s over. The limit is not raised here; the operator decides how to
resolve this budget breach. Task 2.5.2 stays unticked until the operator decides
the whole-suite budget (raise the archived ceiling or re-baseline on the current
machine); no limit is changed here.
