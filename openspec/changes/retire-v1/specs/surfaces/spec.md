## REMOVED Requirements

### Requirement: The app is single-page, no-build, no-login HTML and Vue

**Reason:** The v1 Vue page is retired (ADR 416). Its addressing and closed-route
rules carry forward in "The desk is the only shell, built ahead of time and served
at root".

### Requirement: All four surfaces are available from the cockpit shell tab bar

**Reason:** The cockpit shell is retired with v1 (ADR 416). The desk's persistent
chrome and its three destinations are specified by the desk requirements.

### Requirement: Diagnose hosts a non-advisory aggregate-evidence section outside Audit and Watching

**Reason:** Two of its scenarios specified v1's data helper requesting
`/api/diagnose/eating-sequences` and recording that response's age; the route is
retired (ADR 417). The requirement continues as "Diagnose draws eating-sequence
evidence from the finding case file".

## ADDED Requirements

### Requirement: The desk is the only shell, built ahead of time and served at root

Harmonic SHALL have exactly one browser shell, the desk. It is built ahead of
time, loads with no login screen, and then makes bearer-token-gated API calls to
load data. The packaged runtime SHALL require no Node runtime and no CDN at run
time.

The server SHALL serve the desk at `/` and at exactly the page paths
`/diagnose`, `/changes` and `/day`, and its fingerprinted built assets beneath
`/assets/`. Programmatic interfaces live below `/api`. The non-API route set
SHALL be closed: every served page path is named explicitly, and every other
path SHALL answer 404 rather than the shell. No retired address is served or
redirected: a `/v2/...` path, a retired v1 page path such as `/plan`, `/verify`,
`/settings` or `/guide`, and any older retired page id all answer 404. A fragment
carries no route.

The browser router, the browser-side disk-serving mirror used by the browser
gates, and the Python route policy SHALL agree on that page set and asset prefix,
because a mirror that serves a path the server does not is structurally blind to
a missing route.

#### Scenario: The desk answers at root and its page paths

- **WHEN** the built app is started against a synthetic database
- **THEN** `/`, `/diagnose`, `/changes` and `/day` each answer the desk shell
- **AND** every asset the shell names is served beneath `/assets/`
- **AND** the built output references no CDN host

#### Scenario: A retired address is not served and is not redirected

- **GIVEN** an address the app no longer has, such as `/v2/`, `/v2/day`, `/plan`, `/verify`, `/settings` or `/guide`
- **WHEN** that address is requested
- **THEN** the server answers 404, not the shell and not a redirect

#### Scenario: A missing build fails loudly

- **WHEN** the desk's build output is absent
- **THEN** each page path reports that the frontend build is missing and names the build command, rather than serving a blank or partial shell
- **AND** the API remains reachable

#### Scenario: The route set cannot grow silently

- **WHEN** the closed-set route assertion runs
- **THEN** it names the complete non-API route set, so a route cannot be added or kept without updating it

### Requirement: Diagnose draws eating-sequence evidence from the finding case file

Diagnose SHALL nest supported eating-sequence lever findings as habit causes under
Highs after meals in its existing queue. They SHALL have their own sequence counts
and no rank numeral or extra Findings/Sift count. The eating-sequence descriptor
SHALL bring the registry to six entries; the parent SHALL retain pattern-case-file. It SHALL NOT
create a separate aggregate section or new stage, drawer or dock behavior. Neither
finding SHALL stage a Plan change. Its adapter SHALL reshape
served aggregates without deriving a verdict, median, difference, or status. An
insufficient cell SHALL remain visible as insufficient rather than numeric. The
report reaches Diagnose inside the finding case file it opens, as that case's
`projection.report`; it has no route of its own (ADR 417).

#### Scenario: An insufficient served aggregate remains insufficient in the adapter

- **GIVEN** an eating-sequence report cell with insufficient status and null metric
- **WHEN** Diagnose adapts it for aggregate evidence
- **THEN** the chart-ready cell retains that status and null value
- **AND** it is neither dropped nor zero-filled

#### Scenario: The adapter does not re-derive an eating-sequence judgment

- **GIVEN** served aggregates, comparisons, statuses, findings, and exclusions
- **WHEN** Diagnose adapts the report
- **THEN** its outputs use those values field-for-field
- **AND** no frontend threshold, median, difference, or verdict is calculated

#### Scenario: The section reads the report from the case file

- **GIVEN** Diagnose opens an eating-sequence finding's case file
- **WHEN** it draws that finding's aggregate evidence
- **THEN** the report is the case file's own `projection.report`, prepared for the server-owned fixed Diagnose source window
- **AND** Diagnose makes no separate report request
