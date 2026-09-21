# Design — retire the v1 app (#416)

## ADR 416 — The desk is the only shell, served at root, with no transition

**Status:** accepted, Connor Griffin, 2026-09-21.

**Context.** `harmonic-v2` design step 5 ("Cut over and retire separately") and
its tasks 3.5, 4.2 and 4.3 required, in order: Connor's acceptance of the desk, an
explicit root-route cutover approval with the prior frontend kept served and
recoverable during a transition, then v1's retirement once each of its jobs was
preserved or explicitly retired.

**Decision.** Connor, 2026-09-21: "V2's good." "No redirects, no nothing." "If V2
hasn't implemented it, I don't need it." "Kill all the V1 stuff." "just one front
end. There's no V2 anywhere."

1. That statement is the desk's acceptance, the cutover approval and the
   retirement approval at once. Cutover and retirement land in one change. There
   is no transition period and no retained v1 route. The old app is recoverable
   from Git history only. This supersedes `harmonic-v2` design step 5.
2. The desk is served at `/`, its pages at `/diagnose`, `/changes` and `/day`, its
   built assets under `/assets`. The non-API route set stays closed. Every
   `/v2/...` path and the old v1 pages `/verify`, `/plan`, `/settings` and
   `/guide` answer 404. There are no redirects.
3. Every v1 job the desk does not already do is explicitly retired, not ported:
   the fetch status panel and Fetch now button, audit-item dismissal, the topbar
   range indicator, the Day model view log, dose focus, settling and scenario
   chart, and the v1 Verify workstation renderer.
4. Every v1 gate is deleted, including the workstation ledger, the
   event-comparison replay and support audit, the Verify ledger, and the
   workstation, canvas-composition, cockpit-shell, Day lifecycle and first-plan
   browser legs. The desk ledger, the desk and follow-up suites, the shared
   browser-runner regression and the fail-closed regression are the browser
   contract. Coverage those v1 gates gave the embedded Diagnose workstation is
   knowingly dropped.
5. One `frontend/` source root. The v2 name leaves the living system. Historical
   records keep their names; the boundary is in "Naming boundary" below.
6. The chart harness is deleted, and so are the design explorations that read
   v1's source and that nothing surviving reads, with their drift checks. The
   one exploration the desk ledger's mock target reads
   (`mockups/harmonic-v2.exploration/`) stays, and its generator's three lifts
   re-point at the rehomed desk source. The no-fetch QA serve of the built desk
   is the safe chart-revision surface.

**Consequences.** A bookmark to any old address breaks. Manual fetch has no UI;
the hourly loop and the CLI remain. A defect in embedded Diagnose behavior that
only a deleted v1 story exercised will no longer fail a gate; the remedy is a new
desk story, filed when found.

## Risk contract

- **Must prevent:** secret exposure; any change to the store, analyzers, safety
  caps or advisory output; silent incorrect success, meaning a gate that passes
  while running zero assertions, or a page that answers 200 with a missing build
  or missing assets.
- **Must recover:** nothing automatically.
- **Accepted failure:** an old bookmark (`/v2/...`, `/plan`, `/verify`,
  `/settings`, `/guide`) answers 404. A missing build answers 503 naming the
  build command. v1-only features are gone with no replacement.
- **Unsupported:** any v1 page, any `/v2` path, restoring v1 other than from Git
  history.
- **Evidence owed:** the closed non-API route set through the HTTP interface,
  including the 404 list; the packaged-runtime proof at root; the complete desk
  ledger at both sizes against the built root-served app; the desk and follow-up
  browser suites; the fast gate; every surviving drift check; the fail-closed
  gate regression test.
- Why: delegated by Connor; defaults applied, priced for a one-operator
  self-hosted tool whose advisory engine this change never touches.
- Disposition: this block is the downstream authority; the scope ledger is the
  session record.

## What survives, and the rule that decides it

A file under today's `frontend/` survives only if the desk's build, the desk's
tests and replays, a surviving generator, or a surviving backend test reaches it.
Grounding on origin/main 6821bbf6 found:

- **Desk runtime closure in `frontend/`:** `data.js`, `tab-routing.js`, `plan.js`,
  `diagnose-event-comparison.js`, `diagnose-data-age.js`,
  `diagnose-workspaces.js`, `verify-workstation-chart.js`, `chart-builders.js`,
  `day-chart.js`, `day-hero-chart.js`, `nav-chart.js`, `daily-nav.js`,
  `carb-log.js`, `prompt-queue.js`, `kb.js`, `guide.js`, and transitively
  `diagnose-workstation.js`, `diagnose-workstation-chart.js`,
  `diagnose-workstation-data.js`, `diagnose-canvas-layout.js`,
  `diagnose-canvas-state.js`, `diagnose-eating-sequences.js`,
  `diagnose-evidence-charts.js`, `diagnose-findings-queue.js`,
  `diagnose-load-failure.js`, `finding-case-file-validation.js`,
  `occurrence-roster.js`, `watched-change-dock.js`; the stylesheets `shell.css`,
  `diagnose-workstation.css`, `diagnose-event-comparison.css`, `theme.css`; and
  `favicon.svg`. Each surviving module keeps its unit test.
- **Desk test and replay closure in `frontend/`:** `replay-assertions.mjs`,
  `harmonic-v2-desktop-behavior.replay.mjs`, `browser-fixture-population.js`,
  `browser-runner.js`, `built-shell.js`, `eating-sequence-fixture.js`,
  `__fixtures__/basal-night-evidence.json`, `__fixtures__/findings-projection.json`,
  with their tests, plus `browser-runner.browser.test.mjs`,
  `browser-gates-fail-closed.test.js` and `findings-projection-mirror.test.js`.
  The desk replays also import from the two v1 replay files: `waitForLevelAnimations`
  and the story body `S03` from `diagnose-workstation-behavior.replay.mjs`, and
  the story body `S8` from `diagnose-event-comparison-behavior.replay.mjs`. The
  deletion task moves exactly those three exports, with whatever they call, into
  the desk's replay source unchanged, so the two v1 replays can go.
- **Generator inputs:** `scripts/gen_findings_projection_fixtures.py` reads
  `mockups/diagnose-workstation.synthetic/payload.json` and
  `mockups/diagnose-event-comparison.synthetic/capture.json`, and
  `scripts/check_demo_fixtures.py` guards the demo sets. A synthetic set survives
  exactly when a surviving generator, drift check or backend test reads it.

This list is grounding, not the authority. The authority is the rule in the
first sentence, proved by the build, the fast gate, the drift checks and pytest
all passing with the file gone. `frontend/index.html` is imported by no node
test, so an extension-filtered search can certify live code dead; the deletion
task uses the desk build and gates as its proof, never a search alone.

## Rehoming what the desk's build lifted

`app-source.mjs` lifts three things from v1's page: the material stylesheet
(role ladder, page reset, body ground), every `.ds-chart-legend` rule, and the
glossary groups. They become committed desk source: one stylesheet and one
glossary module, byte-equivalent in effect to what the lift produced on
origin/main. `app-source.mjs`, its test, the two virtual modules and the config
plugin that fed them are deleted. The proof of equivalence is the desk ledger
and the desk suite passing unchanged, plus a one-time comparison of the built
CSS and glossary before and after, recorded under this change's `evidence/`.

`scripts/check_owned_identifiers.py` guards the browser title, the favicon label
and the page wordmark in v1's page. Those three rules re-point at the desk's page
and the surviving favicon; none is dropped.

## Naming boundary

The v2 name leaves everything a contributor or the running system touches:

- `frontend-v2/` merges into `frontend/`. `frontend-v2/index.html` and
  `frontend-v2/main.js` take the freed names. The desk's chrome stylesheet
  `frontend-v2/shell.css` becomes `frontend/chrome.css`, because the shared
  `frontend/shell.css` keeps its name.
- `vite.config.v2.mjs` becomes the one `vite.config.mjs` with `base: '/'`; the
  `dev:v2` script becomes `dev`; `npm run build` runs one build.
- `frontend/harmonic-v2-desktop-behavior.replay.mjs` becomes
  `frontend/desk-behavior.replay.mjs`. The acceptance driver, its test and
  `clinical-pairs.mjs` move from `mockups/sweep/harmonic-v2-desktop/` to
  `scripts/desk_acceptance.py`, `scripts/desk_acceptance.test.py` and
  `scripts/desk-clinical-pairs.mjs`; CI job ids and step names drop the name.
- Router and server identifiers (`V2_PAGE`, `parseV2Route`, `index_v2`,
  `_FRONTEND_V2_DIST`, the `frontend-v2-assets` mount name) lose the prefix.
- Living documents and baseline specifications say "the desk" or "the app".

Historical records keep their names and bytes, because renaming a frozen record
rewrites history: `openspec/changes/**` other than this change and the
`harmonic-v2` amendments named in tasks.md, `docs/scope/**`, `.impeccable/**`,
the locked prototype and its records (`mockups/harmonic-v2-*`,
`mockups/harmonic-v2-desktop.lock.md`, `mockups/harmonic-v2-desktop.behavior.md`
apart from the sanctioned story amendments, `mockups/sweep/harmonic-v2-desktop/`
captures and runs), and schema strings such as `eating-sequence-report-v1`.

## Ledger amendment

The desk's frozen ledger asserts the old address in two stories: S86 (Python
serves `/v2/` and `/v2/assets/`) and S87 (v1 and `/v2/` coexist). Under Connor's
2026-09-21 sanction, S86 is amended to assert `/`, the three page paths and
`/assets/`; S87 is retired, and its retirement record cites ADR 416. Every other
story changes only the address its opener navigates to. No story is weakened, and
no other story is added or retired. The rendered surface is unchanged, so this
change carries no visual lock and no new fidelity evidence.

## Verification design

The route change has three owners that must move together: the Python route
policy, the Vite base, and the browser router with its disk-serving mirror.
`tests/test_frontend_asset_routes.py` already asserts the server's page mirror
equals the router's pages and names the complete non-API route set; it is
rewritten first, fails against the unchanged server, then passes. The package
proof in the acceptance driver asserts the same set against the built image.

Workers under a seatbelt sandbox cannot launch Chromium. The browser legs are
therefore their own last task group, run by whoever can launch a browser, on the
commit that will be pushed, once: the desk suite, the follow-up suite, the
browser-runner regression, and the complete desk ledger at both sizes.

## Triage review rounds

Recorded by triage below as each `/plan-review` round completes.
