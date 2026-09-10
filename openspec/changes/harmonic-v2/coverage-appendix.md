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
