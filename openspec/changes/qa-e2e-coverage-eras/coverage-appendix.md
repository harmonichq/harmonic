# QA E2E coverage-era budget appendix

Task 1 inherits the showcase-only measurements below from
`openspec/changes/archive/2026-09-01-qa-e2e-database/coverage-appendix.md`.
The implementation records the post-append values with the same commands before
ticking task 1.

| Budget | Baseline measured | Limit |
| --- | ---: | ---: |
| Database size | 2 MiB | 25 MiB |
| Logical drift check | 0.13 s | 30 s |
| Focused QA suite | 5.69 s | 90 s |
| Single isolated case (slowest `--durations=0` call for any catalog case) | 0.14 s | 15 s |

Commands (`TASK_TMP` is a scratch directory the implementer creates for the
measurement run; the generator writes the candidate database there first):

```sh
TASK_TMP="$(mktemp -d)"
uv run python scripts/gen_qa_e2e_db.py --out "$TASK_TMP/harmonic.sqlite"
du -m "$TASK_TMP/harmonic.sqlite"
/usr/bin/time -p uv run python scripts/gen_qa_e2e_db.py --check --out "$TASK_TMP/harmonic.sqlite"
/usr/bin/time -p uv run python -m pytest tests/test_gen_qa_e2e_db.py tests/test_qa_e2e_cases.py
uv run python -m pytest tests/test_qa_e2e_cases.py --durations=0 -p no:cacheprovider
```

If any limit is exceeded, stop before committing the replacement database:
post the four measurements and the exceeded limit as a comment on #192, leave
the committed database unchanged, and end the session there. Resuming needs a
newer lock on #192 that records how the eras are split. Do not raise a limit in
this phase.
