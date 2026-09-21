# Tasks — retire the v1 app (#416)

Task groups run in order. Each group leaves the branch green on the gates that
group names; the complete pull-request gate runs once, in group 4.

## 1. Stand the desk alone, then serve it at root

- [ ] 1.1 Rehome the desk's lifted material, chart key and glossary as committed
      desk source per design.md "Rehoming what the desk's build lifted". Record
      the before/after comparison of built CSS and glossary under `evidence/`.
      Delete `frontend-v2/app-source.mjs`, its test, the virtual modules and
      their plugin in `vite.config.v2.mjs`. v1's page is left untouched here.
- [ ] 1.2 Re-point the three lifts in `mockups/harmonic-v2.exploration/generate.py`
      (glossary, chart key, combined stylesheet) from v1's page to the rehomed
      desk source. Its `--check` must pass with byte-identical outputs, or with
      a diff explained line by line under `evidence/`.
- [ ] 1.3 Copy every export the surviving desk tree imports from the two v1
      replay files (design.md lists twelve), with whatever each calls, into the
      desk's replay source unchanged, and re-point the importers. Leave the two
      v1 replay files untouched; group 2 deletes them.
- [ ] 1.4 Rewrite `tests/test_frontend_asset_routes.py` first, to the closed
      non-API route set `/`, `/diagnose`, `/changes`, `/day`, `/assets`, with
      `/v2`, `/v2/`, `/v2/diagnose`, `/v2/assets/x.js`, `/verify`, `/plan`,
      `/settings`, `/guide`, `/index.html` and an unlisted path all 404. Record
      its failure against the unchanged server, then make it pass.
- [ ] 1.5 In `ciq_autotune/api.py`, serve the desk's built shell at `/` and the
      three page paths and its built assets at `/assets`; remove the v1 shell
      routes, `SPA_PAGES`, the v1 build check and the `/v2` routes and mount.
      Keep one fail-closed missing-build answer (503 naming the build command,
      API still reachable) and the cache-control policy for pages and assets.
- [ ] 1.6 Set the desk build's base to `/`. Move the browser router's desk prefix
      to root (`frontend/tab-routing.js`) and make the disk-serving mirror
      (`frontend/built-shell.js`) serve only the desk's page set and `/assets/`;
      the mirror's v1 arm and the v1 cases in both unit tests go with it.
- [ ] 1.7 Re-point every desk test, browser suite and replay opener from `/v2/...`
      to the root address. Amend the desk ledger per design.md "Ledger
      amendment": S86 asserts the root address set; S87 is retired
      as `R19` with an executable registry body, exactly as design.md says; no
      other story's assertions change. Move the frozen inventory literal in the
      acceptance driver and its test with it: 142 issued stays, active goes 124
      to 123, retired goes 18 to 19.
- [ ] 1.8 Delete the v1-against-desk comparison driver
      `mockups/sweep/harmonic-v2-desktop/clinical-pairs.mjs` and its two tests in
      `frontend-v2/c4.replay.test.js`; it opens both apps and one is gone.
- [ ] 1.9 Update the acceptance driver's package proof and its test to the root
      route set and 404 list; update `tests/test_api.py` and
      `tests/test_deploy_assets.py` delivery assertions and the `Dockerfile` so
      the image ships one built shell.
- [ ] 1.10 Group gate: `npm ci && npm run build`; `uv run python -m pytest
      tests/test_frontend_asset_routes.py tests/test_api.py
      tests/test_deploy_assets.py`; the fast-gate node line;
      `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py`; and
      `uv run python mockups/harmonic-v2.exploration/generate.py --check`.

## 2. Delete v1

- [ ] 2.1 Delete the v1 shell page, the v1 Vite config, and every `frontend/` file
      that fails the survival rule in design.md. Remove `vue` and
      `@vitejs/plugin-vue` from `package.json` and the lockfile; `npm run build`
      runs the one desk build.
- [ ] 2.2 Delete these nine browser legs from `.github/workflows/ci.yml`, by gate
      name, with their suites, drivers, replays and behavior ledgers: Day
      lifecycle; Diagnose workstation; Diagnose canvas composition; Cockpit
      shell; First-plan reconcile; Diagnose workstation behaviour ledger;
      Diagnose event comparisons; Diagnose comparison support audit; Verify
      behaviour ledger. The event-comparison capture, its generator and its
      `--check` step stay: a surviving generator and a surviving module read the
      capture. Keep Browser
      runner lifecycle, V2 desk, V2 Trial and Pattern Focus and the desk ledger
      jobs.
- [ ] 2.3 In `frontend/browser-gates-fail-closed.test.js`, the suite list becomes
      exactly the one surviving shell-serving leg, the desk browser suite, spawned
      by its real path, keeping both assertions (names `PLAYWRIGHT_MODULE`, names
      the build command). The list must not be empty: add an assertion that it
      has at least one entry. Delete the Explore-mode source check, which reads
      the deleted canvas-composition suite (design.md ADR 416 item 4).
- [ ] 2.4 Delete `harness/`, `frontend/harness-api-paths.test.js`, and the three
      design explorations that read v1's source and that nothing surviving reads,
      with their `--check` steps in CI, their backend tests and their entries in
      the acceptance driver: `mockups/finding-evidence-routing.exploration/`
      (with `mockups/finding-evidence-routing.behavior.md`),
      `mockups/diagnose-evidence-canvas.exploration/` and
      `mockups/clock-window-wrap.exploration/`. Delete
      `mockups/explore-investigation.fixture.js`, whose only reader is the
      deleted cockpit-shell suite, with its allowlist entry. Delete a synthetic set under
      `mockups/` only when no surviving generator, drift check or backend test
      reads it.
- [ ] 2.5 Re-point `scripts/check_owned_identifiers.py`: the browser title rule at
      the desk's page, the favicon rule at the surviving favicon, and the header
      wordmark rule at the desk's chrome module, where the wordmark is emitted
      mid-line, so its pattern moves with it. The guard must still fail when the
      wordmark is misspelled; prove that once. Remove dead entries from
      `scripts/public_allowlist.txt`, `scripts/public_scan_config.txt` and
      `scripts/check_public_links.py`, and delete `data.js` exports and client
      re-exports that no surviving caller uses.
- [ ] 2.6 Group gate: `npm ci && npm run build`, the fast-gate node line, full
      `uv run python -m pytest`, every surviving drift check, and the three guard
      scripts all pass.

## 3. One frontend root, and the v2 name leaves the living system

- [ ] 3.1 Merge `frontend-v2/` into `frontend/` and apply every rename in
      design.md "Naming boundary", using `git mv` so history follows. Fix every
      import, config path, tsconfig input, Dockerfile COPY and allowlist entry.
- [ ] 3.2 Rename router, server and CI identifiers per the naming boundary.
- [ ] 3.3 Reconcile the living documents to one shell at root: `AGENTS.md`
      (install, gate list, browser legs, ledger story counts, layout,
      conventions), `README.md`, `PRODUCT.md`, `mockups/INDEX.md`,
      `mockups/SCAFFOLD.md`, and the `ui-surfaces:` line. Historical records stay
      byte-identical.
- [ ] 3.4 Amend `openspec/changes/harmonic-v2/`: rewrite its serving requirement
      to the root address with no v1, tick tasks 3.5, 4.2 and 4.3 citing ADR 416,
      and add one line to its design step 5 naming the supersession.
- [ ] 3.5 Group gate: the group 2 gate again, plus `npx --yes
      @fission-ai/openspec@1 validate --all --strict`, plus
      `sh openspec/changes/retire-v1/name-boundary.sh` exiting 0, plus
      `uv run python mockups/harmonic-v2.exploration/generate.py --check` after
      regenerating its outputs for the moved source paths.

## 4. Live browser run, corrections, and the complete gate

- [ ] 4.1 On the commit to be pushed, build once and run the desk suite, the
      follow-up suite and the browser-runner regression. Fold every correction
      back and re-run only what the correction touches.
- [ ] 4.2 Run the complete desk ledger once at each accepted size against the
      built, Python-served, root-addressed app with no story deferred. Restore
      any committed synthetic database the serve mutated through its generator.
- [ ] 4.3 Run the complete pull-request gate from `AGENTS.md` once and record the
      outputs under `evidence/`. The image package proof is not run locally; it
      is CI's image job on the pull request (design.md "Verification design").
