# QA E2E coverage-era budgets

Tasks 1 and 2 record literal command output for all five measurements before
their coordinator ticks the task; the coordinator transcribes that output from
each chunk report into this file. The committed-size and drift measurements apply
only to the unchanged showcase store. Every baseline figure in the table is
reference-only. Only the whole-pytest baseline measured in-session before chunk
1's edits is load-bearing. After the verified chunk-1 merge, the coordinator
transcribes its literal `real` here; chunk 2 reads that value from this file
without compounding it. If the value is absent, chunk 2 stops and comments on
#192 instead of re-measuring.

| Budget | Captured baseline | Limit |
| --- | ---: | ---: |
| Committed showcase database size | 2 MiB | 25 MiB |
| Showcase logical drift check | `real 0.15` s | 30 s |
| Focused QA suite | `real 5.92` s | 90 s |
| Mature isolated-case representative | `real 3.04` s | 15 s |
| Whole pytest wall time, local | Chunk 1's pre-change `real`; reference `real 137.69` s | 2.5× chunk 1's in-session baseline for both chunks |

The captured command output below is byte-complete.

### Mature 91-inclusive-day representative

Command:

```sh
/usr/bin/time -p uv run python openspec/changes/qa-e2e-coverage-eras/evidence/span-probe.py
```

Output:

```text
30-day showcase observed_days: [29]
30-day showcase I:C states: [('All day', 'collecting')]
30-day showcase ISF row count: 1
long-span showcase observed_days: [90]
long-span showcase I:C states: [('All day', 'numeric')]
real 3.04
user 2.91
sys 0.05
```

### Focused suite and current per-test durations

Command:

```sh
/usr/bin/time -p uv run python -m pytest tests/test_qa_e2e_cases.py tests/test_gen_qa_e2e_db.py --durations=0 -p no:cacheprovider
```

Output:

```text
============================= test session starts ==============================
platform darwin -- Python 3.12.13, pytest-9.1.1, pluggy-1.6.0
rootdir: /Users/connor/worktrees/harmonic/192
configfile: pyproject.toml
plugins: anyio-4.14.1, requests-mock-1.12.1
collected 10 items

tests/test_qa_e2e_cases.py ......                                        [ 60%]
tests/test_gen_qa_e2e_db.py ....                                         [100%]

=============================== warnings summary ===============================
tests/test_qa_e2e_cases.py::QaE2ECasesTest::test_each_catalog_case_runs_the_real_producer_composition
tests/test_qa_e2e_cases.py::QaE2ECasesTest::test_each_catalog_case_runs_the_real_producer_composition
tests/test_qa_e2e_cases.py::QaE2ECasesTest::test_showcase_rejects_each_perturbed_evidence_expectation
tests/test_qa_e2e_cases.py::QaE2ECasesTest::test_showcase_rejects_each_perturbed_evidence_expectation
  /Users/connor/worktrees/harmonic/192/ciq_autotune/store.py:753: DeprecationWarning: The default datetime adapter is deprecated as of Python 3.12; see the sqlite3 documentation for suggested replacement recipes
    return self.conn.execute(sql, params).fetchall()

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
============================== slowest durations ===============================
2.41s call     tests/test_qa_e2e_cases.py::QaE2ECasesTest::test_each_catalog_case_runs_the_real_producer_composition
2.40s call     tests/test_qa_e2e_cases.py::QaE2ECasesTest::test_showcase_rejects_each_perturbed_evidence_expectation
0.23s call     tests/test_gen_qa_e2e_db.py::QaE2EDatabaseGeneratorTest::test_check_rejects_logical_database_drift
0.22s call     tests/test_gen_qa_e2e_db.py::QaE2EDatabaseGeneratorTest::test_check_compares_a_generated_store_logically
0.13s call     tests/test_gen_qa_e2e_db.py::QaE2EDatabaseGeneratorTest::test_check_accepts_the_committed_database
0.10s call     tests/test_gen_qa_e2e_db.py::QaE2EDatabaseGeneratorTest::test_cli_writes_stamped_showcase_only_store
0.09s call     tests/test_qa_e2e_cases.py::QaE2ECasesTest::test_showcase_materializes_a_dense_thirty_day_source_window
0.03s call     tests/test_qa_e2e_cases.py::QaE2ECasesTest::test_a_perturbed_expectation_fails_the_whole_set_check
0.01s call     tests/test_qa_e2e_cases.py::QaE2ECasesTest::test_setting_recommendation_case_runs_the_real_producer_composition

(24 durations < 0.005s hidden.  Use -vv to show these durations.)
======================== 10 passed, 4 warnings in 5.70s ========================
real 5.92
user 5.63
sys 0.16
```

### Committed showcase size

Command:

```sh
du -m mockups/qa-e2e.synthetic/harmonic.sqlite
```

Output:

```text
2	mockups/qa-e2e.synthetic/harmonic.sqlite
```

### Showcase logical drift

Command:

```sh
/usr/bin/time -p uv run python scripts/gen_qa_e2e_db.py --check
```

Output:

```text
qa-e2e database: current (/Users/connor/worktrees/harmonic/192/mockups/qa-e2e.synthetic/harmonic.sqlite)
real 0.15
user 0.12
sys 0.02
```

Today's suite has no generated `test_case_*` methods yet. Its slowest entry is
the showcase-bearing catalog execution test at 2.41 s, not a per-case baseline.
The 3.04 s span-probe run is the mature-case representative because it drives a
91-inclusive-day dense store through production `analyze`. The generated methods
will replace both catalog execution loops; the tuple and decoded-name-set pins
remain execution-free. Their eventual slowest `test_case_*` duration is the
load-bearing post-change single-case measurement.

At the start of chunk 1, before edits, its worker runs
`/usr/bin/time -p uv run python -m pytest` on that machine and records the `real`
line. Both chunks use 2.5× that value as their ceiling; chunk 2 reuses it without
compounding. Keep this recorded reference block:

```text
2120 passed, 1 skipped, 185 warnings
real 137.69
```

It is reference-only. CI run 33562270356's `Run tests` duration of 2 min 57 s is
also a reference.

Task 1 raises only `.github/workflows/ci.yml`'s `pytest (backend)`
`timeout-minutes` from 10 to 12. The same 2.5× rule applied to CI's 2 min 57 s
reference yields 7 min 23 s for pytest; adding 3 min for the other backend steps
yields 11 min, rounded up to a 12-minute fail-closed job timeout. No other CI
setting changes. A backend-job timeout on the ticket pull request is a budget
breach and follows the stop rule below.

On any budget breach, or whenever a worker session ends before its sub-order's
Done-when, the worker commits source and tests on the chunk branch, does not touch
`mockups/qa-e2e.synthetic/harmonic.sqlite`, does not open a pull request, posts the
five measurements or stopping point on #192, and stops. The unchanged
showcase-only drift check remains green. Only a newer lock on #192 may resume the
chunk. No measurement budget is raised in this phase; the CI job timeout change
above supplies execution headroom without changing an acceptance limit.

After sub-order 1's first representative basal case, it projects the 11 remaining
named basal cases. After sub-order 2's first representative ISF case and first
mature I:C case, it projects the remaining cases from the design table's totals
of 3 ISF and 8 I:C. Each gate computes `Σ over remaining planned cases of
(measured representative single-case time for that family) + current focused-suite
total` against 90 seconds. If a projection or any measured limit is exceeded, the
worker posts the measurements on #192 and stops under the same rule.

Before either family-specific representative exists, the captured mature-store
time is a conservative proxy: `11 × 3.04 s + 5.92 s = 39.36 s` for chunk 2,
leaving 50.64 s under the 90 s limit. The gate remains fixed at 90 s and replaces
the proxy with the measured ISF and I:C representative times once they exist.
