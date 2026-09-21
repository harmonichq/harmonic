# Tasks — retire the v1 app (#416)

Task groups run in order. Each group leaves the branch green on the gates that
group names; the complete pull-request gate runs once, in group 4. `spike.md`
records what deleting v1 breaks, as executed by triage; read it before group 1.

## 1. Stand the desk alone, then serve it at root

- [ ] 1.1 Rehome the desk's lifted material, chart key and glossary as committed
      desk source, the way spike.md "Method" step 1 did it. Record the
      before/after comparison of the built CSS and the glossary under
      `evidence/`. Delete `frontend-v2/app-source.mjs`, its test, the virtual
      modules and their plugin in `vite.config.v2.mjs`. v1's page is untouched.
- [ ] 1.2 Re-point the three lifts in `mockups/harmonic-v2.exploration/generate.py`
      (glossary, chart key, combined stylesheet) from v1's page to the rehomed
      desk source, and regenerate. Its `--check` must pass; explain any output
      diff beyond the embedded source paths line by line under `evidence/`.
- [ ] 1.3 Copy out of the two v1 replay files every export the surviving tree
      imports from them, with whatever each calls, unchanged, into the desk's
      replay source, and re-point the importers. spike.md names the fifteen and
      measures their reach (38 declarations, about 800 lines); confirm the list
      with an executed search for importers of the two files, not from the list
      alone. Leave the two v1 replay files in place; group 2 deletes them. In
      `frontend/diagnose-workstation.test.js`, the three imports move with the
      copy and the C44/C56 source-text assertion is deleted, because those are
      v1 ledger stories.
- [ ] 1.4 Rewrite `tests/test_frontend_asset_routes.py` first. It asserts the
      closed non-API route set `/`, `/diagnose`, `/changes`, `/day`, `/assets`,
      with `/v2`, `/v2/`, `/v2/diagnose`, `/v2/assets/x.js`, `/verify`, `/plan`,
      `/settings`, `/guide`, `/index.html` and an unlisted path all 404 and none
      a redirect. It keeps the agreement check, re-pointed: the desk's
      destination list in `frontend/tab-routing.js`, the page tuple in
      `ciq_autotune/api.py` and the page-path set in `frontend/built-shell.js`
      name the same pages. Record its failure against the unchanged server,
      then make it pass.
- [ ] 1.5 In `ciq_autotune/api.py`, serve the desk's built shell at `/` and the
      three page paths and its built assets at `/assets`; remove the v1 shell
      routes, `SPA_PAGES`, the v1 build check and the `/v2` routes and mount.
      Keep one fail-closed missing-build answer (503 naming the build command,
      API still reachable) and the cache-control policy for pages and assets.
- [ ] 1.6 Set the desk build's base to `/`. Move the browser router's desk prefix
      to root (`frontend/tab-routing.js`). Make the disk-serving mirror
      (`frontend/built-shell.js`) serve only the desk's page set and `/assets/`:
      its v1 arm and the v1 cases in its unit test go, and the surviving arm
      reads `HARMONIC_DIST` and throws the build-command message when that
      directory has no built page, because that is the variable and the message
      the fail-closed regression drives.
- [ ] 1.7 In `frontend/browser-gates-fail-closed.test.js`, the suite list becomes
      exactly the one surviving shell-serving leg, the desk browser suite,
      spawned by its real path, keeping both assertions (names
      `PLAYWRIGHT_MODULE`, names the build command). Add an assertion that the
      list has at least one entry. Delete the Explore-mode source check. This
      lands here, not with the deletions, because 1.6 removes the arm the v1
      suites failed closed through.
- [ ] 1.8 Re-point every desk test, browser suite and replay opener from `/v2/...`
      to the root address. Amend the desk ledger per design.md "Ledger
      amendment": S86 asserts the root address set; S87 is retired as `R19` with
      an executable registry body; no other story's assertions change. Move the
      frozen inventory literal in the acceptance driver and its test with it: 142
      issued stays, active goes 124 to 123, retired goes 18 to 19. The driver's
      frozen smoke slice names `S87`; it becomes `R19`, and the test's pinned
      SHA-256 of that list is regenerated from the new list.
- [ ] 1.9 Delete the v1-against-desk comparison driver
      `mockups/sweep/harmonic-v2-desktop/clinical-pairs.mjs` and its two tests in
      `frontend-v2/c4.replay.test.js`.
- [ ] 1.10 Update the acceptance driver's package proof and its test to the root
      route set and 404 list; update the three v1 delivery tests in
      `tests/test_api.py` (spike.md names them) and `tests/test_deploy_assets.py`
      to the one shell; update the `Dockerfile` so the image builds and ships one
      shell. `test_deploy_assets.py` reads the Dockerfile's text and passed the
      spike unchanged, so change its expectations with the Dockerfile.
- [ ] 1.11 Group gate: `npm ci && npm run build`; `uv run python -m pytest
      tests/test_frontend_asset_routes.py tests/test_api.py
      tests/test_deploy_assets.py`; the fast-gate node line;
      `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py`;
      `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.py case-cache
      --check --out <a fresh directory outside the checkout>`; and
      `uv run python mockups/harmonic-v2.exploration/generate.py --check`.

## 2. Delete v1

- [ ] 2.1 Delete the v1 shell page, the v1 Vite config, the two v1 replay files,
      and every `frontend/` file that fails the survival rule in design.md;
      `spike/deleted.txt` and `spike/frontend-survivors.txt` are the executed
      grounding. v1's exports inside surviving shared modules go with v1: in
      `frontend/tab-routing.js`, `TABS`, `resolveTab`, `routeState`, `parseRoute`
      and `serializeRoute` with their cases in `frontend/tab-routing.test.js`
      (the desk imports only the desk route functions, `subscribeRoute`,
      `writeRoute` and `resolveDestination`; `subscribeRoute` and `writeRoute`
      default a parameter to the deleted v1 functions, so those defaults become
      the desk's), and in `frontend/data.js` and the
      desk's client re-export, every export no surviving caller uses. Remove
      `vue` and `@vitejs/plugin-vue` from `package.json` and the lockfile;
      `npm run build` runs the one desk build.
- [ ] 2.2 Delete these nine browser legs from `.github/workflows/ci.yml`, by gate
      name, with their suites, drivers, replays and behavior ledgers: Day
      lifecycle; Diagnose workstation; Diagnose canvas composition; Cockpit
      shell; First-plan reconcile; Diagnose workstation behaviour ledger;
      Diagnose event comparisons; Diagnose comparison support audit; Verify
      behaviour ledger. Delete the matrix keys and steps no surviving entry
      selects (the no-fetch server step's only selector goes). The
      event-comparison capture, its generator and its `--check` step stay: a
      surviving generator and a surviving module read the capture. Keep Browser
      runner lifecycle, V2 desk, V2 Trial and Pattern Focus and the desk ledger
      jobs.
- [ ] 2.3 Retire the two generators whose fixture has no surviving reader, with
      fixture and CI step together: `scripts/gen_ic_block_fixtures.py`
      (`ic-blocks.json`) and `scripts/gen_annotation_fixtures.py`
      (`engine-annotations.json`), their backend tests if any, and their entries
      in the acceptance driver's drift-check list. Drop the
      readerless `episode.carb-undercount.json` output from
      `scripts/gen_chart_builder_fixtures.py`. Confirm each "no reader" with an
      executed search before deleting.
- [ ] 2.4 Delete `harness/`, `frontend/harness-api-paths.test.js`, and the three
      design explorations that read v1's source and that nothing surviving reads,
      with their `--check` steps in CI, their backend tests
      (`tests/test_evidence_canvas_generator.py`) and their entries in the
      acceptance driver (its drift-check list and its routing-drift check):
      `mockups/finding-evidence-routing.exploration/` (with
      `mockups/finding-evidence-routing.behavior.md`),
      `mockups/diagnose-evidence-canvas.exploration/` and
      `mockups/clock-window-wrap.exploration/`. Delete
      `mockups/cockpit-shell.behavior.md` and
      `mockups/explore-investigation.fixture.js`. Delete a synthetic set under
      `mockups/` only when no surviving generator, drift check, test or module
      reads it. The acceptance driver's build requirement names both shells;
      it becomes the one desk build.
- [ ] 2.5 Re-point `scripts/check_owned_identifiers.py`: the browser title rule at
      the desk's page, the favicon rule at the surviving favicon, and the header
      wordmark rule at the desk's chrome module, where the wordmark is emitted
      mid-line, so its pattern moves with it. Prove once that the guard still
      fails on a misspelled wordmark. Remove every reference to a deleted file
      from the living code, test and script files spike.md lists (`AGENTS.md`,
      `README.md` and `PRODUCT.md` are task 3.3's, not this task's), including
      `scripts/public_allowlist.txt`, `scripts/public_scan_config.txt`,
      `scripts/check_public_links.py` and the four backend tests.
- [ ] 2.6 Group gate: `npm ci && npm run build`, the fast-gate node line, full
      `uv run python -m pytest` (about 5 minutes on this Mac), every surviving
      drift check, the three guard scripts, and the acceptance driver's own test
      and `case-cache --check` as in 1.11 all pass.

## 3. One frontend root, and the v2 name leaves the living system

- [ ] 3.1 Merge `frontend-v2/` into `frontend/` and apply every rename in
      design.md "Naming boundary", using `git mv` so history follows. Fix every
      import, config path, tsconfig input, Dockerfile COPY and allowlist entry,
      carrying every private deny line in `scripts/public_allowlist.txt` to its
      file's new path. The acceptance driver stays where it is, but it names
      moved paths as data: its input list, its smoke-selection global files and
      symbols, its story roots, its replay module path, its `node-v2` glob, its
      case-cache import and its public-tree assertion. Updating those path
      strings is part of this task.
- [ ] 3.2 Rename router, server and CI identifiers per the naming boundary.
- [ ] 3.3 Reconcile the living documents to one shell at root: `AGENTS.md`
      (install, gate list, drift-check count, browser legs, ledger story counts,
      layout, conventions), `README.md`, `PRODUCT.md`, `mockups/INDEX.md`,
      `mockups/SCAFFOLD.md`, and the `ui-surfaces:` line. Historical records stay
      byte-identical.
- [ ] 3.4 Amend `openspec/changes/harmonic-v2/`: rewrite its serving requirement
      to the root address with no v1, tick tasks 3.5, 4.2 and 4.3 citing ADR 416,
      and add one line to its design step 5 naming the supersession.
- [ ] 3.5 Group gate: the group 2 gate again, plus `npx --yes
      @fission-ai/openspec@1 validate --all --strict`, plus the acceptance
      driver's own test and `case-cache --check` as in 1.11, plus
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
