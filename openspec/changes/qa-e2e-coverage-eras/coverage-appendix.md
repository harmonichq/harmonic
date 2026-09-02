# QA E2E coverage-era budgets

Tasks 1 and 2 record all five measurements before their coordinator ticks the
task. The committed-size and drift measurements apply only to the unchanged
showcase store.

| Budget | Baseline measured | Limit |
| --- | ---: | ---: |
| Committed showcase database size | 2 MiB | 25 MiB |
| Showcase logical drift check | 0.13 s | 30 s |
| Focused QA suite | 5.69 s | 90 s |
| Single isolated case | 0.14 s | 15 s |
| Whole pytest wall time, local | `real 137.69` s | 344.23 s (2.5× local baseline) |

Commands:

```sh
du -m mockups/qa-e2e.synthetic/harmonic.sqlite
/usr/bin/time -p uv run python scripts/gen_qa_e2e_db.py --check
/usr/bin/time -p uv run python -m pytest tests/test_gen_qa_e2e_db.py tests/test_qa_e2e_cases.py
uv run python -m pytest tests/test_qa_e2e_cases.py --durations=0 -p no:cacheprovider
/usr/bin/time -p uv run python -m pytest
```

`tests/test_qa_e2e_cases.py` generates one named test method per `QA_CASES` entry,
so the slowest `--durations=0` call is the single-case measurement rather than a
shared catalog loop. The whole-suite baseline above was measured on this machine
on 2026-09-01: 2120 passed, 1 skipped, 185 warnings; `real 137.69`. CI run
33562270356's `Run tests` duration of 2 min 57 s is a reference only and does not
set the local limit.

On any budget breach, or whenever a worker session ends before its sub-order's
Done-when, the worker commits source and tests on the chunk branch, does not touch
`mockups/qa-e2e.synthetic/harmonic.sqlite`, does not open a pull request, posts the
five measurements or stopping point on #192, and stops. The unchanged
showcase-only drift check remains green. Only a newer lock on #192 may resume the
chunk. No limit is raised in this phase.
