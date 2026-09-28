# #464 coverage appendix

Chunk 2 (`ic-block-evidence` QA case, tasks 6-7) is the first sub-order in this
change to touch the QA coverage budgets. The chunk-1 baseline below is the
coordinator's pre-change measurement on `c940f49d` (the triage base, before
chunk 1), run as a git-less `git archive` copy — git-dependent tests fail there
for that reason, not from this chunk's changes. All inputs are manufactured
(`scripts/qa_e2e_cases.py`).

| Budget | Chunk-1 baseline (`c940f49d`) | Chunk-2 measurement | Final measurement (`8ccd68cf`) | Limit |
| --- | ---: | ---: | ---: | ---: |
| Committed showcase size | — | 1,409,024 bytes | 1,409,024 bytes (unchanged) | 25 MiB (26,214,400 bytes) |
| Showcase drift check | — | 0.286 s wall | under 1 s wall | 30 s |
| Focused QA suite (`tests/test_qa_e2e_cases.py tests/test_gen_qa_e2e_db.py`) | — | 77.59 s wall; 94 passed | 46.02 s wall; 94 passed | 90 s |
| Slowest generated case | `test_case_c4_profile`: 17.52 s | `test_case_c4_profile`: 17.35 s; `test_case_ic_block_evidence`: 0.36 s | `test_case_c4_profile`: 9.49 s | 15 s |
| Whole pytest | 590.86 s wall; 2654 passed, 6 failed, 1 skipped | 638.15 s wall; 2678 passed, 1 skipped | 343.36 s wall; 2695 passed, 1 skipped | 2.5× chunk-1 baseline = 1,477.15 s |

The first three budgets are within their limits and `git diff --stat --
mockups/qa-e2e.synthetic` is empty (the committed showcase, which materializes
a different case, is untouched). Whole pytest (638.15 s) is within the
1,477.15 s ceiling.

`test_case_c4_profile`'s 15 s slow-case ceiling breach (17.52 s on the
pre-change base, 17.35 s after this chunk) predates this change and is not
introduced by it; it is a c4/watched-change case this chunk does not touch.
This chunk's own new case, `test_case_ic_block_evidence`, runs in 0.36 s.

## Authorized outside sub-order 2's Expected diff

The coordinator authorized adding `"ic-block-evidence": None` to
`EXPECTED_ACTIVE_KINDS` in `tests/test_pattern_replay.py` — the case never
touches `watched_change`/Focus/Trial state, matching every other non-c3/c4
case. `pytest tests/test_pattern_replay.py tests/test_qa_e2e_cases.py
tests/test_gen_qa_e2e_db.py` now reports 96 passed, 92 subtests passed, 0
failed.

## Final measurement

The final column is the coordinator's re-measurement on the ticket's final code
commit, `8ccd68cf`, taken from the full verification run recorded in
`evidence/verification/` (the whole pytest with `--durations=5`, the focused QA
suite with `--durations=3`, and the showcase drift check's wall time). Every
budget is within its limit, including the slow-case ceiling that the pre-change
base and chunk 2 both breached: `test_case_c4_profile` now runs in 9.49 s on
this machine. The committed showcase is byte-identical to chunk 2's.
