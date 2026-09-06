# Design — Vite frontend foundation

## ADR 347 — Build the existing shell with Vite before decomposing it

**Decision.** Harmonic's production frontend gains a build step. This supersedes
the second record of ADR 213 in `openspec/changes/adopt-frontend-build-tooling/
design.md` ("The shipped artifact stays buildless by default"): the explicit
future ruling that record deferred to is this one, made by the operator on #347.
The shape is the smallest one that produces a pinned, locally bundled shell:

- A repository-root `package.json` and committed `package-lock.json` pin exactly
  `vite@8.2.2`, `vue@3.5.42`, `echarts@5.5.0` and `@vitejs/plugin-vue@6.0.8`.
  ECharts stays on the version the CDN tag serves today, so no chart behaviour
  moves. Node 22 is the documented runtime, matching CI and the harness; it is
  written down, not enforced. The dev-only `harness/` keeps its own package.
- Vite's root is `frontend/`, its base `/`, its output the gitignored
  `frontend/dist/`. `build.minify` is off: the shipped bytes stay readable for an
  advisory dosing tool, and the S71 behaviour-ledger probe finds its seam in the
  served chunk by text. `vue` is aliased to the runtime-with-compiler build,
  because every template in the shell compiles in the browser.
- `frontend/index.html` stays the shell and stays the Vite input. It loses the
  importmap and the CDN script tag, gains `<script type="module" src="./main.js">`
  ahead of its inline module, and its inline module, stylesheet links and icon
  reference siblings relatively. `frontend/main.js` imports ECharts and assigns
  the one bundled identity to `window.echarts`; it runs before the inline module
  and its imports, so the chart modules that read the global keep working
  unchanged. Nothing else in `frontend/*.js` moves.
- A TypeScript configuration and the Vue plugin admit `.ts` and `.vue` files under
  `frontend/`; none is added. The public-tree allowlist admits those extensions
  and the new root files so the published repository can build.
- Vite's dev server proxies only `/api` to `http://127.0.0.1:8765`, the port of
  the QA copy-then-serve command the repository already authorises.
- Python serves `frontend/dist/index.html` for `/` and the six page paths with
  `Cache-Control: no-cache`, and mounts `frontend/dist/assets` at `/assets` as one
  prefix-scoped directory route whose hashed files carry an immutable cache
  header. `/api` routes and the page routes are declared before the mount and
  outside its prefix, so no file on disk can shadow them. When
  `frontend/dist/index.html` is absent the app factory logs the rebuild
  instruction once and the shell routes answer 503 with it; the API stays up and
  raw source is never served in its place.
- Docker builds in a `node:22` stage and its Python runtime copies only
  `frontend/dist`. CI builds before the Python tests and before every browser
  leg, retires the CDN vendor download, and adds a pull-request-time
  `docker build` with no push so the Dockerfile is proven before merge.
- The browser legs stop serving `frontend/index.html` and `/assets/*.js` from
  source with vendored CDN modules. One dependency-free helper beside
  `browser-runner.js` answers the page paths and `/assets/*` from
  `frontend/dist` and fails closed naming the build command; every page-serving
  leg routes through it. The one module-isolation page that loads ECharts on its
  own reads it from `node_modules`.

**Why.** The templates are runtime templates and the chart modules share one
ECharts global; requiring their conversion to gain a build would mix a delivery
migration with chart and UI behaviour risk. The runtime-compiler alias, the
`main.js` global and the unminified output are each the smallest move that keeps
today's bytes behaving as they do. A spike (`docs/scope/347-vite-build.spike.sh`
and `docs/scope/347-built-shell-mount.spike.mjs`, output recorded in
`docs/scope/347-vite-frontend-foundation.md`) built the current shell this way and
mounted all four surfaces against the no-fetch app with zero external requests.
The per-file route whitelist existed so a file could never shadow `/api` or the
index; a prefix-scoped mount over a build directory preserves that property
without enumerating hashed names. The browser legs must load built bytes, or the
gates would keep proving a delivery path that no longer ships. Docker cannot be
built on the operator's machine, so the pull-request-time image build is the
proof, and it costs one Linux job.

**Consequences.** ADR 213's first record (staged adoption, dev harness first)
stands; its second record is superseded and its "byte-identical shipped app"
evidence rule no longer binds later stages. `tests/test_frontend_asset_routes.py`
becomes a built-output contract. The fast gate's Node tests stay npm-free; the
Python tests need the build, so the backend CI job installs Node and builds
first. `VENDOR_DIR` disappears from every leg, script, document and CI cache.
A sandboxed agent still cannot launch Chromium, so the browser legs are run by
the coordinator or an unsandboxed operator session, as today.

**Acceptance anchors.** Locks on this change number the spec-delta requirements
in file order: 1 — `specs/surfaces/spec.md`, the ADDED requirement; 2 —
`specs/http-api/spec.md`, the MODIFIED requirement; 3 and 4 — the two ADDED
requirements of `specs/frontend-delivery/spec.md`, in order.
