# QA E2E coverage-era budgets

Tasks 1 and 2 record literal command output for all five measurements before
their coordinator ticks the task; the coordinator transcribes that output from
each chunk report into this file. The committed-size and drift measurements apply
only to the unchanged showcase store. Every baseline figure in the table is
reference-only. Only the whole-pytest baseline measured in-session before chunk
1's edits is load-bearing; chunk 2 reuses that figure without compounding it.

| Budget | Baseline measured | Limit |
| --- | ---: | ---: |
| Committed showcase database size | 2 MiB | 25 MiB |
| Showcase logical drift check | 0.13 s | 30 s |
| Focused QA suite | 5.69 s | 90 s |
| Single isolated case | 0.14 s | 15 s |
| Whole pytest wall time, local | Chunk 1's pre-change `real`; reference `real 137.69` s | 2.5× chunk 1's in-session baseline for both chunks |

Commands:

```sh
du -m mockups/qa-e2e.synthetic/harmonic.sqlite
/usr/bin/time -p uv run python scripts/gen_qa_e2e_db.py --check
/usr/bin/time -p uv run python -m pytest tests/test_gen_qa_e2e_db.py tests/test_qa_e2e_cases.py
uv run python -m pytest tests/test_qa_e2e_cases.py --durations=0 -p no:cacheprovider
/usr/bin/time -p uv run python -m pytest
```

`tests/test_qa_e2e_cases.py` generates one named test method per `QA_CASES` entry.
Those methods replace both catalog execution loops; the tuple and decoded-name-set
pins are execution-free. The single-case measurement is the slowest
`test_case_*` entry in `--durations=0`, not the slowest entry overall: the
showcase-materialization and perturbation tests remain. At the start of chunk 1,
before edits, its worker runs the whole-suite timing command on that machine and
records the `real` line. Both chunks use 2.5× that value as their ceiling; chunk 2
reuses it without compounding. The 2026-09-01 measurement
on this machine—2120 passed, 1 skipped, 185 warnings; `real 137.69`—is a reference
only. CI run 33562270356's `Run tests` duration of 2 min 57 s is also a reference.

Task 1 raises only `.github/workflows/ci.yml`'s `pytest (backend)`
`timeout-minutes` from 10 to 15. The expanded catalog and whole-suite timing gate
need headroom beyond the historical 2 min 57 s run while retaining a finite,
fail-closed job timeout; no other CI setting changes.

On any budget breach, or whenever a worker session ends before its sub-order's
Done-when, the worker commits source and tests on the chunk branch, does not touch
`mockups/qa-e2e.synthetic/harmonic.sqlite`, does not open a pull request, posts the
five measurements or stopping point on #192, and stops. The unchanged
showcase-only drift check remains green. Only a newer lock on #192 may resume the
chunk. No measurement budget is raised in this phase; the CI job timeout change
above supplies execution headroom without changing an acceptance limit.

Before sub-order 2 authors the remaining I:C eras, it builds one mature 91-day
I:C case and records literal output for all five measurements. If any limit is
exceeded, it posts the measurements on #192 and stops under the same rule.
