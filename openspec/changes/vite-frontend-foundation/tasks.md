# Tasks

1. [x] Add the repository-root production package: `package.json` (private,
   exact pins `vite@8.2.2`, `vue@3.5.42`, `echarts@5.5.0`,
   `@vitejs/plugin-vue@6.0.8`, documented `engines.node` 22, scripts `dev` and
   `build`, and no `type` field — the shell's modules are ESM while
   `frontend/browser-runner.js`, `frontend/harness-api-paths.test.js` and the
   new `frontend/built-shell.js` are CommonJS, and Node's per-file detection
   must keep classifying them exactly as it does with no manifest today), the
   committed `package-lock.json`, `vite.config.mjs` (root
   `frontend/`, base `/`, output `frontend/dist`, `minify` off, the Vue plugin,
   `vue` aliased to the runtime-with-compiler build, dev proxy of `/api` only to
   `http://127.0.0.1:8765`) and a `tsconfig.json` that admits `.ts` and `.vue`
   under `frontend/` without converting any module.
2. [x] Make the shell a Vite input: `frontend/main.js` installs the one bundled
   ECharts identity on `window.echarts`; `frontend/index.html` drops the importmap
   and the CDN script tag, references `./main.js` ahead of its inline module, and
   its inline module, stylesheet links and icon reference siblings relatively;
   `frontend/index.test.js` retargets its three `/assets/`-absolute assertions
   (the workstation import, the Verify stylesheet link, the icon link) to the
   relative references; `frontend/shell.css` loses its `body { background:
   var(--ck-ground); }` declaration (line 24), which the inline body rule at
   `index.html:96-101` overrides on every page today and which would win once
   the stylesheets are hoisted past the inline blocks, stripping the body's
   radial-gradient layer. Runtime templates and every other vue-free module stay
   byte-identical.
3. [x] Admit the new files and ignore the outputs: `scripts/public_allowlist.txt`
   lists the four root files and admits `.ts` and `.vue` under `frontend/`;
   `.dockerignore` excludes `node_modules/`, `frontend/dist/` and `harness/`.
   Prove `npm ci && npm run build` from a clean checkout emits
   `frontend/dist/index.html` with no CDN URL anywhere under `frontend/dist`.
4. [x] Serve built bytes from Python: `/` and the six page paths answer
   `frontend/dist/index.html` with `no-cache`; `/assets` is one prefix-scoped
   directory route over `frontend/dist/assets` with an immutable cache header;
   the forty-one per-file source routes go; an absent `frontend/dist/index.html`
   logs the rebuild instruction once at app construction and the shell routes
   answer 503 with it, never raw source; `/api` routing and token behaviour are
   unchanged.
5. [x] Retarget the Python contract tests to built output:
   `tests/test_frontend_asset_routes.py` (page routes, every asset
   `dist/index.html` references answers with the dist bytes and content type, and, after first
   asserting `frontend/dist/index.html` exists, no file under `frontend/dist`
   names `unpkg.com` or `jsdelivr.net`, `Cache-Control: no-cache` on `/` and on
   each of the six page paths and the immutable cache header on an `/assets`
   response, `/api`
   isolation, the 404 set, the missing-build 503 proven with the dist location
   redirected to an empty directory — converting every existing assertion to its
   built-output equivalent and dropping none, including the `rest-window.js`
   non-exposure guard and the generated-interface guard on `/api/openapi.json`,
   `/api/docs` and `/api/redoc`), the per-source-asset tests in
   `tests/test_api.py`, and `tests/test_deploy_assets.py` (the Dockerfile copies
   `frontend/dist` from the Node stage, copies no `frontend` source, and its
   runtime stage installs no Node).
6. [x] Deliver the same artifact on every supported path: a `node:22` Dockerfile
   build stage running `npm ci && npm run build` with the runtime copying only
   `frontend/dist`; the CI backend job sets up Node 22 with an npm cache and
   builds before `pytest`; a pull-request-time Docker job that builds the image
   with no push, loads it, asserts the runtime image has no `node` on its
   `PATH`, starts `harmonic serve --no-fetch --token ''` inside it against a
   copy of the QA showcase database and asserts `/` answers the built shell
   (a 200 whose body references `/assets/index-`);
   README install, run and Docker prose; AGENTS.md install, layout and
   conventions prose; the `ciq_autotune/api.py` cache comment; the
   `tests/test_check_public_links.py` bare-specifier docstring; the AGENTS.md
   QA copy-then-serve block, which gains `npm ci && npm run build` as the
   documented prerequisite of the one permitted offline serve; and the Purpose
   paragraph of `openspec/specs/surfaces/spec.md`, which no requirement delta
   carries and which still says "no build step".
7. [ ] One shared built-shell helper for browser legs, `frontend/built-shell.js`
   (dependency-free CommonJS beside `browser-runner.js`), exporting one factory
   `createBuiltShell({ dist })`: `dist` defaults to `frontend/dist` beside the
   module and is overridden by the `HARMONIC_DIST` environment variable when set;
   construction throws `frontend/dist/index.html is missing — run npm ci && npm
   run build` when that file is absent; `serve(pathname)` returns
   `{ body, contentType }` for `/`, the six page paths and existing `/assets/*`
   files and `null` for anything else, so a Playwright route handler and a Node
   `http` request handler each adapt it in one line. `frontend/built-shell.test.js`
   covers the throw, the page and asset mapping and the `null` cases against a
   temporary dist it writes itself, so the dependency-free fast gate passes with
   `frontend/dist` absent.
8. [ ] Every browser leg loads the built shell through that helper and vendors
   nothing from a CDN: the five legs that route the page through Playwright
   (`cockpit-shell.browser.test.mjs`, `diagnose-workstation.browser.test.mjs`, the
   workstation, event-comparison and Verify behaviour replays) and the two that
   serve it from a `node:http` fixture server (`day-surface.browser.mjs`,
   `plan-first-match.browser.mjs`) answer `/`, the page paths and `/assets/*`
   from the helper; `diagnose-canvas-composition.browser.test.mjs` drops its
   `VENDOR_DIR` preflight; `mockups/diagnose-event-comparison-support-audit.mjs`
   changes only if the replay opener it imports changes shape. Every leg's
   preflight collects a missing build beside a missing Playwright module, so a run
   lacking either names both and exits nonzero before any browser launches. The
   S71 stage probe instruments the served built chunk that carries the workstation
   seam instead of `/assets/diagnose-workstation.js`; the cockpit-shell asset
   assertion checks that every asset the shell requested loaded under `/assets`
   and that at least one script and one stylesheet did; the workstation suite's
   module-isolation page reads ECharts from
   `node_modules/echarts/dist/echarts.min.js`.
   `frontend/browser-gates-fail-closed.test.js` spawns every shell-serving leg
   (the seven above) and `diagnose-canvas-composition.browser.test.mjs` with
   `HARMONIC_DIST` pointed at an empty directory, once without
   `PLAYWRIGHT_MODULE` (expect both named) and once with it (expect the build
   command named), asserting a nonzero exit each time.
   `frontend/browser-runner.browser.test.mjs` serves inline HTML and no shell;
   only its comment naming `VENDOR_DIR` changes.
   `scripts/ensure_browser_gate_env.py` and `scripts/screenshots.local.mjs` stop
   vendoring CDN modules; the screenshot wrapper constructs the helper only
   when it serves a page, never at import, so `scripts/screenshots.local.test.mjs`
   keeps passing in the build-free `frontend` CI job.
9. [ ] CI browser gates build first: the browser-gate-setup and leg jobs run
   `npm ci && npm run build` with an npm cache keyed on the lockfile and drop the
   CDN vendor download, the `matrix.vendor` flag and the `ciq-vendor` cache; the
   AGENTS.md browser-gates block drops the two `curl` lines and every `VENDOR_DIR`.
