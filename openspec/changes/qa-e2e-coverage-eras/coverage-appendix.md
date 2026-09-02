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
| Whole pytest wall time | CI run 33562270356: `Run tests` 2 min 57 s | 6 min |

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

CI run 33562270356 (2026-09-01, `origin/main` at `8e8bdfe`) measured the backend
job at 3 min 22 s total: `Run tests` took 2 min 57 s and every other step took 25
s combined. The whole-pytest limit is derived as 10 min job timeout − 0.5 min
non-pytest steps − 0.5 min QA drift-step limit − 3 min margin = 6 min. The limit
is not raised in this phase and `.github/workflows/ci.yml` stays untouched. The
single-case value is the slowest call reported by `--durations=0`, not a `-k`
selection.

On a budget breach, or whenever a worker session ends before its sub-order's
Done-when, the worker commits its source and tests on the chunk branch, does not
regenerate or commit `mockups/qa-e2e.synthetic/harmonic.sqlite`, does not open a
pull request, posts the five measurements or stopping point as a comment on #192,
and stops. If generator behavior has changed, a red generator `--check` and red
committed-database acceptance test on that branch are the expected artifact of
the stop. Only a newer lock on #192 may resume the chunk. No limit is raised in
this phase.
