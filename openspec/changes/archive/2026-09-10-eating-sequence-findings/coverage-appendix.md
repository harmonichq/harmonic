# QA coverage appendix — #342

Recorded 2026-09-10. The parent harmonic-v2 coverage appendix's operator ruling
of 2026-09-09 fixes the chunk-1 baseline at **160 seconds**, hence the unchanged
full-pytest ceiling of **400 seconds** (2.5×). No budget or recipe was trimmed.

| Budget | Ceiling | c4 measurement | Disposition |
| --- | ---: | ---: | --- |
| Committed showcase size | 25 MiB | 1,314,816 bytes | Pass; unchanged |
| Showcase generator drift | 30 s | 0.990 s wall | Pass |
| Focused QA gate | 90 s | 61.451 s wall, 81 passed | Pass |
| Slowest generated case | 15 s | 5.47 s, showcase | Pass |
| Full pytest | 400 s | 431.899 s wall, 431.37 s pytest | Contended; coordinator re-measure pending |

The focused gate was `uv run python -m pytest tests/test_lever_closed_set_mirrors.py
tests/test_gen_qa_e2e_db.py tests/test_qa_e2e_cases.py --durations=70` (one command).
Showcase drift used `uv run python scripts/gen_qa_e2e_db.py --check`.
The showcase was never opened writable.

The first full run reported 2 failed, 2480 passed, 1 skipped in 443.59 seconds
(444.050 seconds wall), overlapping generator and coordinator browser activity.
After output regeneration and the settings stub method, the worktree-isolated run
reported 1 failed, 2481 passed, 1 skipped in 431.37 seconds (431.899 wall).
Amendment 2 records that another ticket's full suite was running on the same
machine: the coordinator ruled this contention rather than this ticket's cost and
will measure alone after that worker finishes. These measurements do not establish
an uncontended pass or authorize raising 400 seconds.

## Twelve-recipe contribution

The QA module alone, `uv run python -m pytest tests/test_qa_e2e_cases.py
--durations=70`, passed both comparisons:

| Roster | Tests passed | Pytest seconds | Wall seconds |
| --- | ---: | ---: | ---: |
| Previous 45 recipes | 58 | 35.36 | 35.588 |
| Current 57 recipes | 70 | 38.46 | 38.704 |

Measured increase: **3.116 seconds**. The twelve printed test-call durations total
8.08 seconds; a single before/after wall-time difference includes timing variation
and does not exactly assign the full-suite excess. The baseline temporarily removed
only the twelve new catalog entries, checked the remaining roster against the
previous c4 parent commit, and used that commit's QA test module. Refreshed legacy
literal expectations remained compatible with the merged c2 producer. Both files
were restored byte-for-byte; the committed catalog retains all 57 recipes.

The remaining full-run failure was the scenario test stub's missing carb_entries.
Amendment 2 adds the empty roster method. The touched scenario and closed-set
modules then passed all four tests in 0.06 seconds (0.428 wall). Full pytest was
not repeated, as directed. Its one skip is the existing real-database DIA sweep;
no real data was used.
