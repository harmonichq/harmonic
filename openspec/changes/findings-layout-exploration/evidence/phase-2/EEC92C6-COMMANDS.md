# EEC92C6 phase 2 command record

These are the commands executed for the authoritative final sweep. The adjacent
`eec92c6-*.txt` files contain their complete, unedited stdout/stderr. Browser
commands used the repository's persistent gate cache:

```sh
PLAYWRIGHT_MODULE=/Users/connor/.cache/harmonic-browser-gate/pw/node_modules/playwright
VENDOR_DIR=/Users/connor/.cache/harmonic-browser-gate/vendor
```

The browser server was an owned copy of
`mockups/qa-e2e.synthetic/harmonic.sqlite`, started exactly as:

```sh
uv run harmonic serve --no-fetch --token '' --db /private/tmp/harmonic-341-eec92c6-final.tcNuux/harmonic.sqlite --port 64556
```

The ten browser-gate legs were:

```sh
PLAYWRIGHT_MODULE=/Users/connor/.cache/harmonic-browser-gate/pw/node_modules/playwright node frontend/day-surface.browser.mjs
PLAYWRIGHT_MODULE=/Users/connor/.cache/harmonic-browser-gate/pw/node_modules/playwright VENDOR_DIR=/Users/connor/.cache/harmonic-browser-gate/vendor PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json DIAGNOSE_SCREENSHOT_VARIANT=revision-eec92c6 node --test frontend/diagnose-workstation.browser.test.mjs
PLAYWRIGHT_MODULE=/Users/connor/.cache/harmonic-browser-gate/pw/node_modules/playwright VENDOR_DIR=/Users/connor/.cache/harmonic-browser-gate/vendor PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json node --test frontend/diagnose-canvas-composition.browser.test.mjs
PLAYWRIGHT_MODULE=/Users/connor/.cache/harmonic-browser-gate/pw/node_modules/playwright VENDOR_DIR=/Users/connor/.cache/harmonic-browser-gate/vendor node --test frontend/cockpit-shell.browser.test.mjs
PLAYWRIGHT_MODULE=/Users/connor/.cache/harmonic-browser-gate/pw/node_modules/playwright node --test frontend/browser-runner.browser.test.mjs
PLAYWRIGHT_MODULE=/Users/connor/.cache/harmonic-browser-gate/pw/node_modules/playwright node frontend/plan-first-match.browser.mjs
PLAYWRIGHT_MODULE=/Users/connor/.cache/harmonic-browser-gate/pw/node_modules/playwright VENDOR_DIR=/Users/connor/.cache/harmonic-browser-gate/vendor BASE_URL=http://127.0.0.1:64556 TARGET=app PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json node frontend/diagnose-workstation-behavior.replay.mjs
PLAYWRIGHT_MODULE=/Users/connor/.cache/harmonic-browser-gate/pw/node_modules/playwright VENDOR_DIR=/Users/connor/.cache/harmonic-browser-gate/vendor BASE_URL=http://127.0.0.1:64556 TARGET=app node frontend/diagnose-event-comparison-behavior.replay.mjs
PLAYWRIGHT_MODULE=/Users/connor/.cache/harmonic-browser-gate/pw/node_modules/playwright VENDOR_DIR=/Users/connor/.cache/harmonic-browser-gate/vendor BASE_URL=http://127.0.0.1:64556 TARGET=app node mockups/diagnose-event-comparison-support-audit.mjs
PLAYWRIGHT_MODULE=/Users/connor/.cache/harmonic-browser-gate/pw/node_modules/playwright VENDOR_DIR=/Users/connor/.cache/harmonic-browser-gate/vendor BASE_URL=http://127.0.0.1:64556 TARGET=app PAYLOAD=mockups/verify-660-story.synthetic/payload.json node frontend/verify-660-story-behavior.replay.mjs
```

The fast, drift and public-tree commands were:

```sh
uv run python -m pytest
node --test 'frontend/**/*.test.js'
npx --yes @fission-ai/openspec@1 validate --all --strict
python3 scripts/check_adr_numbers.py
python3 scripts/check_owned_identifiers.py
python3 scripts/check_public_allowlist.py
node mockups/diagnose-event-comparison.synthetic/generate.mjs --check
node mockups/finding-evidence-routing.exploration/build.mjs --check
uv run python mockups/diagnose-evidence-canvas.exploration/generate.py --check
uv run python scripts/gen_ic_block_fixtures.py --check
uv run python scripts/gen_annotation_fixtures.py --check
uv run python scripts/gen_chart_builder_fixtures.py --check
uv run python scripts/check_demo_fixtures.py
uv run python scripts/gen_qa_e2e_db.py --check
uv run python scripts/gen_findings_projection_fixtures.py --check
uv run python scripts/gen_ic_history_event_fixtures.py --check
uv run python scripts/gen_ic_block_evidence_fixtures.py --check
uv run python scripts/gen_basal_night_evidence_fixtures.py --check
uv run python scripts/gen_isf_rest_window_evidence_fixtures.py --check
uv run python scripts/gen_missed_meal_comparison_fixtures.py --check
uv run python scripts/gen_eating_sequence_fixtures.py --check
uv run python scripts/build_public_tree.py "$phase2_public_dir"
uv run python scripts/check_public_links.py "$phase2_public_dir"
uv run python scripts/scan_public_tree.py "$phase2_public_dir"
```

The current matrix used a separate owned QA copy and port, recorded in
`eec92c6-capture-owned-server-metadata.txt`, then invoked the checked-in capture
driver once per source:

```sh
PLAYWRIGHT_MODULE=/Users/connor/.cache/harmonic-browser-gate/pw/node_modules/playwright VENDOR_DIR=/Users/connor/.cache/harmonic-browser-gate/vendor BASE_URL=http://127.0.0.1:49255 CAPTURE_LABEL=eec92c6-final CAPTURE_SOURCE=projection CAPTURE_OUTPUT=openspec/changes/findings-layout-exploration/evidence/phase-2 node openspec/changes/findings-layout-exploration/evidence/phase-2/capture-matrix.mjs
PLAYWRIGHT_MODULE=/Users/connor/.cache/harmonic-browser-gate/pw/node_modules/playwright VENDOR_DIR=/Users/connor/.cache/harmonic-browser-gate/vendor BASE_URL=http://127.0.0.1:49255 CAPTURE_LABEL=eec92c6-final CAPTURE_SOURCE=qa-showcase CAPTURE_OUTPUT=openspec/changes/findings-layout-exploration/evidence/phase-2 node openspec/changes/findings-layout-exploration/evidence/phase-2/capture-matrix.mjs
```

The pinned original matrix remains authoritative because the source hashes in
`MANIFEST.md` are unchanged. Its complete process output is in
`original-base-capture-final.txt`; it used the original surface's Charts-dock
entry and return paths rather than revision-only All charts controls.
