# #601 coverage appendix

Slice B2 (`remove-isf-tuning`, tasks 7.1–9.3) changes the QA catalog: five
cases go (79 to 74) and every remaining case's rest windows come from the
rest-window detector. Its measurements are taken on the build commit before its
rebase onto `a6a7a9a0` (pre-rebase OID `15d5e10f`); the pull request records the
rerun on the pushed head. All inputs are manufactured
(`scripts/qa_e2e_cases.py`).

| Budget | Measurement (pre-rebase build) | Limit |
| --- | ---: | ---: |
| Committed showcase size | 1,486,848 bytes (unchanged) | 25 MiB (26,214,400 bytes) |
| Showcase drift check | 0.52 s wall | 30 s |
| Focused QA suite (`tests/test_qa_e2e_cases.py tests/test_gen_qa_e2e_db.py`) | 27.27 s wall; 96 passed | 150 s |
| Slowest generated case | `test_case_delivery_basal_legacy`: 1.39 s | 30 s |
| Whole pytest | 198.2 s wall; 2612 passed, 1 skipped | 2.5× chunk-1 baseline = 1,477.15 s |

Every budget is within its limit and no limit was raised. The committed
showcase is untouched (`git status` clean after the serves).

## The analysis on the base and on the head (task 7.1)

`analyze(...).to_dict()` minus `generated_at`, run through `execute_case` for
every QA case, on the base `a2dbdfbf` and on the pre-rebase build:

- base: 79 cases;
- head: 74 cases, the five deleted cases absent;
- all 74 equal once the base dump drops `isf`, moves `schema_version` from 9 to
  10 and rewrites the no-snapshot `data_quality` note; that note changed in
  exactly `basal-no-baseline`, `behavioral-false-low-suppressed`,
  `behavioral-lone-correction-clean`, `behavioral-low-no-suppressed`,
  `behavioral-uncaused-highs` and `edit-chain`. Nothing else changed.
