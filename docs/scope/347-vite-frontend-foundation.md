# #347 — Vite production foundation scope

Triage ledger for #347. The authoritative plan is
`openspec/changes/vite-frontend-foundation/`; this page records what was decided,
what was measured, and how the order was reviewed.

## Decisions

### Risk contract

Recorded in `openspec/changes/vite-frontend-foundation/proposal.md` (Risk
contract). Disposition: inline; the proposal is the authoritative copy.

### Settled by the operator on 2026-09-06 (do not re-litigate)

- The production frontend gets a build step now. ADR 213's second record ("the
  shipped artifact stays buildless by default") is superseded by ADR 347.
- Scope is #347 as filed: a lift and shift of the current shell onto Vite. No
  component extraction, no TypeScript conversion, no redesign; #348's v2 plan is
  separate work and its worktrees are not touched.
- Root `package.json` and lockfile with exact pins; Vite root `frontend/`,
  output `frontend/dist/`; dev proxy for `/api` only; Vue plugin and a
  `tsconfig.json` so `.vue`/`.ts` files are admitted; no existing module converted.
- Python serves the built output and fails closed with a rebuild instruction when
  it is missing. No CDN fallback, no raw-source fallback.
- Node 22 everywhere the repository names a Node version (package `engines`,
  Docker build stage, CI), matching the existing CI pin.
- One ticket branch, one pull request against `main`, left unmerged. If the #350
  QA sweep lands on `main` first, the ticket branch merges `origin/main` before the
  pull request opens.

### Settled by the coordinator (design, recorded in ADR 347)

- `build.minify` off: readable shipped bytes for an advisory dosing tool, and the
  S71 replay probe keeps finding its seam in the served chunk by text.
- `vue` aliased to the runtime-with-compiler build; every template compiles in the
  browser today.
- `frontend/main.js` installs `window.echarts` and is referenced ahead of the
  inline module, which stays inline. The inline module's `/assets/` specifiers,
  the stylesheet links and the icon become relative siblings.
- `/assets` becomes one prefix-scoped directory route over `frontend/dist/assets`
  (immutable cache); the shell keeps `no-cache`; a missing build answers the shell
  routes 503 with the build command and keeps the API up.
- Docker gains a `node:22` build stage; the runtime copies only `frontend/dist`.
  Docker is absent on the operator's machine, so a pull-request-time `docker
  build` job (no push) is the image proof.
- Every browser leg serves the built shell through one dependency-free helper
  beside `browser-runner.js`; `VENDOR_DIR` and the CDN vendor download retire; the
  workstation suite's module-isolation page reads ECharts from `node_modules`.
- The backend CI job installs Node and builds before `pytest`; the frontend job
  stays npm-free.

### Scope route

`/scope` found no open product decision: the ticket fixes the delivery target and
its acceptance, the operator settled the remaining defaults above, and the change
alters no rendered surface. Classification: `code`. Surface lifecycle: `none`.

## Open questions

None.

## Spawned tasks

None.

## Grounding and preflight

Every block below is `command → output`, run in this worktree at
`b8f4a71 docs: archive findings layout exploration (#349)` on 2026-09-06 unless a
block says otherwise.

### Toolchain and registry

```text
$ node --version; npm --version
v26.7.0
11.19.0

$ for p in vite vue echarts @vitejs/plugin-vue; do printf "%s: " "$p"; npm view "$p" version; done
vite: 8.2.2
vue: 3.5.42
echarts: 6.1.0
@vitejs/plugin-vue: 6.0.8

$ npm view 'echarts@5' version | tail -2
echarts@5.5.1 '5.5.1'
echarts@5.6.0 '5.6.0'

$ npm view vite@8.2.2 engines
{ node: '^20.19.0 || >=22.12.0' }

$ npm view @vitejs/plugin-vue peerDependencies
{ vue: '^3.2.25', vite: '^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0' }

$ command -v docker; echo "exit=$?"
exit=1

$ uv --version
uv 0.11.25 (1fc7de7c4 2026-06-26 aarch64-apple-darwin)
```

ECharts is pinned at 5.5.0, the version the CDN tag serves today; the 6.x line is
a major change #347 does not authorise.

### The shell today

```text
$ wc -l < frontend/index.html
5571

$ grep -n '<script type="importmap">\|cdn.jsdelivr\|<script type="module">' frontend/index.html
13:  <script type="importmap">
16:  <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
2238:  <script type="module">

$ grep -o -E "from ['\"]/assets/[a-z0-9-]+\.js['\"]" frontend/index.html | sort -u | wc -l
23

$ grep -c "window.echarts" frontend/*.js | grep -v ':0'
frontend/diagnose-event-comparison.js:1
frontend/diagnose-workstation.js:3

$ grep -c '@app.get("/assets/' ciq_autotune/api.py
41

$ grep -n 'SPA_PAGES =' ciq_autotune/api.py
85:SPA_PAGES = ("day", "diagnose", "verify", "plan", "settings", "guide")
```

Sibling modules import one another relatively (`from './x.js'`); only the inline
module and the stylesheet links use `/assets/`-absolute specifiers.

### The build spike

`docs/scope/347-vite-build.spike.sh` copies the shipped frontend sources to a
scratch directory, applies the ADR 347 transform, and builds with the pinned
toolchain. Output of its run:

```text
index.html transformed 360220 -> 359874 chars; /assets/ left: 0
vite v8.2.2 building client environment for production...
transforming...
✓ 609 modules transformed.
rendering chunks...
computing gzip size...
frontend/dist/.vite/manifest.json              0.33 kB │ gzip:   0.18 kB
frontend/dist/assets/favicon-CW_IcLGp.svg      0.63 kB │ gzip:   0.43 kB
frontend/dist/index.html                     169.69 kB │ gzip:  38.07 kB
frontend/dist/assets/index-D-REnlkk.css      172.09 kB │ gzip:  47.83 kB
frontend/dist/assets/index-D1BGULFV.js     3,315.03 kB │ gzip: 799.87 kB

✓ built in 576ms
--- dist tree ---
frontend/dist/.vite/manifest.json
frontend/dist/assets/favicon-CW_IcLGp.svg
frontend/dist/assets/index-D-REnlkk.css
frontend/dist/assets/index-D1BGULFV.js
frontend/dist/index.html
--- CDN URLs in dist (want 0) ---
       0
--- seam in bundle (want >=1) ---
       1
--- vue compiler present (compile fn) ---
       1
--- dist/index.html script/link tags ---
7:  <link rel="icon" type="image/svg+xml" href="/assets/favicon-CW_IcLGp.svg" />
9:  <link rel="preconnect" href="https://fonts.googleapis.com" />
10:  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
11:  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
1334:  <script type="module" crossorigin src="/assets/index-D1BGULFV.js"></script>
1335:  <link rel="stylesheet" crossorigin href="/assets/index-D-REnlkk.css">
```

That run had `manifest: true` in its config; the committed spike drops it because
Python does not read the manifest.

### The mount spike

`docs/scope/347-built-shell-mount.spike.mjs` serves that build from disk through
Playwright routes and lets `/api/*` reach the no-fetch app started with the QA
copy-then-serve command on port 8791. Output:

```text
{"path":"/diagnose","echartsGlobal":"function","mustachesLeft":false,"dwMounted":true,"canvases":3,"bodyChars":837,"title":"Harmonic","text":"Harmonic ADVISORY 1 Diagnose → 2 Plan → 3 Verify Day SCOPE Jun 1–Jun 30 30 d ＋ Log carbs WINDOW Overnight Morning Afternoon Evening 24 h GLUCOSE BY TIME OF DAY "}
{"path":"/day","echartsGlobal":"function","mustachesLeft":false,"dwMounted":false,"canvases":1,"bodyChars":1043,"title":"Harmonic","text":"Harmonic ADVISORY 1 Diagnose → 2 Plan → 3 Verify Day SCOPE Jun 1–Jun 30 30 d ＋ Log carbs Navigator SUN Jun 30 ‹ › Latest ▽ lows △ highs ✓ ≥70% ⤢ month ▾ Sun 30 "}
{"path":"/plan","echartsGlobal":"function","mustachesLeft":false,"dwMounted":false,"canvases":0,"bodyChars":902,"title":"Harmonic","text":"Harmonic ADVISORY 1 Diagnose → 2 Plan → 3 Verify Day SCOPE Jun 1–Jun 30 30 d ＋ Log carbs Active profile — QA synthetic profile · DIA 3h · max bolus 10U · carb e"}
{"path":"/verify","echartsGlobal":"function","mustachesLeft":false,"dwMounted":false,"canvases":1,"bodyChars":1088,"title":"Harmonic","text":"Harmonic ADVISORY 1 Diagnose → 2 Plan → 3 Verify Day SCOPE Jun 1–Jun 30 30 d ＋ Log carbs TRIAL Carb ratio · all day · 12 → 10 g/U · COMPLETE 0 other Trials ▾ 1 "}
external requests (want none): 0 []
errors: 4 [ 'Failed to load resource: net::ERR_FAILED' ]
```

The four `ERR_FAILED` entries are the four aborted Google Fonts requests, one per
page. Two earlier runs of the same script were inconclusive and are recorded so
they are not repeated: with `/api/*` stubbed as `{}` the compiled render threw on
the empty payloads and painted nothing; with the stored token empty the shell
mounted its chrome but the app made six API calls in total and drew no
workstation. The run above stores a non-empty token, as every existing replay does.

### Browser legs today

```text
$ grep -l "readFile(join(.*index.html" frontend/*.browser.mjs frontend/*.browser.test.mjs frontend/*.replay.mjs mockups/*.mjs
frontend/cockpit-shell.browser.test.mjs
frontend/diagnose-event-comparison-behavior.replay.mjs
frontend/diagnose-workstation-behavior.replay.mjs
frontend/diagnose-workstation.browser.test.mjs
frontend/verify-660-story-behavior.replay.mjs

$ grep -n "'index.html' : url.pathname.replace" frontend/day-surface.browser.mjs frontend/plan-first-match.browser.mjs
frontend/day-surface.browser.mjs:67:      ? 'index.html' : url.pathname.replace(/^\/assets\//, '');
frontend/plan-first-match.browser.mjs:90:      ? 'index.html' : url.pathname.replace(/^\/assets\//, '');

$ grep -n "stageProbe && path" frontend/diagnose-workstation-behavior.replay.mjs
656:      if (stageProbe && path === '/assets/diagnose-workstation.js') {

$ grep -n "for (const path of \['/assets/tab-routing.js'" frontend/cockpit-shell.browser.test.mjs
854:    for (const path of ['/assets/tab-routing.js', '/assets/data.js', '/assets/shell.css']) {

$ grep -n "cdn.jsdelivr" frontend/diagnose-workstation.browser.test.mjs
2409:              + '<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script></head>'
```

Every page-serving leg, including the three `TARGET=app` replays, answers `/`
and `/assets/*` from `frontend/` source through `page.route` and reroutes the two
CDN URLs to `VENDOR_DIR`; only `/api/*` reaches the running app. The workstation
replay's `appSource === 'server'` branch (`BASE_URL` set) lets the app serve the
page and intercepts `/assets/diagnose-workstation.js` for S71.
`diagnose-canvas-composition.browser.test.mjs` and `browser-runner.browser.test.mjs`
serve no `index.html`; the former still requires `VENDOR_DIR`.

### A sandboxed worker cannot launch Chromium

A Sonnet worker dispatched through `claude-worker.py` in `workspace-write` ran
`chromium.launch()` against the browser-gate Playwright install:

```text
LAUNCH FAILED: Error: browserType.launch: Target page, context or browser has been closed | Browser logs: |
Exit code: 0
```

This is the seatbelt failure AGENTS.md documents for Codex `workspace-write`. The
browser-leg chunk therefore ships a dependency-free unit test its worker can run,
and the coordinator runs the ten legs and returns verbatim output.

### CI facts

```text
$ grep -n -E 'run: (uv run python scripts/|python3 scripts/|node )' .github/workflows/ci.yml
35:        run: uv run python scripts/gen_ic_block_fixtures.py --check
41:        run: uv run python scripts/gen_annotation_fixtures.py --check
46:        run: uv run python scripts/gen_chart_builder_fixtures.py --check
51:        run: uv run python scripts/check_demo_fixtures.py
57:        run: uv run python scripts/gen_qa_e2e_db.py --check
64:        run: uv run python scripts/gen_findings_projection_fixtures.py --check
66:        run: uv run python scripts/gen_ic_history_event_fixtures.py --check
68:        run: uv run python scripts/gen_ic_block_evidence_fixtures.py --check
70:        run: uv run python scripts/gen_basal_night_evidence_fixtures.py --check
72:        run: uv run python scripts/gen_isf_rest_window_evidence_fixtures.py --check
74:        run: uv run python scripts/gen_missed_meal_comparison_fixtures.py --check
76:        run: uv run python scripts/gen_eating_sequence_fixtures.py --check
88:        run: python3 scripts/check_adr_numbers.py
90:        run: python3 scripts/check_owned_identifiers.py
95:        run: python3 scripts/check_public_allowlist.py
130:        run: node --test 'frontend/**/*.test.js'
134:        run: node mockups/diagnose-event-comparison.synthetic/generate.mjs --check
136:        run: node --test scripts/screenshots.local.test.mjs
150:        run: node mockups/finding-evidence-routing.exploration/build.mjs --check

$ grep -n -E 'gate:' .github/workflows/ci.yml | wc -l
10

$ grep -n "if: github.event_name == 'push' && github.ref == 'refs/heads/main'" .github/workflows/ci.yml
337:    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Line 37 also runs `uv run python mockups/diagnose-evidence-canvas.exploration/generate.py --check`.
The Docker image builds only on pushes to `main`; nothing builds it on a pull
request today. The browser legs run on Node 22 with a cached Playwright and a
cached pair of CDN modules.

### Public tree

```text
$ grep -n -E '^frontend/|^harness/|^\.dockerignore|^Dockerfile|^uv\.lock' scripts/public_allowlist.txt
3:uv.lock
4:Dockerfile
5:.dockerignore
21:frontend/** {.html,.js,.mjs,.css,.svg,.json}
22:harness/** {.html,.js,.json}
```

Root files are listed one by one; `package.json`, `package-lock.json`,
`vite.config.js` and `tsconfig.json` are not yet dispositioned, and the
`frontend/**` glob admits neither `.ts` nor `.vue`. `.gitignore` already ignores
`dist/` (line 13) and `node_modules/` (line 166).

### Closed document inventory

Live prose that states the buildless or CDN-loaded shell, found by grepping every
`*.md`, `*.yml`, `*.py`, `*.json`, `*.sh`, `*.txt` and the Dockerfile for `unpkg`,
`jsdelivr`, `importmap`, `buildless`, `no build step`, `build step`, `VENDOR_DIR`
and `CDN`, then dropping archived changes and scope ledgers (history, kept as is):

- `README.md:152` — Docker "carries no Node, because the SPA has no build step";
  Install and Workflow sections gain the build prerequisite.
- `AGENTS.md:122-146` — browser-gates block (two `curl` lines, `VENDOR_DIR` on
  seven legs); `AGENTS.md:266` — "loaded from a CDN, no build step";
  `AGENTS.md:439-441` — importmap in Conventions; the fast-gate paragraph and
  Install section gain the build.
- `.github/workflows/ci.yml:156,185-198,294-301` — vendor download and cache.
- `Dockerfile` — comments on `frontend/` beside the package.
- `ciq_autotune/api.py:454` — "no build step and no fingerprinted filenames".
- `scripts/ensure_browser_gate_env.py:5-9,34-35,62` — vendor provisioning.
- `scripts/screenshots.local.mjs:7,33-42,71` — vendored CDN serving.
- `tests/test_check_public_links.py:160` — docstring names the importmap (wording).
- `openspec/specs/surfaces/spec.md:5,9-26` and `openspec/specs/http-api/spec.md:15-24`
  — carried by this change's spec deltas.

Unchanged by design: `harness/` (its own package; imports shipped modules from
the filesystem), `mockups/diagnose-evidence-canvas.exploration/generate.py` and
`mockups/finding-evidence-routing.exploration/build.mjs` (read source
`<style>` blocks and modules, not the CDN lines), `frontend/harness-api-paths.test.js`
(checks harness paths against `@app.*` declarations, which the API routes keep).

## Slicing

Traits fired: **multiple deliverable artifacts** (a build package, Python
delivery with its tests, Docker and CI, and browser evidence each have distinct
consumers); **live run inside the ticket** (the browser legs run against the
built shell and the no-fetch app, and the coordinator must run them because a
sandboxed worker cannot); **lockstep copies of one fact** (the Node version and
the pinned versions appear in the package, the lockfile, the Dockerfile, CI and
prose; the build command appears in README, AGENTS.md, CI, the fail-closed
messages and the 503 body). Three serial chunks: the build input, then Python
delivery and packaging, then browser evidence, each consuming the prior chunk's
output. The reviewer-memory store for this repository is empty, so no anchor
agreed or disagreed.

## Review rounds

Filled by the mandatory `/plan-review` rounds below; each blocker is tagged
`authoring` (present since the draft) or `injected` (introduced by a fix round).
