## ADDED Requirements

### Requirement: The production frontend is built from one pinned root package

The repository SHALL carry a root `package.json` with exact-pinned Vite, Vue,
ECharts and Vue-plugin versions and a committed lockfile. The build SHALL keep
`frontend/index.html` as its input, bundle Vue through its runtime-with-compiler
build, bundle ECharts once and expose that identity on `window.echarts` from the
entry module before the shell's own module runs, and emit an unminified
`frontend/dist`. The Vite dev server SHALL proxy only `/api`, to the port of the
repository's authorised no-fetch serve command, and nothing else. A TypeScript
configuration and the Vue plugin SHALL admit `.ts` and `.vue` files under
`frontend/`; the public-tree allowlist SHALL admit those files and the root
package files so the published repository builds.

#### Scenario: One ECharts identity reaches the chart modules

- **GIVEN** the built shell loaded in a browser
- **WHEN** a chart module reads `window.echarts`
- **THEN** it receives the bundled ECharts and no CDN request is made
- **AND** the Diagnose workstation mounts its charts against the no-fetch app

#### Scenario: A future component file is admitted without converting today's modules

- **GIVEN** a `.vue` or `.ts` file placed under `frontend/` and imported by the shell
- **WHEN** the production build runs
- **THEN** the build succeeds with every existing JavaScript module unchanged

### Requirement: Every supported delivery path builds the same artifact

The documented source-install path SHALL run `npm ci && npm run build` before
`harmonic serve`. The Docker image SHALL build the frontend in a Node 22 stage and
its Python runtime SHALL copy only `frontend/dist`, carrying no Node. CI SHALL
build before the Python tests and SHALL prove the Dockerfile with a
pull-request-time image build that pushes nothing. The dependency-free Node unit
tests and the source-extracting mockup generators SHALL keep reading source, with
their drift checks unchanged.

#### Scenario: The image carries the build and not the toolchain

- **GIVEN** the Dockerfile and a clean build context
- **WHEN** the image builds
- **THEN** the runtime stage contains `frontend/dist` and no `node` binary
- **AND** `harmonic serve --no-fetch` inside it answers `/` with the built shell

#### Scenario: CI builds before it tests Python

- **GIVEN** a pull request
- **WHEN** the backend job runs
- **THEN** it installs Node 22, runs `npm ci && npm run build`, and only then runs `pytest`
- **AND** the dependency-free Node test job runs no npm install

### Requirement: Browser gates prove the shipped bytes

Every browser leg that serves the shell SHALL load the built shell through one
shared dependency-free helper that answers `/`, the page paths and `/assets/*`
from `frontend/dist` and throws, naming the build command, when
`frontend/dist/index.html` is absent; the helper's dist location SHALL be
overridable by one environment variable so its fail-closed path can be proven
with the build present. Every shell-serving leg's preflight SHALL report a missing
build beside a missing Playwright module before any browser launches, and the
fail-closed regression test SHALL spawn every one of those legs. The
browser-runner lifecycle leg serves trivial inline HTML and no shell; it is
outside this requirement. CI SHALL build before every browser gate and fetch no CDN module. A
behaviour ledger's replay SHALL change only how it serves the page and observes
its seams, never what a story asserts.

#### Scenario: Browser gates prove the shipped bytes

- **GIVEN** committed synthetic fixtures, a completed build and the no-fetch app
  for the legs that need it
- **WHEN** the ten browser legs run as CI runs them
- **THEN** each shell-serving leg loads `frontend/dist/index.html` and its hashed assets
- **AND** no leg reads a vendored CDN module or `frontend/index.html` as the served page

#### Scenario: A leg without a build fails closed before Playwright

- **GIVEN** the helper's dist location pointed at an empty directory
- **WHEN** any shell-serving leg runs, with or without a Playwright module configured
- **THEN** it exits nonzero naming `npm ci && npm run build`
- **AND** when the Playwright module is also missing, both are named
