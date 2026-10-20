# #464 coverage appendix

Chunk 2 (`ic-block-evidence` QA case, tasks 6-7) is the first sub-order in this
change to touch the QA coverage budgets. The chunk-1 baseline below is the
coordinator's pre-change measurement on `c940f49d` (the triage base, before
chunk 1), run as a git-less `git archive` copy — git-dependent tests fail there
for that reason, not from this chunk's changes. All inputs are manufactured
(`scripts/qa_e2e_cases.py`).

| Budget | Chunk-1 baseline (`c940f49d`) | Chunk-2 measurement | Final measurement (`65f4f4c7`) | Limit |
| --- | ---: | ---: | ---: | ---: |
| Committed showcase size | — | 1,409,024 bytes | 1,409,024 bytes (unchanged) | 25 MiB (26,214,400 bytes) |
| Showcase drift check | — | 0.286 s wall | under 1 s wall | 30 s |
| Focused QA suite (`tests/test_qa_e2e_cases.py tests/test_gen_qa_e2e_db.py`) | — | 77.59 s wall; 94 passed | 47.25 s wall; 99 passed | 90 s |
| Slowest generated case | `test_case_c4_profile`: 17.52 s | `test_case_c4_profile`: 17.35 s; `test_case_ic_block_evidence`: 0.36 s | `test_case_c4_profile`: 9.49 s | 15 s |
| Whole pytest | 590.86 s wall; 2654 passed, 6 failed, 1 skipped | 638.15 s wall; 2678 passed, 1 skipped | 348.44 s wall; 2775 passed, 1 skipped | 2.5× chunk-1 baseline = 1,477.15 s |

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
commit, `65f4f4c7` (after the merge of main's QA round and the review fixes), taken from the full verification run recorded in
`evidence/verification/` (the whole pytest with `--durations=5`, the focused QA
suite with `--durations=3`, and the showcase drift check's wall time). Every
budget is within its limit, including the slow-case ceiling that the pre-change
base and chunk 2 both breached: the slowest generated case, `test_case_c4_profile`, runs
in 9.49 s on this machine. The committed showcase is byte-identical to chunk 2's.

## #588 — dose-stamped ISF conversion (ADR 563, slice 1)

#588 adds one QA case, `ic-dose-stamped-isf`, and re-copies no existing
expectation. The budgets are re-measured against AGENTS.md's current limits,
none raised; the whole-pytest ceiling is still 2.5× the chunk-1 baseline above.

| Budget | #588 measurement | Limit |
| --- | ---: | ---: |
| Committed showcase size | 1,486,848 bytes (unchanged; drift check current) | 25 MiB (26,214,400 bytes) |
| Showcase drift check | 0.45 s wall | 30 s |
| Focused QA suite (`tests/test_qa_e2e_cases.py tests/test_gen_qa_e2e_db.py`) | 77.89 s wall; 101 passed | 150 s |
| Slowest generated case | `test_case_showcase`: 2.88 s | 30 s |
| Whole pytest (`9e691e74`, the pushed commit) | 420.12 s; 2669 passed, 1 skipped | 1,477.15 s |

Adding the case outside the order's Expected diff: its name joins the catalog
list in `tests/test_qa_e2e_cases.py` and `EXPECTED_ACTIVE_KINDS` in
`tests/test_pattern_replay.py` (`None`: it holds no Focus or Trial), as
`ic-block-evidence` did.

Also outside it: `tests/test_annotation_register.py` built its carb-ratio rows
from unstamped meals whose only settings capture came after them, so under ADR
563 rule 3 they were no longer converted and one case
(`band_includes_programmed_start_high`) stopped reaching its branch. The capture
now lands before the meals, restoring the programmed ISF of 50 the cases were
built around. It was the one failure in an earlier whole-pytest run on
`e9dce945` (413.78 s; 2668 passed, 1 failed, 1 skipped), before this fix.

## #589 — dose-stamped ISF conversion (ADR 563, slice 2)

#589 adds one QA case, `behavioral-carb-undercount-segment`, and re-copies no
existing expectation. The budgets are re-measured against AGENTS.md's current
limits, none raised; the whole-pytest ceiling is still 2.5× the chunk-1 baseline
above.

| Budget | #589 measurement | Limit |
| --- | ---: | ---: |
| Committed showcase size | 1,486,848 bytes (unchanged; drift check current) | 25 MiB (26,214,400 bytes) |
| Showcase drift check | 0.49 s wall | 30 s |
| Focused QA suite (`tests/test_qa_e2e_cases.py tests/test_gen_qa_e2e_db.py`) | 55.56 s wall; 102 passed | 150 s |
| Slowest generated case | `test_case_showcase`: 2.23 s | 30 s |
| Whole pytest | in the pull request's verification output, run once on the pushed commit | 1,477.15 s |

As in #588, the new case's name joins the catalog list in
`tests/test_qa_e2e_cases.py` and `EXPECTED_ACTIVE_KINDS` in
`tests/test_pattern_replay.py` (`None`: it holds no Focus or Trial), outside the
order's Expected diff.
