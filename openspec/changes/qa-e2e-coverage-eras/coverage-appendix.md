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

The coordinator-captured timestamps in `generated-facts.md` give:

```text
backend job: 21:39:39–21:43:01 = 202 s = 3:22
Run tests:   21:39:49–21:42:46 = 177 s = 2:57
other steps: 202 − 177 = 25 s = 0:25
```

The projected 23-case delta is `23 × 3.04 = 69.92 s`. The timeout derivation is
`ceil((2.5 × 177 + 25 + 69.92) / 60) = ceil(8.957) = 9 minutes`. The existing
10-minute backend timeout already exceeds the derived value, so no CI workflow
edit is necessary. A backend-job timeout on the ticket pull request remains a
budget breach and follows the stop rule below.

On any budget breach, or whenever a worker session ends before its sub-order's
Done-when, the worker commits source and tests on the chunk branch, does not touch
`mockups/qa-e2e.synthetic/harmonic.sqlite`, does not open a pull request, posts the
five measurements or stopping point on #192, and stops. The unchanged
showcase-only drift check remains green. Only a newer lock on #192 may resume the
chunk. No measurement budget is raised in this phase.

After sub-order 1's first representative basal case, it projects the 11 remaining
named basal cases. After sub-order 2's first representative ISF case and first
mature I:C case, it projects the remaining cases from the design table's totals
of 3 ISF and 8 I:C. Each gate computes `Σ over remaining planned cases of
(measured representative single-case time for that family) + current focused-suite
total` against 90 seconds. If a projection or any measured limit is exceeded, the
worker posts the measurements on #192 and stops under the same rule.

Before generated per-case measurements exist, the captured proxy projects chunk
1's POST-change focused-suite total as `12 × 3.04 + 5.92 = 42.40 s`. Chunk 2's
pre-authoring projection then uses that post-change total:
`11 × 3.04 + 42.40 = 75.84 s` (about 75.8 s), leaving
`90 − 75.84 = 14.16 s` (about 14 s) headroom. The 3.04 s span probe times its
whole process and overstates one catalog case. Chunk 1 records the actual
`test_case_*` durations and post-change focused-suite total here; the coordinator
transcribes them after the verified merge. Before authoring, chunk 2 re-projects
from that total and those measured basal per-case times, then replaces the family
proxies with its measured ISF and I:C representatives as they exist. A projected
breach stops under the existing rule. The 90 s limit is not raised.

## Chunk 1 measurements (coordinator transcription, 2026-09-02)

Recorded from the chunk-1 worker report and re-run by the coordinator on the
chunk branch at `a32664d`. Every value is inside its limit.

| Budget | Measured | Limit |
| --- | ---: | ---: |
| Database size | 2 MiB (`du -m`) | 25 MiB |
| Logical drift check | 0.17 s | 30 s |
| Focused QA suite (29 tests) | 6.56 s (`real`) | 90 s |
| Slowest `test_case_*` | 0.32 s wall (`test_case_basal_raise` alone); 0.03 s call duration in the suite | 15 s |
| Whole pytest (`real`) | 60.71 s post-change; 62.93 s pre-change in-session baseline; ceiling 157.33 s (2.5×) | 2.5× baseline |

Coordinator re-run: 2139 passed, 1 skipped; `git diff --quiet origin/main --
mockups/qa-e2e.synthetic/harmonic.sqlite` exit 0; `scan-public-tree: 387
file(s) scanned, 0 finding(s)`; Node runner 562 pass, 0 fail. Chunk 2's ceiling
baseline is the 62.93 s figure above. Chunk 2's pre-authoring projection input:
focused suite 6.56 s.
