## MODIFIED Requirements

### Requirement: The app is single-page, no-build, no-login HTML and Vue

The system SHALL satisfy the following:

The frontend is a single `frontend/index.html` file containing inlined Vue 3 and ECharts, loaded without a build step or login screen. The SPA shell loads on every origin, then makes bearer-token-gated API calls to load data. The three CDN dependencies (Vue esm-browser, ECharts) are vendored in browser tests; live requests use the unpkg / jsdelivr CDN.

Canonical browser addressing is `/<page>?<existing-page-state>`. The route query
carries only the selected page and the already-shareable Day `date`, Guide
`article`, and Diagnose `view`, `factor`, `start_min`, `end_min`, `another`, and
`occ` coordinates. A fragment carries no route: the retired `#/<page>?...`
grammar is unsupported, so a saved hash link opens the default page rather than
the page it names. Programmatic interfaces live below `/api` and local assets
below `/assets`.

The server SHALL serve the shell at `/` and at exactly the live page paths, and
SHALL answer every other path 404. A retired page id is therefore not served and
SHALL NOT be migrated to a live page: its address never reaches the shell. The
browser router SHALL resolve a live page id to itself and any other id to the
default page, which is what keeps an unrecognized Guide handoff target on a real
surface.

#### Scenario: The app is single-page, no-build, no-login HTML and Vue

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

#### Scenario: A retired page id is not served and is not migrated

- **GIVEN** a page id the app no longer has, such as `patterns`, `daily` or `outcomes`
- **WHEN** that id is requested as a page path
- **THEN** the server answers 404 and the shell does not load
- **AND** the browser router grants that id no live page of its own
