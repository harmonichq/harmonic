# Verification

Run from the ticket worktree. Full-diff validation includes every check in current
`AGENTS.md` and `.github/workflows/ci.yml`; the commands below transcribe the
current contributor gate. Do not change a budget, skip a gate or treat missing
browser dependencies as success. Browser launches on this Mac run outside the
Codex sandbox. The graph was unavailable after repeated active-generation conflicts;
ordinary source discovery was used, without terminating another session.

## Per-chunk checks

Chunk 1: public scenario/sequence/uncertainty tests and existing behavioral consumers.
Chunk 2: analyzer-to-findings, exposure, outcome and case-file integration tests.
Chunk 3: Node chart registry/adapter/harness-path tests and manufactured visual checks.
Chunk 4 and whole branch: all checks below, synthetic generator parity, QA budgets,
full inherited replay and new stories; correct only defects within this order.

## Fast gate (verbatim contributor commands)

```sh
uv run python -m pytest                    # backend, stdlib unittest
node --test 'frontend/**/*.test.js'        # frontend, Node's built-in runner
npx --yes @fission-ai/openspec@1 validate --all --strict # OpenSpec requirements and changes
python3 scripts/check_adr_numbers.py       # decision-record naming guard
python3 scripts/check_owned_identifiers.py # product-name guard
python3 scripts/check_public_allowlist.py  # publishable-tree guard
```

## Python drift (verbatim contributor commands)

```sh
uv run python scripts/gen_ic_block_fixtures.py --check
uv run python scripts/gen_annotation_fixtures.py --check
uv run python scripts/gen_chart_builder_fixtures.py --check
uv run python scripts/check_demo_fixtures.py   # the committed synthetic demo sets
uv run python scripts/gen_qa_e2e_db.py --check
uv run python scripts/gen_findings_projection_fixtures.py --check
uv run python scripts/gen_ic_history_event_fixtures.py --check
uv run python scripts/gen_ic_block_evidence_fixtures.py --check
uv run python scripts/gen_basal_night_evidence_fixtures.py --check
uv run python scripts/gen_isf_rest_window_evidence_fixtures.py --check
uv run python scripts/gen_missed_meal_comparison_fixtures.py --check
uv run python scripts/gen_eating_sequence_fixtures.py --check
```

Also run the evidence-canvas generator from CI:
`uv run python mockups/diagnose-evidence-canvas.exploration/generate.py --check`.

## Node and publish checks from CI

```sh
node mockups/diagnose-event-comparison.synthetic/generate.mjs --check
node mockups/finding-evidence-routing.exploration/build.mjs --check
node --test scripts/screenshots.local.test.mjs
```

Run the public-tree build, link and contamination scan as declared in CI in a new
scratch destination; do not publish that tree. These are needed for any new fixture
or public file, as well as the fast gate's path allowlist.

## Browser gates

Use `python3 scripts/ensure_browser_gate_env.py` to resolve the reusable Playwright
and vendor paths. Set VENDOR to the returned VENDOR_DIR; set PW to the directory above
node_modules in the returned PLAYWRIGHT_MODULE path.
Start only the generated QA copy-then-serve declared in AGENTS.md; the committed
database itself must not be opened writable. The mandatory flags are `--no-fetch`
and `--token ''`. Then run the contributor's ten legs:

```sh

PLAYWRIGHT_MODULE="$PW/node_modules/playwright" node frontend/day-surface.browser.mjs
PLAYWRIGHT_MODULE="$PW/node_modules/playwright" VENDOR_DIR="$VENDOR" PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json node --test frontend/diagnose-workstation.browser.test.mjs
PLAYWRIGHT_MODULE="$PW/node_modules/playwright" VENDOR_DIR="$VENDOR" PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json node --test frontend/diagnose-canvas-composition.browser.test.mjs
PLAYWRIGHT_MODULE="$PW/node_modules/playwright" VENDOR_DIR="$VENDOR" node --test frontend/cockpit-shell.browser.test.mjs
PLAYWRIGHT_MODULE="$PW/node_modules/playwright" node --test frontend/browser-runner.browser.test.mjs
PLAYWRIGHT_MODULE="$PW/node_modules/playwright" node frontend/plan-first-match.browser.mjs
# In another terminal, start the QA copy-then-serve command documented below.
PLAYWRIGHT_MODULE="$PW/node_modules/playwright" VENDOR_DIR="$VENDOR" BASE_URL=http://127.0.0.1:8765 TARGET=app PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json node frontend/diagnose-workstation-behavior.replay.mjs
PLAYWRIGHT_MODULE="$PW/node_modules/playwright" VENDOR_DIR="$VENDOR" TARGET=app node frontend/diagnose-event-comparison-behavior.replay.mjs
PLAYWRIGHT_MODULE="$PW/node_modules/playwright" VENDOR_DIR="$VENDOR" TARGET=app node mockups/diagnose-event-comparison-support-audit.mjs
PLAYWRIGHT_MODULE="$PW/node_modules/playwright" VENDOR_DIR="$VENDOR" TARGET=app PAYLOAD=mockups/verify-660-story.synthetic/payload.json node frontend/verify-660-story-behavior.replay.mjs
```

## Evidence

Use `harness/` manufactured stories for both new charts, thin/null data, long labels,
all chart sizes and the selected periods. Render the real chart module. Inspect
1440x900, 1280x800 and 390x844. The full app is the later integration proof.
Keep base and revision captures in the active change's evidence directory; the
inherited ledger and replay remain the contract. No existing behavior retirement
is authorized. Record complete command output and applicable story count.

The cohort report does not supply an intervention estimate; no evidence caption
may claim that changing a behavior will save the displayed burden.
