# Tasks

1. [ ] Add the repository-root production package: `package.json` (private,
   exact pins `vite@8.2.2`, `vue@3.5.42`, `echarts@5.5.0`,
   `@vitejs/plugin-vue@6.0.8`, documented `engines.node` 22, scripts `dev` and
   `build`), the committed `package-lock.json`, `vite.config.js` (root
   `frontend/`, base `/`, output `frontend/dist`, `minify` off, the Vue plugin,
   `vue` aliased to the runtime-with-compiler build, dev proxy of `/api` only to
   `http://127.0.0.1:8765`) and a `tsconfig.json` that admits `.ts` and `.vue`
   under `frontend/` without converting any module.
2. [ ] Make the shell a Vite input: `frontend/main.js` installs the one bundled
   ECharts identity on `window.echarts`; `frontend/index.html` drops the importmap
   and the CDN script tag, references `./main.js` ahead of its inline module, and
   its inline module, stylesheet links and icon reference siblings relatively.
   Runtime templates and every vue-free module stay byte-identical.
3. [ ] Admit the new files and ignore the outputs: `scripts/public_allowlist.txt`
   lists the four root files and admits `.ts` and `.vue` under `frontend/`;
   `.dockerignore` excludes `node_modules/`, `frontend/dist/` and `harness/`.
   Prove `npm ci && npm run build` from a clean checkout emits
   `frontend/dist/index.html` with no CDN URL anywhere under `frontend/dist`.
4. [ ] Serve built bytes from Python: `/` and the six page paths answer
   `frontend/dist/index.html` with `no-cache`; `/assets` is one prefix-scoped
   directory route over `frontend/dist/assets` with an immutable cache header;
   the forty-one per-file source routes go; an absent `frontend/dist/index.html`
   logs the rebuild instruction once at app construction and the shell routes
   answer 503 with it, never raw source; `/api` routing and token behaviour are
   unchanged.
5. [ ] Retarget the Python contract tests to built output:
   `tests/test_frontend_asset_routes.py` (page routes, every asset
   `dist/index.html` references answers with the dist bytes and content type,
   `/api` isolation, the 404 set, the missing-build 503), the per-source-asset
   tests in `tests/test_api.py`, and `tests/test_deploy_assets.py` (the Dockerfile
   copies `frontend/dist` from the Node stage, copies no `frontend` source, and
   its runtime stage installs no Node).
6. [ ] Deliver the same artifact on every supported path: a `node:22` Dockerfile
   build stage running `npm ci && npm run build` with the runtime copying only
   `frontend/dist`; the CI backend job sets up Node 22 with an npm cache and
   builds before `pytest`; a pull-request-time `docker build` job with no push;
   README install, run and Docker prose; AGENTS.md install, layout and
   conventions prose; the `ciq_autotune/api.py` cache comment; the
   `tests/test_check_public_links.py` bare-specifier docstring.
7. [ ] One shared built-shell route helper for browser legs:
   `frontend/built-shell.js` (dependency-free CommonJS beside
   `browser-runner.js`) answers `/`, the six page paths and `/assets/*` from
   `frontend/dist`, fails closed naming `npm ci && npm run build` when
   `frontend/dist/index.html` is absent, and ships `frontend/built-shell.test.js`
   under the dependency-free Node runner.
8. [ ] Every browser leg serves the built shell through that helper and vendors
   nothing from a CDN: the nine page-serving legs (`day-surface.browser.mjs`,
   `plan-first-match.browser.mjs`, `diagnose-workstation.browser.test.mjs`,
   `diagnose-canvas-composition.browser.test.mjs`,
   `cockpit-shell.browser.test.mjs`, the three behaviour replays and
   `mockups/diagnose-event-comparison-support-audit.mjs`) drop `VENDOR_DIR` and
   source routing; the S71 stage probe instruments the served built chunk that
   carries the workstation seam instead of `/assets/diagnose-workstation.js`;
   the cockpit-shell asset assertion checks that every asset the shell requested
   loaded under `/assets` and that at least one script and one stylesheet did;
   the workstation suite's module-isolation page reads ECharts from
   `node_modules/echarts/dist/echarts.min.js`;
   `frontend/browser-gates-fail-closed.test.js` asserts the new fail-closed
   messages; `scripts/ensure_browser_gate_env.py` and
   `scripts/screenshots.local.mjs` stop vendoring CDN modules.
9. [ ] CI browser gates build first: the browser-gate-setup and leg jobs run
   `npm ci && npm run build` with an npm cache keyed on the lockfile and drop the
   CDN vendor download and its cache; the AGENTS.md browser-gates block drops the
   two `curl` lines and every `VENDOR_DIR`.
