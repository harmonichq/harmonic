# Group 2 gate — delete v1 (#416)

Run on the branch `416-retire-v1-desk-at-root-c2`, 2026-09-21/22, on the
operator's Mac. No browser leg was run: group 4 owns those.

## Host substitutions

This worker's sandbox blocks `~/.cache/uv` and the network, so `uv` cannot build
a virtualenv in the worktree. Every `uv run python …` command below was run as
the control checkout's already-synced interpreter,
`/Users/connor/Code/harmonichq/harmonic/.venv/bin/python`, with
`PYTHONPATH=/Users/connor/worktrees/harmonic/416-c2` so it resolves this
worktree's source. `scripts/check_guidance_plan_contract.mjs` shells out to a
hard-coded `uv`, so it ran with a PATH shim forwarding `uv run python` to the
same interpreter. CI runs the commands as written.

## Results

| Gate | Command | Result |
|---|---|---|
| Build | `npm ci && npm run build` | one desk build, 611 modules; CSS 492.45 kB, JS 2,950.38 kB |
| Fast gate | `node --test 'frontend/**/*.test.js' 'frontend-v2/**/*.test.js'` | 782 pass, 0 fail |
| Backend | `python -m pytest -q` | 2,544 passed, 1 skipped, 349 subtests, 4 min 59 s |
| Drift (11 Python) | each generator `--check` | all current |
| Drift (Node) | `mockups/diagnose-event-comparison.synthetic/generate.mjs --check` | current |
| Parity | `scripts/check_guidance_plan_contract.mjs` | PASS (12 backend schedule cases) |
| Guard | `scripts/check_adr_numbers.py` | 179 ADRs, all identities unique |
| Guard | `scripts/check_owned_identifiers.py` | 30 rules passed |
| Guard | `scripts/check_public_allowlist.py` | 421 shipping, 2,140 excluded, every path dispositioned |
| Public tree | `build_public_tree.py` + `check_public_links.py` + `scan_public_tree.py` | 383 documents scanned, every reference resolves; 421 scanned, 0 findings |
| Acceptance driver | `acceptance.test.py` | 40 of 41 pass — see below |
| Acceptance driver | `acceptance.py case-cache --check` | exit 0, 5.9 s |

The surviving drift checks are eleven Python generators plus the one Node
capture: `mockups/harmonic-v2.exploration/generate.py`,
`gen_chart_builder_fixtures.py`, `check_demo_fixtures.py`, `gen_qa_e2e_db.py`,
`gen_findings_projection_fixtures.py`, `gen_ic_history_event_fixtures.py`,
`gen_ic_block_evidence_fixtures.py`, `gen_basal_night_evidence_fixtures.py`,
`gen_isf_rest_window_evidence_fixtures.py`,
`gen_missed_meal_comparison_fixtures.py`, `gen_eating_sequence_fixtures.py`, and
`mockups/diagnose-event-comparison.synthetic/generate.mjs`.

### The one acceptance-driver error

`ServerLifecycleTest.test_taken_port_is_rejected_without_touching_its_listener`
raises `PermissionError: [Errno 1] Operation not permitted` at
`listener.bind(("127.0.0.1", 0))`. The sandbox refuses the socket bind; the test
never reaches the driver. It is unrelated to this change — nothing here touches
port handling — and CI runs it unsandboxed.

## Fail-first evidence — the re-pointed wordmark guard

Task 2.5 moved `check_owned_identifiers.py`'s header-wordmark rule from v1's page
to the desk's chrome module, where the wordmark is emitted mid-line. Proved
against a deliberately broken variant:

```
--- clean tree
check-owned-identifiers: 30 owned-identifier rules passed.
exit=0
--- wordmark misspelled as CIQ-Harmonic
check-owned-identifiers: retired vendor-derived identifier found:
  frontend-v2/shell.js:36: header wordmark retains 'CIQ-Harmonic'
exit=1
```

## Dangling-import scan

Every relative import, `href` and `src` in a tracked JS/MJS/CSS/HTML file was
resolved against disk. Nothing the desk's build, tests, replays or a surviving
generator reaches is dangling. Four hits remain, all in frozen records outside
this change's authority:

* `docs/scope/188-…spike.mjs`, `docs/scope/347-…spike.mjs` and
  `docs/scope/diagnose-slot-head-state/repro-head-states.mjs` — frozen spike
  records.
* `mockups/_shell.js`, `mockups/harmonic-v2-glucose.js` and
  `mockups/harmonic-v2-glucose-focus.js` import
  `../frontend/scenario-chart.js`, which fails the survival rule and is deleted.
  These are the locked desktop prototype and its scaffold, which the naming
  boundary freezes byte-identical. No gate opens them, and the prototype stays
  recoverable from Git history; opening `harmonic-v2-glucose.html` in a browser
  no longer resolves that import.
