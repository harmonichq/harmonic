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

### Requirement: Every supported delivery and evidence path builds the same artifact

The documented source-install path SHALL run `npm ci && npm run build` before
`harmonic serve`. The Docker image SHALL build the frontend in a Node 22 stage and
its Python runtime SHALL copy only `frontend/dist`, carrying no Node. CI SHALL
build before the Python tests, build before every browser gate, prove the
Dockerfile with a pull-request-time image build that pushes nothing, and fetch no
CDN module. Every browser leg SHALL load the built shell through one shared,
dependency-free helper that fails closed naming the build command when the build
is absent. The dependency-free Node unit tests and the source-extracting mockup
generators SHALL keep reading source, with their drift checks unchanged.

#### Scenario: Browser gates prove the shipped bytes

- **GIVEN** committed synthetic fixtures, a completed build and the no-fetch app
  for the legs that need it
- **WHEN** the ten browser legs run as CI runs them
- **THEN** each loads `frontend/dist/index.html` and its hashed assets
- **AND** no leg reads a vendored CDN module or `frontend/index.html` as the served page
- **AND** a leg run without a build exits nonzero naming the build command

#### Scenario: The image carries the build and not the toolchain

- **GIVEN** the Dockerfile and a clean build context
- **WHEN** the image builds
- **THEN** the runtime stage contains `frontend/dist` and no `node` binary
- **AND** `harmonic serve --no-fetch` inside it answers `/` with the built shell
