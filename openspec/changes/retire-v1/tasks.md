# Tasks — retire the v1 app (#416)

Task groups run in order. Each group leaves the branch green on the gates that
group names; the complete pull-request gate runs once, in group 4.

## 1. Cut over: the desk is served at root and v1 is unserved

- [ ] 1.1 Rewrite `tests/test_frontend_asset_routes.py` first, to the closed
      non-API route set `/`, `/diagnose`, `/changes`, `/day`, `/assets`, with
      `/v2`, `/v2/`, `/v2/diagnose`, `/v2/assets/x.js`, `/verify`, `/plan`,
      `/settings`, `/guide`, `/index.html` and an unlisted path all 404. Record
      its failure against the unchanged server, then make it pass.
- [ ] 1.2 In `ciq_autotune/api.py`, serve the desk's built shell at `/` and the
      three page paths and its built assets at `/assets`; remove the v1 shell
      routes, `SPA_PAGES`, the v1 build check and the `/v2` routes and mount.
      Keep one fail-closed missing-build answer (503 naming the build command,
      API still reachable) and the cache-control policy for pages and assets.
- [ ] 1.3 Set the desk build's base to `/`. Move the browser router's desk prefix
      to root (`frontend/tab-routing.js`) and the disk-serving mirror's page set
      and asset prefix (`frontend/built-shell.js`), with their unit tests.
- [ ] 1.4 Re-point every desk test, browser suite and replay opener from `/v2/...`
      to the root address. Amend the desk ledger per design.md "Ledger
      amendment": S86 asserts the root address set; S87 is retired citing
      ADR 416; no other story's assertions change.
- [ ] 1.5 Update the acceptance driver's package proof and its test to the root
      route set and 404 list; update `tests/test_api.py` and
      `tests/test_deploy_assets.py` delivery assertions and the `Dockerfile` so
      the image ships one built shell.
- [ ] 1.6 Group gate: `uv run python -m pytest tests/test_frontend_asset_routes.py
      tests/test_api.py tests/test_deploy_assets.py`, the fast-gate node line, and
      the acceptance driver's own test all pass.

## 2. Delete v1

- [ ] 2.1 Rehome the desk's lifted material, chart key and glossary as committed
      desk source per design.md "Rehoming what the desk's build lifted". Record
      the before/after comparison of built CSS and glossary under `evidence/`.
      Delete `app-source.mjs`, its test, the virtual modules and their plugin.
- [ ] 2.2 Move `waitForLevelAnimations`, `S03` and `S8` into the desk's replay
      source unchanged and re-point their importers.
- [ ] 2.3 Delete the v1 shell page, the v1 Vite config, and every `frontend/` file
      that fails the survival rule in design.md. Remove `vue` and
      `@vitejs/plugin-vue` from `package.json` and the lockfile; `npm run build`
      runs the one desk build.
- [ ] 2.4 Delete the eight v1-only browser legs from `.github/workflows/ci.yml`
      with their suites, drivers, replays, behavior ledgers and the v1 event
      comparison capture check. Keep the desk suite, the follow-up suite, the
      browser-runner regression, the desk ledger jobs and the fail-closed
      regression; update that regression's expected leg list.
- [ ] 2.5 Delete `harness/`, `frontend/harness-api-paths.test.js`, and the three
      design explorations that read v1's source and that nothing surviving reads,
      with their `--check` steps in CI, their backend tests and their entries in
      the acceptance driver: `mockups/finding-evidence-routing.exploration/`
      (with `mockups/finding-evidence-routing.behavior.md`),
      `mockups/diagnose-evidence-canvas.exploration/` and
      `mockups/clock-window-wrap.exploration/`. Keep
      `mockups/harmonic-v2.exploration/`: the desk ledger's mock target reads its
      fixtures. Re-point its generator's three lifts (glossary, chart key,
      combined stylesheet) from v1's page to the rehomed desk source from 2.1;
      its `--check` stays in CI and must pass with byte-identical outputs or an
      explained diff. Delete a synthetic set under `mockups/` only when no
      surviving generator, drift check or backend test reads it.
- [ ] 2.6 Re-point the three `scripts/check_owned_identifiers.py` rules at the
      desk's page and the surviving favicon. Remove dead entries from
      `scripts/public_allowlist.txt`, `scripts/public_scan_config.txt` and
      `scripts/check_public_links.py`, and delete `data.js` exports and client
      re-exports that no surviving caller uses.
- [ ] 2.7 Group gate: `npm ci && npm run build`, the fast-gate node line, full
      `uv run python -m pytest`, every surviving drift check, and the three guard
      scripts all pass.

## 3. One frontend root, and the v2 name leaves the living system

- [ ] 3.1 Merge `frontend-v2/` into `frontend/` and apply every rename in
      design.md "Naming boundary", using `git mv` so history follows. Fix every
      import, config path, tsconfig input, Dockerfile COPY and allowlist entry.
- [ ] 3.2 Rename router, server and CI identifiers per the naming boundary.
- [ ] 3.3 Reconcile the living documents to one shell at root: `AGENTS.md`
      (install, gate list, browser legs, ledger sizes, layout, conventions),
      `README.md`, `PRODUCT.md`, `mockups/INDEX.md`, `mockups/SCAFFOLD.md`, and
      the `ui-surfaces:` line. Historical records stay byte-identical.
- [ ] 3.4 Amend `openspec/changes/harmonic-v2/`: rewrite its serving requirement
      to the root address with no v1, tick tasks 3.5, 4.2 and 4.3 citing ADR 416,
      and add one line to its design step 5 naming the supersession.
- [ ] 3.5 Group gate: the group 2 gate again, plus `npx --yes
      @fission-ai/openspec@1 validate --all --strict`, and a tracked-path search
      proving no living path or identifier carries the v2 name outside the
      historical set.

## 4. Live browser run, corrections, and the complete gate

- [ ] 4.1 On the commit to be pushed, build once and run the desk suite, the
      follow-up suite and the browser-runner regression. Fold every correction
      back and re-run only what the correction touches.
- [ ] 4.2 Run the complete desk ledger once at each accepted size against the
      built, Python-served, root-addressed app with no story deferred. Restore
      any committed synthetic database the serve mutated through its generator.
- [ ] 4.3 Run the complete pull-request gate from `AGENTS.md` once and the image
      package proof, and record the outputs under `evidence/`.
