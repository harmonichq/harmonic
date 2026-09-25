# #464 coverage appendix

Chunk 2 (`ic-block-evidence` QA case, tasks 6-7) is the first sub-order in this
change to touch the QA coverage budgets, so this file's first table is also
this change's chunk-1 baseline. All inputs are manufactured (`scripts/qa_e2e_cases.py`).

| Budget | Chunk-2 measurement | Limit |
| --- | ---: | ---: |
| Committed showcase size | 1,409,024 bytes | 25 MiB (26,214,400 bytes) |
| Showcase drift check | 0.286 s wall | 30 s |
| Focused QA suite (`tests/test_qa_e2e_cases.py tests/test_gen_qa_e2e_db.py`) | 77.59 s wall; 94 passed | 90 s |
| Slowest generated case | `test_case_ic_block_evidence`: 0.36 s | 15 s |
| Whole pytest | 638.15 s wall; 2678 passed, 1 skipped, 1 subtest failed | 2.5× chunk-1 baseline (this run establishes it: ceiling 1,595.4 s) |

The first four budgets are within their limits and `git diff --stat -- mockups/qa-e2e.synthetic`
is empty (the committed showcase, which materializes a different case, is
untouched). The whole-pytest run establishes this change's chunk-1 baseline
(638.15 s) rather than breaching one, since no earlier measurement exists in
this appendix.

## Two findings outside this chunk's file scope

**`tests/test_pattern_replay.py::PatternReplayTest::test_adr_391_catalog_replay_through_public_producers`
fails on the new case.** It iterates every `QA_CASES` entry against a literal
`EXPECTED_ACTIVE_KINDS` dict keyed by case name and raises `KeyError:
'ic-block-evidence'` for the new entry — the case never touches
`watched_change`/Focus/Trial state, so the correct value is
`"ic-block-evidence": None`, matching every other non-c3/c4 case. Sub-order 2's
file list does not include `tests/test_pattern_replay.py`, so this one-line
addition is left for the coordinator rather than made here.

**`test_case_c4_profile` is a pre-existing 17.35 s slow-case breach of the 15 s
ceiling, not introduced by this chunk.** It is unrelated to the `ic-block-evidence`
recipe (a c4/watched-change case this chunk does not touch); `test_case_ic_block_evidence`
itself runs in 0.36 s. Flagged for visibility, not fixed here, since the c4
recipe is outside tasks 6-7's pinned source.
