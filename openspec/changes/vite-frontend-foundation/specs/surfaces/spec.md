## REMOVED Requirements

### Requirement: The app is single-page, no-build, no-login HTML and Vue

**Reason:** #347 gives the production frontend a build step; the shell is no
longer a single unbuilt file loading Vue and ECharts from CDNs.
**Migration:** The requirement below carries the unchanged addressing, no-login
and `/api` / `/assets` rules onto the built shell.

## ADDED Requirements

### Requirement: The app is a single-page, no-login shell built from pinned local dependencies

The frontend SHALL be a single-page Vue 3 and ECharts application whose shell
is `frontend/index.html`, built by Vite from a repository-root package with
exact-pinned dependencies and a committed lockfile. Vue and ECharts SHALL be
bundled locally; the shipped shell SHALL make no request to a CDN for either. The
shell SHALL keep its runtime-compiled templates and its vue-free JavaScript
modules; a build SHALL admit Vue single-file components and TypeScript files
without requiring an existing module to convert. The SPA shell SHALL load on
every origin without a login screen, then make bearer-token-gated API calls to
load data.

Canonical browser addressing is `/<page>?<existing-page-state>`. The route query
carries only the selected page and the already-shareable Day `date`, Guide
`article`, and Diagnose `view`, `factor`, `start_min`, `end_min`, `another`, and
`occ` coordinates. A fragment carries no route: the retired `#/<page>?...`
grammar is unsupported, so a saved hash link opens the default page rather than
the page it names. Programmatic interfaces live below `/api` and local assets
below `/assets`.

#### Scenario: A clean build relies on no runtime CDN

- **GIVEN** a clean checkout and the documented Node version
- **WHEN** the documented install and build commands run
- **THEN** the built shell references locally emitted Vue and ECharts assets
- **AND** no file under the build output names the previous Vue or ECharts CDN URL

#### Scenario: The vue-free source seam survives the build

- **GIVEN** the existing vue-free frontend JavaScript modules and their Node tests
- **WHEN** the dependency-free Node test command runs with no npm install
- **THEN** it imports and tests those source modules as before
- **AND** the built shell renders the same surfaces those modules serve today
