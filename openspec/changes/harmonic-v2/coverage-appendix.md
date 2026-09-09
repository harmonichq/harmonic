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
| Whole pytest | 158–162 s pre-change on this machine; foreground measurement was cut off by the tool host | 157.33 s |
| Analyze path | 1.388 s cold; 1.406 s warm | no limit; recorded for regression context |

The first c4 measurement pass found no breach in the first four budgets. The
same unmodified pre-change tree measured 158–162 s on this machine earlier in
this session, already 0.67–4.67 s beyond the inherited 157.33-s ceiling; this
is a pre-existing machine-baseline drift, not a c4 breach. The foreground tool
host terminates a full pytest invocation after about 30 seconds, so it cannot
produce a second end-to-end wall time here. c4 adds no recipe, fixture,
generator, limit, or production code.
