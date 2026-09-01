# QA E2E coverage-era budget appendix

Tasks 1 and 2 inherit the showcase-only measurements below from
`openspec/changes/archive/2026-09-01-qa-e2e-database/coverage-appendix.md`.
Each chunk records all five post-append values before ticking its task.

| Budget | Baseline measured | Limit |
| --- | ---: | ---: |
| Database size | 2 MiB | 25 MiB |
| Logical drift check | 0.13 s | 30 s |
| Focused QA suite | 5.69 s | 90 s |
| Single isolated case (slowest `--durations=0` call for any catalog case) | 0.14 s | 15 s |
| Whole pytest wall time | not previously recorded | 8 min |

Commands (`TASK_TMP` is a scratch directory the worker creates; the generator
writes the candidate database there before any tracked artifact is replaced):

```sh
TASK_TMP="$(mktemp -d)"
uv run python scripts/gen_qa_e2e_db.py --out "$TASK_TMP/harmonic.sqlite"
du -m "$TASK_TMP/harmonic.sqlite"
/usr/bin/time -p uv run python scripts/gen_qa_e2e_db.py --check --out "$TASK_TMP/harmonic.sqlite"
/usr/bin/time -p uv run python -m pytest tests/test_gen_qa_e2e_db.py tests/test_qa_e2e_cases.py
uv run python -m pytest tests/test_qa_e2e_cases.py --durations=0 -p no:cacheprovider
/usr/bin/time -p uv run python -m pytest
```

The whole-suite limit leaves two minutes of runner margin beneath the backend
job's ten-minute timeout (`.github/workflows/ci.yml:19`). The single-case value is
the slowest call reported by `--durations=0`, not a `-k` selection.

On a budget breach, or whenever a worker session ends before its sub-order's
Done-when, the worker commits its source and tests on the chunk branch, does not
regenerate or commit `mockups/qa-e2e.synthetic/harmonic.sqlite`, does not open a
pull request, posts the five measurements or stopping point as a comment on #192,
and stops. If generator behavior has changed, a red generator `--check` and red
committed-database acceptance test on that branch are the expected artifact of
the stop. Only a newer lock on #192 may resume the chunk. No limit is raised in
this phase.
