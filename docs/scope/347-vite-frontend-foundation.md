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
  beside `browser-runner.js`, `createBuiltShell({ dist })`, whose dist location
  the `HARMONIC_DIST` variable overrides so its fail-closed path is provable with a
  build present; `VENDOR_DIR` and the CDN vendor download retire; the workstation
  suite's module-isolation page reads ECharts from `node_modules`.
- The no-CDN invariant is enforced on every CI run by the Python contract test,
  not only by the build chunk's one-time check.
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

Every block below is `command → output`. The tree facts are emitted by
`docs/scope/347-generated-facts.sh`, pasted whole from one run at the commit its
first block names (regenerated at the merged ticket branch after the whole-diff
review); rerun the script to regenerate them. The registry, spike and
sandbox blocks were run once each on 2026-09-06 and are pasted whole from those
runs, with the commands exactly as typed.

### Tree facts (`sh docs/scope/347-generated-facts.sh`)

```text
## HEAD
$ git log -1 --format="%h %s"
31a1384 Align the CI QA server start with the documented recipe; clarify ADR 347's tense

## Toolchain
$ node --version; npm --version
v26.7.0
11.19.0

$ command -v docker; echo "exit=$?"
exit=1

$ uv --version
uv 0.11.25 (1fc7de7c4 2026-06-26 aarch64-apple-darwin)

## The shell today
$ wc -l < frontend/index.html
    5568

$ grep -n '<script type="importmap">\|cdn.jsdelivr\|<script type="module">' frontend/index.html
2235:  <script type="module">

$ grep -o -E "from ['\"]/assets/[a-z0-9-]+\.js['\"]" frontend/index.html | sort -u | wc -l
       0

$ grep -c 'window.echarts' frontend/*.js | grep -v ':0'
frontend/diagnose-event-comparison.js:1
frontend/diagnose-workstation.js:3
frontend/main.js:1

$ grep -c '@app.get("/assets/' ciq_autotune/api.py
0

$ grep -n 'SPA_PAGES =' ciq_autotune/api.py
88:SPA_PAGES = ("day", "diagnose", "verify", "plan", "settings", "guide")

$ grep -n 'assets' frontend/index.test.js

## Browser legs today
$ grep -n 'openApp\|VENDOR_DIR' mockups/diagnose-event-comparison-support-audit.mjs frontend/diagnose-canvas-composition.browser.test.mjs | head -8
mockups/diagnose-event-comparison-support-audit.mjs:21:  openApp,
mockups/diagnose-event-comparison-support-audit.mjs:39:const open = openApp;
frontend/diagnose-canvas-composition.browser.test.mjs:35:  openApp,
frontend/diagnose-canvas-composition.browser.test.mjs:91:  const page = await openApp(browser, {
frontend/diagnose-canvas-composition.browser.test.mjs:476:  const page = await openApp(browser, {

$ grep -l 'index.html' frontend/*.browser.mjs frontend/*.browser.test.mjs frontend/*.replay.mjs mockups/diagnose-event-comparison-support-audit.mjs
frontend/day-surface.browser.mjs
frontend/cockpit-shell.browser.test.mjs
frontend/diagnose-workstation.browser.test.mjs

$ grep -c 'VENDOR_DIR' frontend/day-surface.browser.mjs frontend/plan-first-match.browser.mjs frontend/diagnose-workstation.browser.test.mjs frontend/diagnose-canvas-composition.browser.test.mjs frontend/cockpit-shell.browser.test.mjs frontend/browser-runner.browser.test.mjs frontend/diagnose-workstation-behavior.replay.mjs frontend/diagnose-event-comparison-behavior.replay.mjs frontend/verify-660-story-behavior.replay.mjs mockups/diagnose-event-comparison-support-audit.mjs
frontend/day-surface.browser.mjs:0
frontend/plan-first-match.browser.mjs:0
frontend/diagnose-workstation.browser.test.mjs:0
frontend/diagnose-canvas-composition.browser.test.mjs:0
frontend/cockpit-shell.browser.test.mjs:0
frontend/browser-runner.browser.test.mjs:0
frontend/diagnose-workstation-behavior.replay.mjs:0
frontend/diagnose-event-comparison-behavior.replay.mjs:0
frontend/verify-660-story-behavior.replay.mjs:0
mockups/diagnose-event-comparison-support-audit.mjs:0

$ grep -n 'createServer' frontend/day-surface.browser.mjs frontend/plan-first-match.browser.mjs
frontend/day-surface.browser.mjs:8:import { createServer } from 'node:http';
frontend/day-surface.browser.mjs:32:  const server = createServer(async (req, res) => {
frontend/plan-first-match.browser.mjs:16:import { createServer } from 'node:http';
frontend/plan-first-match.browser.mjs:62:  const server = createServer(async (req, res) => {

$ grep -n 'stageProbe && path' frontend/diagnose-workstation-behavior.replay.mjs
652:      if (stageProbe && path.startsWith('/assets/') && path.endsWith('.js')) {

$ grep -n "for (const path of \['/assets/tab-routing.js'" frontend/cockpit-shell.browser.test.mjs

$ grep -n 'cdn.jsdelivr' frontend/diagnose-workstation.browser.test.mjs
2403:              + '<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script></head>'

$ grep -n 'PLAYWRIGHT_MODULE\|VENDOR_DIR' frontend/browser-gates-fail-closed.test.js
41:  delete env.PLAYWRIGHT_MODULE;
71:      assert.match(output, /PLAYWRIGHT_MODULE/, `${suite} must name PLAYWRIGHT_MODULE as missing`);
88:        HARMONIC_DIST: dir, PLAYWRIGHT_MODULE: module,

## CI facts
$ grep -n -E 'run: (uv run python (scripts|mockups)/|python3 scripts/|node )' .github/workflows/ci.yml
41:        run: uv run python scripts/gen_ic_block_fixtures.py --check
43:        run: uv run python mockups/diagnose-evidence-canvas.exploration/generate.py --check
47:        run: uv run python scripts/gen_annotation_fixtures.py --check
52:        run: uv run python scripts/gen_chart_builder_fixtures.py --check
57:        run: uv run python scripts/check_demo_fixtures.py
63:        run: uv run python scripts/gen_qa_e2e_db.py --check
70:        run: uv run python scripts/gen_findings_projection_fixtures.py --check
72:        run: uv run python scripts/gen_ic_history_event_fixtures.py --check
74:        run: uv run python scripts/gen_ic_block_evidence_fixtures.py --check
76:        run: uv run python scripts/gen_basal_night_evidence_fixtures.py --check
78:        run: uv run python scripts/gen_isf_rest_window_evidence_fixtures.py --check
80:        run: uv run python scripts/gen_missed_meal_comparison_fixtures.py --check
82:        run: uv run python scripts/gen_eating_sequence_fixtures.py --check
94:        run: python3 scripts/check_adr_numbers.py
96:        run: python3 scripts/check_owned_identifiers.py
101:        run: python3 scripts/check_public_allowlist.py
136:        run: node --test 'frontend/**/*.test.js'
140:        run: node mockups/diagnose-event-comparison.synthetic/generate.mjs --check
142:        run: node --test scripts/screenshots.local.test.mjs
156:        run: node mockups/finding-evidence-routing.exploration/build.mjs --check

$ grep -n -E 'gate:|vendor:' .github/workflows/ci.yml
206:          - gate: Day lifecycle
208:          - gate: Diagnose workstation
210:          - gate: Diagnose canvas composition
212:          - gate: Cockpit shell
218:          - gate: Browser runner lifecycle
220:          - gate: First-plan reconcile
233:          - gate: Diagnose workstation behaviour ledger
243:          - gate: Diagnose event comparisons
245:          - gate: Diagnose comparison support audit
252:          - gate: Verify behaviour ledger

$ grep -n "if: github.event_name == 'push' && github.ref == 'refs/heads/main'" .github/workflows/ci.yml
349:    if: github.event_name == 'push' && github.ref == 'refs/heads/main'

$ grep -n 'ciq-vendor\|matrix.vendor' .github/workflows/ci.yml

## Public tree
$ grep -n -E '^frontend/|^harness/|^\.dockerignore|^Dockerfile|^uv\.lock|^package|^vite|^tsconfig' scripts/public_allowlist.txt
22:uv.lock
23:Dockerfile
24:.dockerignore
25:package.json
26:package-lock.json
27:vite.config.mjs
28:tsconfig.json
57:frontend/** {.html,.js,.mjs,.ts,.vue,.css,.svg,.json}
63:harness/** {.html,.js,.json}

$ grep -n -E '^dist/|^node_modules/' .gitignore
13:dist/
166:node_modules/

$ cat .dockerignore
# Real PHI / secrets — never bake into an image layer.
tconnect-data/
.env

# VCS, local venv, caches, and dev-only trees.
.git/
.gitignore
.venv/
__pycache__/
*.pyc
*.egg-info/
.pytest_cache/
.claude/
node_modules/
frontend/dist/
harness/

# Design scratch — not part of the runtime app.
mockups/

## Docker
$ grep -n 'COPY\|FROM' Dockerfile
12:FROM python:3.12-slim-bookworm AS builder
15:COPY --from=ghcr.io/astral-sh/uv:0.11.25 /uv /uvx /usr/local/bin/
32:COPY pyproject.toml uv.lock ./
37:FROM node:22-bookworm-slim AS frontend-builder
41:COPY package.json package-lock.json ./
43:COPY vite.config.mjs tsconfig.json ./
44:COPY frontend ./frontend
48:FROM python:3.12-slim-bookworm AS runtime
60:COPY --from=builder /app/.venv /app/.venv
66:# COPY, /api/kb/<slug> 404s and every authored article reads "unknown article".
67:COPY ciq_autotune ./ciq_autotune
68:COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
69:COPY docs/kb ./docs/kb
70:COPY pyproject.toml README.md ./
71:COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

## The authorised offline server
$ grep -n 'harmonic serve --no-fetch' AGENTS.md .github/workflows/ci.yml
AGENTS.md:195:  uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765
.github/workflows/ci.yml:286:          uv run harmonic serve --no-fetch --token '' --db "$RUNNER_TEMP/harmonic-qa.sqlite" > "$RUNNER_TEMP/harmonic-no-fetch.log" 2>&1 &
```

Sibling modules import one another relatively (`from './x.js'`); only the inline
module and the stylesheet links use `/assets/`-absolute specifiers. Seven of the
ten browser matrix rows carry `VENDOR_DIR`; Day lifecycle, Browser runner
lifecycle and First-plan reconcile set `vendor: false`, and the two page-serving
legs among them load the CDNs live from their `node:http` fixture servers.

### Registry (network; run from the session scratch directory with `--cache ./npmcache`)

```text
$ npm --cache ./npmcache view vue version
3.5.42

$ npm --cache ./npmcache view echarts version
6.1.0

$ npm --cache ./npmcache view @vitejs/plugin-vue version
6.0.8

$ npm --cache ./npmcache view vite version 2>/dev/null
8.2.2

$ npm --cache ./npmcache view 'echarts@5' version 2>/dev/null | tail -2
echarts@5.5.1 '5.5.1'
echarts@5.6.0 '5.6.0'

$ npm --cache ./npmcache view vite@8.2.2 engines
{ node: '^20.19.0 || >=22.12.0' }

$ npm --cache ./npmcache view @vitejs/plugin-vue peerDependencies
{ vue: '^3.2.25', vite: '^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0' }
```

ECharts is pinned at 5.5.0, the version the CDN tag serves today; the 6.x line is
a major change #347 does not authorise. A first `npm view vite version` printed
only an `npm notice` line to the captured stream; the rerun above with stderr
dropped is the recorded value.

### The build spike

`docs/scope/347-vite-build.spike.sh` copies the shipped frontend sources to a
scratch directory, applies the ADR 347 transform, and builds with the pinned
toolchain. Output of its run (that run's config also set `manifest: true`, which
the committed spike drops because Python does not read the manifest):

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

### A sandboxed worker cannot launch Chromium

A Sonnet worker dispatched through `claude-worker.py` in `workspace-write` ran
`chromium.launch()` against the browser-gate Playwright install and returned:

```text
LAUNCH FAILED: Error: browserType.launch: Target page, context or browser has been closed | Browser logs: |
Exit code: 0
```

This is the seatbelt failure AGENTS.md documents for Codex `workspace-write`. The
browser-leg chunk therefore ships a dependency-free unit test its worker can run,
proves the fail-closed path without a browser, and leaves the ten legs to the
coordinator and the pull-request matrix.

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
- `.github/workflows/ci.yml:156,185-198,294-302` — vendor download and cache.
- `Dockerfile` — comments on `frontend/` beside the package.
- `ciq_autotune/api.py:454` — "no build step and no fingerprinted filenames".
- `scripts/ensure_browser_gate_env.py:5-9,34-35,62` — vendor provisioning.
- `scripts/screenshots.local.mjs:7,33-42,71` — vendored CDN serving.
- `tests/test_check_public_links.py:160` — docstring names the importmap (wording).
- `frontend/index.test.js:54,91,103` — three `/assets/`-absolute assertions.
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

Each blocker is tagged `authoring` (present since the draft) or `injected`
(introduced by a fix round). Reviewer identities stay out of this file.

### Round 1 — one cold read and a two-seat panel on the first draft

Cold read: BLOCKED, five blocking. Panel: two refusals, five blocking, six notes.
Overlaps collapsed, the distinct blockers were:

1. `authoring` — one acceptance anchor covered Docker, CI and README work owned by
   chunk 2 while only chunk 3 selected it. Fixed by splitting the delivery-path
   requirement from the browser-evidence requirement; anchors renumbered 1–5 and
   partitioned 1,3 / 2,4 / 5.
2. `authoring` — `frontend/index.test.js` pins three absolute `/assets/` references
   chunk 1 must make relative and sat in no chunk's allowlist. Fixed: task 2 and
   chunk 1's Expected diff name it.
3. `authoring` — the ledger's public-tree block carried hand-typed line numbers.
   Fixed: every tree fact is now emitted by `347-generated-facts.sh` and pasted
   whole; the registry and spike blocks state their exact commands.
4. `authoring` — the order described all nine legs as Playwright-routed with
   `VENDOR_DIR`; two serve the shell from `node:http` fixture servers with no
   `VENDOR_DIR`, one only carries the preflight, and one only imports an opener.
   Fixed: the inventory is stated per leg and the helper's exported interface
   (`createBuiltShell({ dist })`, `serve(pathname)` → `{ body, contentType }` or
   `null`) is fixed in task 7 and ADR 347 so both call shapes adapt it.
5. `authoring` — nothing ran a leg without a build, so the fail-closed scenario
   was unproven, and the helper's unit test would have needed a build inside the
   npm-free fast gate. Fixed: the `HARMONIC_DIST` override, preflights that
   collect the missing build beside the missing Playwright module, the
   fail-closed test spawning with an empty dist, and chunk 3's verification
   running the fast gate with `frontend/dist` removed.
6. `authoring` — the no-CDN invariant had no standing enforcement after chunk 1.
   Fixed: the Python contract test asserts it on every CI run.
7. `authoring` — a stale `ORDER.md` from an earlier triage worker sat at the
   worktree root and no fence said who writes each chunk's `ORDER.md`. Fixed: the
   file was removed and the header Boundaries name the coordinator as writer.
8. `authoring` — the `skills/drivers/...` drafting-conventions path does not
   resolve from the worktree. Disposition: the line is the work-order template's
   and the installed ticket skill supplies it; the header Context states that the
   coordinator appends the resolved location to each dispatch.

Notes accepted: the `VENDOR_DIR` matrix fact corrected to seven of ten rows; the
whole-ticket Verification made a pure shell chain with the browser-leg run moved
to Expectation; chunk 3's completion grep widened to the vendor cache machinery;
the browser-leg deferral written the way the Docker deferral is; chunk 1 told to
stop and return a failing exploration `--check` rather than regenerate `mockups/`.
Note discarded: dropping the coordinator-admission sentence from the Session fit
blocks, because the work-order template mandates it and the start verb parses it.

### Round 2 — the same cold reader and the same two panel seats re-check the deltas

Cold read: BLOCKED, one blocking. Panel: two approvals, seven notes.

1. `injected` — the tenth matrix leg, the browser-runner lifecycle test, serves
   inline HTML and no shell, yet its comment names `VENDOR_DIR`, so chunk 3's new
   completion grep would fail on a file outside its allowlist, and the split-out
   browser-evidence requirement bound "every browser leg" to a helper that leg
   cannot use. Fixed: the requirement and its scenarios bind shell-serving legs
   and name the runner leg as outside them; the file joins chunk 3's Expected
   diff for its one comment line; the grep reads tracked files only.

Notes accepted: the fail-closed regression test spawns every shell-serving leg
plus the canvas-composition suite, not three; the completion grep uses `git grep`
so built third-party bundles cannot fail it; the no-CDN contract assertion first
requires `frontend/dist/index.html` to exist; the browser-leg waiver requires an
unsandboxed attempt first and records a machine limit, never a sandbox refusal;
the drafting-conventions read gains the same stop-if-missing rule as `ORDER.md`;
the header says each chunk gets its own worktree on its per-chunk branch.
Note discarded again: the coordinator-admission sentence in Session fit (template).

### Round 3 — a fresh cold reader with no prior context

The re-check of round 2's one blocker returned no objections. The fresh pass:
BLOCKED, one blocking, one note.

1. `authoring` — the http-api delta makes `Cache-Control: no-cache` on the shell a
   SHALL and chunk 2 splits the one middleware that produces it today, yet no test
   observes any cache header (`grep -rn 'Cache-Control' tests/` finds nothing).
   Fixed: task 5, the http-api scenario and chunk 2's fence require the contract
   test to assert `no-cache` on `/` and the six page paths and the immutable
   header on an `/assets` response.

Note accepted: a root `package.json` with either `type` value would override
Node's per-file ESM/CommonJS detection that `frontend/browser-runner.js` and
`frontend/harness-api-paths.test.js` rely on inside the fast gate. Task 1 and ADR
347 now say the manifest declares no `type` and the Vite config is
`vite.config.mjs`.

### Round 3, second fresh reader — the panel cap

The round-3 reviewer countersigned its re-check. A second fresh cold reader,
the third and last panel the procedure allows, returned BLOCKED with four
objections. Three were `authoring` defects with mechanical fixes and one was a
claim a measurement could settle; none was an unsettled decision. The operator
had delegated design decisions to the coordinator on 2026-09-06 and was away, so
the coordinator dispositioned them as follows and recorded a fourth pass rather
than posting unreviewed.

1. `authoring` — the pull-request Docker job only built the image, so the spec's
   "no Node in the runtime, serves the built shell" scenario was unfalsifiable.
   Fixed: the job loads the image, asserts no `node` on the runtime `PATH`, and
   serves and curls the built shell.
2. `authoring` — AGENTS.md's QA copy-then-serve block, the one permitted offline
   serve, gained no build prerequisite; the closed inventory's grep terms could
   not have found it. Fixed: chunk 2's inventory names it.
3. `authoring` — `scripts/screenshots.local.test.mjs` runs in the build-free CI
   job and execs a wrapper chunk 3 rewrites around a helper that throws without
   a build. Fixed: the boundary covers every test that job runs, the wrapper
   constructs the helper lazily, and chunk 3's verification runs that test with
   `frontend/dist` removed.
4. Refuted by measurement — Vite hoists the five stylesheet links past the two
   inline `<style>` blocks, which could reorder the cascade.
   `docs/scope/347-cascade-compare.spike.mjs` rendered the source shell and the
   built shell against the same no-fetch app and compared every element's full
   computed style:

The first run, with the snapshot limited to `body *`, reported zero differing
properties and an element gap of one per page (the inline module `<script>`,
last in `<body>`, which the build moves to `<head>`). Widening the snapshot to
`<html>` and `<body>` exposed one change, all eight sub-properties of one
`background` shorthand on `<body>`:

```text
$ PLAYWRIGHT_MODULE=… VENDOR_DIR=… BASE_URL=http://127.0.0.1:8791 DIST=<build spike>/proj/frontend/dist node docs/scope/347-cascade-compare.spike.mjs
{"path":"/diagnose","elements":{"source":426,"built":425},"differingProperties":8,"sample":[{"i":1,"key":"BODY#.","prop":"background-attachment","source":"scroll, scroll","built":"scroll"},{"i":1,"key":"BODY#.","prop":"background-blend-mode","source":"normal, normal","built":"normal"},{"i":1,"key":"BODY#.","prop":"background-clip","source":"border-box, border-box","built":"border-box"},{"i":1,"key":"BODY#.","prop":"background-image","source":"radial-gradient(820px 260px at 50% -130px, rgba(43, 78, 59, 0.3), rgba(0, 0, 0, 0) 66%), none","built":"none"},{"i":1,"key":"BODY#.","prop":"background-origin","source":"padding-box, padding-box","built":"padding-box"},{"i":1,"key":"BODY#.","prop":"background-position","source":"0% 0%, 0% 0%","built":"0% 0%"},{"i":1,"key":"BODY#.","prop":"background-repeat","source":"repeat, repeat","built":"repeat"},{"i":1,"key":"BODY#.","prop":"background-size","source":"auto, auto","built":"auto"}]}
{"path":"/day","elements":{"source":387,"built":386},"differingProperties":8,"sample":[{"i":1,"key":"BODY#.","prop":"background-attachment","source":"scroll, scroll","built":"scroll"},{"i":1,"key":"BODY#.","prop":"background-blend-mode","source":"normal, normal","built":"normal"},{"i":1,"key":"BODY#.","prop":"background-clip","source":"border-box, border-box","built":"border-box"},{"i":1,"key":"BODY#.","prop":"background-image","source":"radial-gradient(820px 260px at 50% -130px, rgba(43, 78, 59, 0.3), rgba(0, 0, 0, 0) 66%), none","built":"none"},{"i":1,"key":"BODY#.","prop":"background-origin","source":"padding-box, padding-box","built":"padding-box"},{"i":1,"key":"BODY#.","prop":"background-position","source":"0% 0%, 0% 0%","built":"0% 0%"},{"i":1,"key":"BODY#.","prop":"background-repeat","source":"repeat, repeat","built":"repeat"},{"i":1,"key":"BODY#.","prop":"background-size","source":"auto, auto","built":"auto"}]}
{"path":"/plan","elements":{"source":243,"built":242},"differingProperties":8,"sample":[{"i":1,"key":"BODY#.","prop":"background-attachment","source":"scroll, scroll","built":"scroll"},{"i":1,"key":"BODY#.","prop":"background-blend-mode","source":"normal, normal","built":"normal"},{"i":1,"key":"BODY#.","prop":"background-clip","source":"border-box, border-box","built":"border-box"},{"i":1,"key":"BODY#.","prop":"background-image","source":"radial-gradient(820px 260px at 50% -130px, rgba(43, 78, 59, 0.3), rgba(0, 0, 0, 0) 66%), none","built":"none"},{"i":1,"key":"BODY#.","prop":"background-origin","source":"padding-box, padding-box","built":"padding-box"},{"i":1,"key":"BODY#.","prop":"background-position","source":"0% 0%, 0% 0%","built":"0% 0%"},{"i":1,"key":"BODY#.","prop":"background-repeat","source":"repeat, repeat","built":"repeat"},{"i":1,"key":"BODY#.","prop":"background-size","source":"auto, auto","built":"auto"}]}
{"path":"/verify","elements":{"source":341,"built":340},"differingProperties":8,"sample":[{"i":1,"key":"BODY#.","prop":"background-attachment","source":"scroll, scroll","built":"scroll"},{"i":1,"key":"BODY#.","prop":"background-blend-mode","source":"normal, normal","built":"normal"},{"i":1,"key":"BODY#.","prop":"background-clip","source":"border-box, border-box","built":"border-box"},{"i":1,"key":"BODY#.","prop":"background-image","source":"radial-gradient(820px 260px at 50% -130px, rgba(43, 78, 59, 0.3), rgba(0, 0, 0, 0) 66%), none","built":"none"},{"i":1,"key":"BODY#.","prop":"background-origin","source":"padding-box, padding-box","built":"padding-box"},{"i":1,"key":"BODY#.","prop":"background-position","source":"0% 0%, 0% 0%","built":"0% 0%"},{"i":1,"key":"BODY#.","prop":"background-repeat","source":"repeat, repeat","built":"repeat"},{"i":1,"key":"BODY#.","prop":"background-size","source":"auto, auto","built":"auto"}]}
TOTAL DIFFERENCES: 36
```

`frontend/shell.css:24` (`body { background: var(--ck-ground); }`) loses to the
inline body rule at `frontend/index.html:96-101` on every page today and wins once
hoisted. With that dead declaration deleted from the scratch copy and the shell
rebuilt, the same comparison against the unmodified source shell:

```text
$ PLAYWRIGHT_MODULE=… VENDOR_DIR=… BASE_URL=http://127.0.0.1:8791 DIST=<build spike, shell.css:24 removed>/proj/frontend/dist node docs/scope/347-cascade-compare.spike.mjs
{"path":"/diagnose","elements":{"source":426,"built":425},"differingProperties":0,"sample":[]}
{"path":"/day","elements":{"source":387,"built":386},"differingProperties":0,"sample":[]}
{"path":"/plan","elements":{"source":243,"built":242},"differingProperties":0,"sample":[]}
{"path":"/verify","elements":{"source":341,"built":340},"differingProperties":0,"sample":[]}
TOTAL DIFFERENCES: 4
```

   The remaining four "differences" are the element-count gap of one per page:
   the source shell's inline module `<script>` sits in `<body>` and the build
   moves it to `<head>`; every element that exists on both sides matches on
   every computed property. Task 2 deletes the dead `shell.css` declaration, and
   chunk 1's Done when requires the coordinator to rerun this comparison against
   the real build.

### Round 4 — the re-check of round 3's second reader, and a fourth fresh reader

Both blocked, on one shared point and two more.

1. `injected` — chunk 1's Done when reran the cascade comparison, whose source
   side is served from the working tree that chunk 1 itself rewrites, so a
   correct chunk 1 could never close. Fixed: the spike takes a `SOURCE` override
   and chunk 1's Done when serves the source side from a scratch export of the
   pre-build shell (`git archive origin/main frontend`). The snapshot now also
   covers `<html>` and `<body>`, whose non-inherited properties the first run
   could not see.
2. `authoring` — the contract-test rewrite list would have let two live guards
   vanish: `rest-window.js` non-exposure and the generated interface at
   `/api/openapi.json`, `/api/docs`, `/api/redoc`. Fixed: task 5 and chunk 2
   require every existing assertion to be converted, none dropped, naming both.
3. `authoring` — the surfaces spec's Purpose paragraph still says "no build
   step" and no requirement delta carries a Purpose. Fixed: chunk 2 edits
   `openspec/specs/surfaces/spec.md` directly and its allowlist names it.

The spot-check of the generated facts reproduced every tree-fact line byte for
byte (only the `## HEAD` line moved, as the ledger says it will).

### Round 4 re-checks

One reader countersigned. The other blocked once more: the ADR claimed zero
differences on any element while the recorded run had excluded `<html>` and
`<body>`, and the widened script no longer reproduced the recorded counts.
Rerunning the widened comparison found the body background layer lost in the
build (`shell.css:24`, above); deleting that dead declaration and rerunning
restores zero. Both runs are recorded above in place of the narrower one, the
ADR states what was measured, and task 2 carries the deletion.

### Close

Both remaining readers countersigned the pinned change after the cascade fix,
with no blocking objection. The review ran one cold read plus a two-seat panel,
then three fresh cold readers; the procedure's cap of three panels was passed by
one under the operator's standing delegation of design decisions on 2026-09-06,
and every disposition above names its evidence. One note travels to the pull
request body: the dev-only harness appends the shipped inline styles before it
links `shell.css`, so it renders `<body>` on the cockpit ground today and will
show the shipped radial gradient after the deletion — a move toward shipped
fidelity, not a regression.
