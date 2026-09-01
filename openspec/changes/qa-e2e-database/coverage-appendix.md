# QA E2E database coverage appendix

Measured locally on the showcase-only generated store.

| Budget | Command | Measured | Limit |
| --- | --- | ---: | ---: |
| Database size | `du -m "$TASK_TMP/harmonic.sqlite"` after `uv run python scripts/gen_qa_e2e_db.py --out "$TASK_TMP/harmonic.sqlite"` | 1 MiB | 25 MiB |
| Logical drift check | `/usr/bin/time -p uv run python scripts/gen_qa_e2e_db.py --check --out "$TASK_TMP/harmonic.sqlite"` | 0.07 s | 30 s |
| New suite | `/usr/bin/time -p uv run python -m pytest tests/test_gen_qa_e2e_db.py tests/test_qa_e2e_cases.py` | 0.66 s | 90 s |
| Single case | `/usr/bin/time -p uv run python -m pytest tests/test_qa_e2e_cases.py -k setting_recommendation` | 0.19 s | 15 s |
