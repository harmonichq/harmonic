# Establish a minimal Vite foundation for the production frontend

## Why

The shipped single-page app loads Vue and ECharts from two CDNs at runtime, keeps
its module bootstrap and runtime templates inline in `frontend/index.html`, and is
served by Python as forty-one hand-written per-file asset routes. Nothing pins the
two runtime dependencies, the browser gates hand-vendor the same CDN files to run
offline, and no Vue single-file component or TypeScript file can exist because
nothing builds. #347 asks for the smallest production build boundary that fixes
all three without changing what the app renders or decides.

## What changes

- A repository-root npm package with exact pins and a committed lockfile builds
  the existing `frontend/` shell with Vite. The build keeps the inline runtime
  templates and every vue-free module as they are; one small entry installs the
  bundled ECharts on `window.echarts` for the chart modules that read the global.
  The Vue plugin and a TypeScript configuration admit future `.vue` and `.ts`
  files; no existing module is converted.
- Python serves only the built output: the built shell for `/` and the six page
  paths, the hashed assets from one prefix-scoped `/assets` directory route, and a
  clear "build required" failure when the build is absent. The per-file source
  routes retire. `/api` routing, the bearer-token boundary and every engine
  verdict are untouched.
- Every supported delivery path builds the same artifact: source installs run the
  documented build before `harmonic serve`; Docker builds in a Node stage and ships
  only the built bytes in a Node-free runtime; CI builds before the Python tests
  and before every browser gate, and proves the Dockerfile on each pull request.
- The browser gates load the Python-shaped built shell instead of source files plus
  hand-vendored CDN modules, so the ten legs exercise the bytes that ship.
- Node's dependency-free unit tests keep importing the vue-free source modules
  with no npm install, and the source-extracting mockup generators keep reading
  source with their drift checks unchanged.

## Non-goals

- No navigation, visual, Focus, engine, API-semantic, cache, or advisory-policy
  change. Fonts still load from Google Fonts as today.
- No component extraction, no JavaScript-to-TypeScript conversion, no query
  client, no harness integration or removal.
- No Node in the production runtime and no standalone wheel-install capability.

## Risk contract

- **Must prevent:** any real glucose, insulin or credential value reaching a
  commit, a CI log or a pull request; silent incorrect success (a green gate that
  loaded source instead of the build, or served stale raw source when the build
  was missing); any change to authentication, `/api` routing or an engine verdict.
- **Must recover:** nothing. A missing build is reported, never repaired at run time.
- **Accepted failure:** a source install without Node cannot serve the shell until
  its operator runs the documented build; the API still answers. A pinned
  dependency going stale is repaired by an explicit pin bump.
- **Unsupported:** live fetch, real data, wheel-only installs, Node in the runtime
  image, a floating dependency range, a second ECharts identity.
- **Evidence owed:** a clean `npm ci && npm run build`; TestClient proof of the
  built shell, its assets, `/api` isolation and the missing-build failure; the
  unchanged dependency-free Node tests; the ten browser legs against the built
  shell with committed synthetic inputs; a pull-request-time Docker image build;
  every current fast-gate and generator drift check.
