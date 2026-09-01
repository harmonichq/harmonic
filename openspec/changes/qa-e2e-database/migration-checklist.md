# Revise E2E executable-consumer migration checklist

Phase 5 executes this checklist after the generator and committed QA database
exist. It must replace the executable consumers as one migration and only then
retire the old generator and binary. Historical records are not migration
targets.

## Current executable consumers

| Consumer | Current path | Phase-5 action |
| --- | --- | --- |
| Fixture generator | `scripts/gen_revise_e2e_db.py` | Add and prove the QA generator first; retire this generator only with the binary, its test, and its CI drift check. |
| Generator public-interface/drift test | `tests/test_gen_revise_e2e_db.py` | Preserve its production `analyze`, `build_exposures`, `build_scenarios`, `prepare_findings_projection`, and `prepare_ic_history_events` checks in the QA successor. |
| CI drift check | `.github/workflows/ci.yml` | Replace `scripts/gen_revise_e2e_db.py --check` with the QA generator's fail-closed check. |
| Permitted offline command | `AGENTS.md` and the `CLAUDE.md` symlink | Move the documented `--no-fetch` database path and generator reference to `mockups/qa-e2e.synthetic/harmonic.sqlite`. |
| Local launch entry | `.claude/launch.json` (`harmonic-nofetch`) | Move its `--db` path to `mockups/qa-e2e.synthetic/harmonic.sqlite`. |
| Browser-gates server | `.github/workflows/ci.yml` | Move the declared synthetic no-fetch server's `--db` path while retaining `--no-fetch` and its health-check lifecycle. |
| Browser replay | `frontend/diagnose-workstation-behavior.replay.mjs` | Retain the replay; it reaches the workflow's declared server through `BASE_URL`, so it validates the migrated fixture indirectly. |
| Browser replay | `frontend/diagnose-event-comparison-behavior.replay.mjs` | Retain the replay; the workflow server lifecycle remains its app source. |
| Browser support audit | `mockups/diagnose-event-comparison-support-audit.mjs` | Retain the audit; the workflow server lifecycle remains its app source. |
| Browser replay | `frontend/verify-660-story-behavior.replay.mjs` | Retain the replay; the workflow server lifecycle remains its app source. |
| Route-level fixture copy | `tests/test_finding_case_file_api.py` | Point the copied app database at QA E2E and retain its route-level assertions. |
| Public-link path pin | `scripts/check_public_links.py` | Add the QA path pin beside the revise-e2e one; the revise-e2e pin stays until the browser-gates server row moves, then is removed. |
| Public-link pin test | `tests/test_check_public_links.py` | Assert the QA path pin beside the revise-e2e one while retaining the agent-instructions-only policy; drop the revise-e2e assertion with its pin. |
| Public-tree binary policy test | `tests/test_check_public_allowlist.py` | Replace the exact local-only QA database path and retain the `.sqlite` denial. |

## Showcase cut (#194, per the 2026-08-29 ruling)

Rows this cut moves: permitted offline command (AGENTS.md / CLAUDE.md), local
launch entry, and the harness README's restore reference; it adds the QA
public-link pin and its pin assertion beside the revise-e2e ones, which stay
while the browser-gates reproduction block still names the old store. Rows that wait for #192/#193: CI drift-check replacement
(this cut adds the QA check beside the old one), browser-gates server, route-
level fixture copy, public-tree binary policy test, and every retirement.

## Non-executable historical references

The remaining literal matches under `docs/scope/`, `openspec/changes/`, and
`mockups/finding-evidence-routing.behavior.md` describe completed historical
runs. Do not rewrite their commands, paths, seed claims, or evidence. This
change is the successor record.

## Completion condition

After the replacement, an executable-path-only check must reject remaining
`revise-e2e` and `gen_revise_e2e_db.py` references outside explicitly allowed
immutable-history roots. Its executable scope includes `.claude/launch.json`
and `.github/workflows/ci.yml`. The old generator, binary, test, and CI check
may be removed only when that check passes.
