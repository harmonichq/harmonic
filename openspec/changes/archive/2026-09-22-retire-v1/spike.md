# Spike — what deleting v1 actually breaks (#416)

Run by triage on 2026-09-21 after three review panels each found couplings that
reading had missed. A throwaway local branch (`416-spike`, from origin/main
6821bbf6, never merged or pushed) rehomed the desk's build lift, deleted v1, and
let the build and the gates report. Everything here is executed output, not
reading. `spike/closure.mjs` and `spike/reach.cjs` are the two tools used.

## Method

1. Emit `materialCss() + chartKeyCss()` and `glossaryModule()` from
   `frontend-v2/app-source.mjs` as `frontend-v2/material.css` and
   `frontend-v2/glossary.js`; re-point the two imports in `frontend-v2/main.js`
   (`virtual:harmonic/app-material.css`, `virtual:harmonic/glossary`, the only
   two consumers); delete the plugin from `vite.config.v2.mjs`, `app-source.mjs`
   and its test.
2. `node spike/closure.mjs frontend-v2 vite.config.v2.mjs`: the desk's import
   closure into `frontend/`, by real import statements with comments stripped.
   Add each surviving module's `*.test.js`, the three infrastructure tests
   (`browser-gates-fail-closed.test.js`, `browser-runner.browser.test.mjs`,
   `findings-projection-mirror.test.js`) and their closures.
3. `git rm` every other tracked file under `frontend/`, `vite.config.mjs` and
   `harness/`. Then run the oracles and restore whatever they name as missing.

## Results

| Oracle | Before | After the prune |
|---|---|---|
| `npm run build` (desk build alone) | builds | builds, same asset sizes (CSS 491.87 kB, JS 2,952.55 kB) |
| fast gate | 933 pass, 0 fail | 810 run, 797 pass, 13 fail |
| `uv run python -m pytest` (5 min 2 s) | green | 2,546 pass, 3 fail; 6 more fail once v1's built output is removed |
| 13 Python drift checks | green | 11 pass, 2 fail |
| `generate.mjs --check` (event-comparison capture) | green | passes |
| `build.mjs --check` (routing exploration) | green | fails |
| guards | green | ADR and allowlist pass; owned identifiers fails |

`spike/frontend-survivors.txt` is the 83 files left under `frontend/` with every
oracle above accounted for. `spike/deleted.txt` is the 51 tracked paths removed
(38 under `frontend/`, 12 under `harness/`, `vite.config.mjs`). Both are grounding
for the survival rule, not a replacement for it.

## What the oracles found, and nothing else

**Fast gate, 13 failures, all in `frontend/browser-gates-fail-closed.test.js`:**
twelve are its all-v1 suite list (six deleted suites, two cases each) and one is
the Explore-mode source check reading the deleted canvas-composition suite. No
surviving module's unit test fails.

**Files no import statement reaches but a gate needs** (restored when a test
named them missing, all read by filesystem path):
`frontend/__fixtures__/analysis.json`, `basal-night-evidence.json`,
`daily.day.json`. The import closure alone would have deleted them.

**The two v1 replay files stay importable** after the prune, and the desk tree
plus one surviving unit test import 15 exports from them. `node spike/reach.cjs`:

```
frontend/diagnose-workstation-behavior.replay.mjs: 14 roots -> 32 of 297 top-level declarations, 726 of 6691 lines
frontend/diagnose-event-comparison-behavior.replay.mjs: 1 roots -> 6 of 35 top-level declarations, 67 of 719 lines
```

The 14 roots are `waitForLevelAnimations`, `S03`, the nine helpers imported by
`frontend-v2/desk.browser.test.mjs`, and `patternCaseResponse`,
`generatedFindingPose`, `generatedFindingProjection` imported by
`frontend/diagnose-workstation.test.js`. That test also reads the workstation
replay's source text (line 89) to assert the bodies of stories C44 and C56. The
spike left both replay files in place; copying the 38 declarations out and
deleting the files was not executed.

**pytest, 9 failures in 3 files once `frontend/dist` is gone:**

- `tests/test_frontend_asset_routes.py` (3): the v1 built shell, the both-shells
  HTTP walk, the missing-v2-build case.
- `tests/test_api.py` (3): `test_root_serves_frontend`,
  `test_every_built_index_asset_is_served`, `test_root_does_not_require_token`.
- `tests/test_check_public_links.py` (1): the materialised public tree has dead
  references to deleted files.
- `tests/test_evidence_canvas_generator.py` (1): its generator reads v1's page.
- `tests/test_deploy_assets.py`: passes (it reads the Dockerfile's text), so it
  will not notice the Dockerfile still copying v1; it changes with the Dockerfile.

**Drift checks:** `mockups/harmonic-v2.exploration/generate.py` and
`mockups/diagnose-evidence-canvas.exploration/generate.py` fail with
`FileNotFoundError: frontend/index.html`. The other eleven pass. Two of those
eleven have lost their last reader and retire with v1, generator, fixture and CI
step together: `scripts/gen_ic_block_fixtures.py` (`ic-blocks.json`) and
`scripts/gen_annotation_fixtures.py` (`engine-annotations.json`). One output of
`scripts/gen_chart_builder_fixtures.py`, `episode.carb-undercount.json`, has no
reader either; its other two outputs do.

**Guards:** `check_owned_identifiers.py` fails on `frontend/index.html: missing
file` for the browser title and the header wordmark.

**Living files that still name a deleted file** (executed `git grep -F` per
deleted basename, outside historical records): `AGENTS.md` (8 names),
`.github/workflows/ci.yml` (7), `frontend/browser-gates-fail-closed.test.js` (6),
`tests/test_frontend_asset_routes.py` (3), `scripts/public_scan_config.txt` (2),
and one each in `tests/test_api.py`, `tests/test_check_public_links.py`,
`tests/test_check_public_allowlist.py`, `tests/test_evidence_canvas_generator.py`,
`tests/test_meal_bolus_short_attribution.py`, `scripts/check_owned_identifiers.py`,
`scripts/ensure_browser_gate_env.py`, `scripts/profile_cold_shapes.py`, and the
`mockups/harmonic-v2.exploration/` generator and its three lifted outputs.
Comment-only mentions inside surviving `frontend/` modules were not counted.

## What the spike did not run

No browser leg, no ledger replay, no route cutover, no rename, no Docker image.
Those remain the order's work; the spike only bounded the deletion.
