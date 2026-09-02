# Generated facts — QA E2E coverage eras

## Isolated-span probe

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

The probe materializes `showcase` unchanged, then materializes it again with the
same dense recipe extended backward to `BLOCK_WINDOW_DAYS + _BOLUS_LEADIN`. Both
use production `analyze`. The short store is forced to collecting; the long store
reaches the analyzer's full observation age and a numeric state. The short store's
single ISF row also shows that row presence alone does not exercise the prior-
decision replay that requires the ISF family span.

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
openspec/changes/qa-e2e-coverage-eras/evidence/span-probe.py
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
