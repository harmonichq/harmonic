# Generated facts — QA E2E coverage eras

## Isolated-span probe

`evidence/span-probe.py` is frozen evidence of the pre-change tree at
`origin/main` `6defd69`. It is not re-run after chunk 1, and no chunk repairs it.

Command:

```sh
env UV_CACHE_DIR=/tmp/harmonic-192-uv-cache uv run python openspec/changes/qa-e2e-coverage-eras/evidence/span-probe.py
```

Complete output:

```text
30-day showcase observed_days: [29]
30-day showcase I:C states: [('All day', 'collecting')]
30-day showcase ISF row count: 1
long-span showcase observed_days: [90]
long-span showcase I:C states: [('All day', 'numeric')]
```

The frozen probe materializes `showcase` unchanged, then materializes it again
with the same dense recipe extended to 91 inclusive calendar days. Its pre-change
implementation spelled that extension as `BLOCK_WINDOW_DAYS + _BOLUS_LEADIN`;
the current contract instead states the analyzer rule directly: the earliest
event is at least `BLOCK_WINDOW_DAYS` (90 days) back from `now`, with no I:C block-
lane lead-in. Both use production `analyze`. The short store is forced to
collecting; the long store's `numeric` state proves maturity because a sub-90
block is forced to `collecting`. Its printed `observed_days: [90]` is the probe's
`row.get("days_observed", BLOCK_WINDOW_DAYS)` fallback, not a serialized analyzer
value. The short store's
single ISF row also shows that row presence alone does not exercise the prior-
decision replay that requires the ISF family span.

## Serialized analyzer-row shapes

`evidence/row-shape-probe.py` is frozen evidence from the pre-implementation
tree at `f934a4a1f0ebd8e76bcd936b5b9a4518123105d0`. It materializes the existing
showcase and the same 91-inclusive-day dense store as the span probe, then runs
the catalog's public `execute_case` production composition.

Command:

```sh
env UV_CACHE_DIR=/tmp/harmonic-192-uv-cache uv run python openspec/changes/qa-e2e-coverage-eras/evidence/row-shape-probe.py
```

Complete output:

```text
30-day showcase basal row keys: ["annotation", "asserts_move", "current", "days", "direction", "estimate", "evidence", "label", "recommended", "safety_status", "slot"]
30-day showcase basal safety_status histogram: [{"count": 2, "values": ["lower"]}, {"count": 41, "values": ["no change"]}, {"count": 5, "values": ["no data"]}]
30-day showcase ISF row keys: ["annotation", "asserts_move", "block_id", "current", "estimate", "evidence", "label", "parameter", "recommended", "start_min"]
30-day showcase ISF direction/asserts_move histogram: [{"count": 1, "values": [null, false]}]
30-day showcase I:C row keys: ["annotation", "asserts_move", "block_id", "current_values", "days_needed", "days_observed", "direction", "end_min", "estimate", "evidence", "harm", "held_reason", "impact_u_day", "label", "member_start_mins", "n_meals", "n_runs", "priority", "recommended", "recurrence", "recurrence_channel", "regime", "start_min", "state"]
30-day showcase I:C state/direction/held_reason/asserts_move/days_observed-presence histogram: [{"count": 1, "values": ["collecting", null, null, false, true]}]
91-day showcase basal row keys: ["annotation", "asserts_move", "current", "days", "direction", "estimate", "evidence", "label", "recommended", "safety_status", "slot"]
91-day showcase basal safety_status histogram: [{"count": 2, "values": ["lower"]}, {"count": 41, "values": ["no change"]}, {"count": 5, "values": ["no data"]}]
91-day showcase ISF row keys: ["annotation", "asserts_move", "block_id", "current", "estimate", "evidence", "label", "parameter", "recommended", "start_min"]
91-day showcase ISF direction/asserts_move histogram: [{"count": 1, "values": [null, false]}]
91-day showcase I:C row keys: ["annotation", "asserts_move", "block_id", "current_values", "direction", "end_min", "estimate", "evidence", "harm", "held_reason", "impact_u_day", "label", "member_start_mins", "n_meals", "n_runs", "priority", "recommended", "recurrence", "recurrence_channel", "regime", "start_min", "state"]
91-day showcase I:C state/direction/held_reason/asserts_move/days_observed-presence histogram: [{"count": 1, "values": ["numeric", null, null, false, false]}]
```

### Serialized support fields

The frozen row-shape probe does not print nested support fields, so
`evidence/support-shape-probe.py` uses the same public catalog materializer and
production composition to record them without editing either frozen probe.

Command:

```sh
uv run python openspec/changes/qa-e2e-coverage-eras/evidence/support-shape-probe.py
```

Complete output:

```text
support field names: {"basal": {"evidence": ["directional_support_count"]}, "ic": {"evidence.eligibility": ["effective_run_count"], "top_level": ["n_runs"]}, "isf": {"evidence": ["n_steps"]}}
showcase support values: {"basal.directional_support_count": 0, "ic.effective_run_count": 16.0, "ic.n_runs": 16, "isf.n_steps": 3426}
```

## Existing behavioral-precedence depth

Command:

```sh
env UV_CACHE_DIR=/tmp/harmonic-192-uv-cache uv run python -c 'import sqlite3,tempfile; from pathlib import Path; from datetime import datetime; from ciq_autotune.store import Store; from scripts.qa_e2e_cases import QA_CASES,materialize_case; p=Path(tempfile.mkdtemp())/"case.sqlite"; c=next(x for x in QA_CASES if x.name=="behavioral-precedence"); s=Store.open(str(p)); materialize_case(s,c); s.close(); q=sqlite3.connect(p); start=q.execute("SELECT MIN(t) FROM (SELECT t FROM cgm_readings UNION ALL SELECT t FROM bolus_events UNION ALL SELECT t FROM basal_events)").fetchone()[0]; end=q.execute("SELECT MAX(t) FROM (SELECT t FROM cgm_readings UNION ALL SELECT t FROM basal_events)").fetchone()[0]; print(f"earliest={start}"); print(f"latest={end}"); print(f"inclusive_calendar_days={(datetime.fromisoformat(end).date()-datetime.fromisoformat(start).date()).days+1}")'
```

Complete output:

```text
earliest=2024-06-25 09:00:00
latest=2024-06-29 22:10:00
inclusive_calendar_days=5
```

The start union includes basal, CGM, and bolus events. The end union includes only
basal and CGM, matching production's store-derived `now`; `profile_settings` is
excluded from both, so the earlier settings snapshot does not inflate the span.

## Closed document inventory

Command:

```sh
rg -l '(qa-e2e|qa_e2e|revise-e2e|harmonic\.sqlite|gen_qa_e2e_db)' AGENTS.md .claude/launch.json .github docs harness openspec scripts tests frontend mockups | sort
```

Complete output:

```text
.claude/launch.json
.github/workflows/ci.yml
AGENTS.md
docs/scope/101-occurrence-roster-vertical-keys.md
docs/scope/135-evidence-canvas-build.md
docs/scope/189-qa-database.md
docs/scope/204-glucose-clock-strip-review.md
docs/scope/align-keyboard-focus.md
docs/scope/cohort-evidence-state-labels.md
docs/scope/diagnose-align-inert.md
docs/scope/diagnose-align-inspector-edge.md
docs/scope/diagnose-drill-in-keeps-user-scope.md
docs/scope/diagnose-finding-case-files.md
docs/scope/diagnose-finding-drill-focus.md
docs/scope/dose-stamped-information-findings.md
docs/scope/harness-story-coverage.md
docs/scope/highs-attribution-gap.md
docs/scope/ic-history-event-internals.md
docs/scope/isf-staging-predicate.md
docs/scope/retire-legacy-basal-ribbon.md
docs/scope/retire-legacy-occurrences-popup.md
harness/README.md
mockups/finding-evidence-routing.behavior.md
openspec/changes/announced-meal-low-ownership/design.md
openspec/changes/archive/2026-08-28-star-means-keep/design.md
openspec/changes/archive/2026-08-28-star-means-keep/generated-facts.md
openspec/changes/archive/2026-08-29-glucose-chart-legibility/design.md
openspec/changes/archive/2026-08-29-glucose-chart-legibility/evidence/README.md
openspec/changes/archive/2026-08-29-glucose-chart-legibility/generated-facts.md
openspec/changes/archive/2026-08-30-dark-retheme-diagnose-workstation/evidence/README.md
openspec/changes/archive/2026-08-30-dark-retheme-diagnose-workstation/generated-facts.md
openspec/changes/archive/2026-08-30-tablet-scrim-drag/design.md
openspec/changes/archive/2026-08-30-tablet-scrim-drag/generated-facts.md
openspec/changes/archive/2026-09-01-qa-e2e-database/coverage-appendix.md
openspec/changes/archive/2026-09-01-qa-e2e-database/design.md
openspec/changes/archive/2026-09-01-qa-e2e-database/migration-checklist.md
openspec/changes/archive/2026-09-01-qa-e2e-database/proposal.md
openspec/changes/archive/2026-09-01-qa-e2e-database/tasks.md
openspec/changes/basal-slot-head-state/design.md
openspec/changes/basal-slot-head-state/evidence/README.md
openspec/changes/by-event-window-membership/design.md
openspec/changes/chrome-bar-surface-states/design.md
openspec/changes/chrome-bar-surface-states/evidence/review.md
openspec/changes/diagnose-align-hidden-render/evidence/README.md
openspec/changes/diagnose-align-inspector-edge/evidence/README.md
openspec/changes/diagnose-evidence-canvas/evidence/README.md
openspec/changes/diagnose-finding-case-files/design.md
openspec/changes/diagnose-finding-case-files/evidence/review.md
openspec/changes/diagnose-history-event-internals/design.md
openspec/changes/diagnose-occurrence-roster-keys/design.md
openspec/changes/dose-stamped-information-findings/evidence/issue-10/review.md
openspec/changes/event-chart-discovery/design.md
openspec/changes/event-chart-discovery/evidence/README.md
openspec/changes/filter-unrelated-basal-findings/design.md
openspec/changes/finding-chip-sift/design.md
openspec/changes/finding-evidence-routing/design.md
openspec/changes/isf-direction-only-ranking/design.md
openspec/changes/isf-direction-only-ranking/evidence/issue-223/manifest.txt
openspec/changes/isf-staging-predicate/design.md
openspec/changes/isf-staging-predicate/evidence/README.md
openspec/changes/pane-header-single-seam/design.md
openspec/changes/preserve-diagnose-theme-context/design.md
openspec/changes/qa-e2e-coverage-eras/coverage-appendix.md
openspec/changes/qa-e2e-coverage-eras/design.md
openspec/changes/qa-e2e-coverage-eras/evidence/row-shape-probe.py
openspec/changes/qa-e2e-coverage-eras/evidence/span-probe.py
openspec/changes/qa-e2e-coverage-eras/evidence/support-shape-probe.py
openspec/changes/qa-e2e-coverage-eras/generated-facts.md
openspec/changes/qa-e2e-coverage-eras/proposal.md
openspec/changes/qa-e2e-coverage-eras/specs/qa-e2e-database/spec.md
openspec/changes/qa-e2e-coverage-eras/tasks.md
openspec/changes/retire-legacy-basal-ribbon/design.md
openspec/changes/retire-legacy-occurrences-popup/design.md
openspec/changes/simplify-event-comparison-support-copy/design.md
openspec/changes/steady-data-case-file-wording/design.md
openspec/changes/steady-data-case-file-wording/evidence/README.md
scripts/check_public_links.py
scripts/gen_qa_e2e_db.py
scripts/gen_revise_e2e_db.py
tests/test_analyze_facade.py
tests/test_check_public_allowlist.py
tests/test_check_public_links.py
tests/test_finding_case_file_api.py
tests/test_gen_qa_e2e_db.py
tests/test_gen_revise_e2e_db.py
tests/test_qa_e2e_cases.py
```

## CI backend job timing

The coordinator captured this read-only GitHub query and complete output; the
triage worker has no network and did not re-run it.

Command:

```console
$ gh run view 33562270356 --repo harmonichq/harmonic --json jobs --jq '.jobs[] | select(.name=="pytest (backend)") | {name, startedAt, completedAt, steps: [.steps[] | {name, startedAt, completedAt}]}'
```

Complete output:

```text
{"completedAt":"2026-09-01T21:43:01Z","name":"pytest (backend)","startedAt":"2026-09-01T21:39:39Z","steps":[{"completedAt":"2026-09-01T21:39:41Z","name":"Set up job","startedAt":"2026-09-01T21:39:40Z"},{"completedAt":"2026-09-01T21:39:46Z","name":"Run actions/checkout@v5","startedAt":"2026-09-01T21:39:41Z"},{"completedAt":"2026-09-01T21:39:48Z","name":"Install uv","startedAt":"2026-09-01T21:39:46Z"},{"completedAt":"2026-09-01T21:39:49Z","name":"Sync deps (api + sync extras, from the lockfile)","startedAt":"2026-09-01T21:39:48Z"},{"completedAt":"2026-09-01T21:42:46Z","name":"Run tests","startedAt":"2026-09-01T21:39:49Z"},{"completedAt":"2026-09-01T21:42:47Z","name":"Check the generated I:C block fixtures are current","startedAt":"2026-09-01T21:42:46Z"},{"completedAt":"2026-09-01T21:42:47Z","name":"Check the generated evidence-canvas exploration is current","startedAt":"2026-09-01T21:42:47Z"},{"completedAt":"2026-09-01T21:42:48Z","name":"Check the generated annotation fixtures are current","startedAt":"2026-09-01T21:42:47Z"},{"completedAt":"2026-09-01T21:42:51Z","name":"Check the generated chart-builder fixtures are current","startedAt":"2026-09-01T21:42:48Z"},{"completedAt":"2026-09-01T21:42:53Z","name":"Check the committed demo fixture sets are current","startedAt":"2026-09-01T21:42:51Z"},{"completedAt":"2026-09-01T21:42:53Z","name":"Check the QA E2E synthetic database is current","startedAt":"2026-09-01T21:42:53Z"},{"completedAt":"2026-09-01T21:42:54Z","name":"Check the revise E2E synthetic database is current","startedAt":"2026-09-01T21:42:53Z"},{"completedAt":"2026-09-01T21:42:55Z","name":"Check the generated findings-projection fixtures are current","startedAt":"2026-09-01T21:42:54Z"},{"completedAt":"2026-09-01T21:42:55Z","name":"Check the generated I:C history-event fixtures are current","startedAt":"2026-09-01T21:42:55Z"},{"completedAt":"2026-09-01T21:42:56Z","name":"Check the generated current I:C block-evidence fixtures are current","startedAt":"2026-09-01T21:42:55Z"},{"completedAt":"2026-09-01T21:42:56Z","name":"Check the generated basal-night-evidence fixtures are current","startedAt":"2026-09-01T21:42:56Z"},{"completedAt":"2026-09-01T21:42:57Z","name":"Check the generated ISF rest-window evidence fixtures are current","startedAt":"2026-09-01T21:42:56Z"},{"completedAt":"2026-09-01T21:42:57Z","name":"Check the generated missed-meal comparison fixture is current","startedAt":"2026-09-01T21:42:57Z"},{"completedAt":"2026-09-01T21:42:57Z","name":"Post Install uv","startedAt":"2026-09-01T21:42:57Z"},{"completedAt":"2026-09-01T21:42:57Z","name":"Post Run actions/checkout@v5","startedAt":"2026-09-01T21:42:57Z"},{"completedAt":"2026-09-01T21:42:57Z","name":"Complete job","startedAt":"2026-09-01T21:42:57Z"}]}
```
