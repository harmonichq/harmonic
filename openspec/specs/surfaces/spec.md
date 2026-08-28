# Surfaces

## Purpose

Harmonic is a single-page app with no build step and no login — the HTML shell loads unauthenticated, and the browser's embedded Vue interpreter renders four distinct surfaces to answer different questions about the data. Each surface renders read-only server-owned projections; surfaces never re-derive analysis verdicts that belong to the backend.

## Requirements

### Requirement: The app is single-page, no-build, no-login HTML and Vue

The frontend is a single `frontend/index.html` file containing inlined Vue 3 and ECharts, loaded without a build step or login screen. The SPA shell loads on every origin, then makes bearer-token-gated API calls to load data. The three CDN dependencies (Vue esm-browser, ECharts) are vendored in browser tests; live requests use the unpkg / jsdelivr CDN.

Canonical browser addressing is `/<page>?<existing-page-state>`. The route query
carries only the selected page and the already-shareable Day `date`, Guide
`article`, and Diagnose `view`, `factor`, `start_min`, `end_min`, `another`, and
`occ` coordinates. A fragment carries no route: the retired `#/<page>?...`
grammar is unsupported, so a saved hash link opens the default page rather than
the page it names. Programmatic interfaces live below `/api` and local assets
below `/assets`.

### Requirement: Diagnose surface asks "what tuning moves are available now?"

Diagnose reads the current analysis result and presents a server-ranked queue of tuning findings (Audit). Each finding carries the evidence and severity behind it. The queue register is server-owned and direction-derived, so a direction-only ISF finding may remain visible in the asserted register even though it cannot stage. A setting finding receives a queue rank only when the change it represents can stage: an unstageable direction-only ISF warning follows every priced finding through the existing unranked path, carries no rank numeral, and does not move into Watching. Its underlying analysis Priority remains available outside queue placement. Automatic chart seating follows the server's ranked `assert` and `finding` order. A star retains a live chart without changing that order; if a retained chart leaves rank, it follows every ranked chart and remains ahead of the Watching divider until the reader stops keeping it. Explicit focus may also bring a Watching chart into the field, independently of retention. A staging control and actionable Recommended number appear only when the exact backend `asserts_move` verdict is true; a false or missing verdict fails closed. Findings in the held or still-collecting registers sit collapsed beneath the ranked queue behind a `Watching · N reads` toggle, expandable on demand. Explore mode is retired. Sanction: ConnorGriffin · 2026-08-26 · "Diagnose does NOT need to host an explore mode. we're building a better version of it right now."

### Requirement: Diagnose presents retired I:C regimes as non-actionable Watching evidence

An active retired I:C regime appears after held and blind rows in the server's
Watching order. Its queue row identifies a past setting and never shows today's
programmed value. Its case file leads with the analyzer's finished historical
conclusion, then the past setting, measured value, interval, and meal-run support,
followed by exactly one quieter current-program line. `By clock` and `By event`
remain projections of that one selected identity; event selection emphasizes one
whole meal run without changing its published population. The event view keeps the
analysis generation out of rendered copy and lists each run's meal offsets as
rounded whole minutes beneath its date, with the unit printed once per run.

History has no recommendation row, stage control, Priority, chip, Plan entry, or
navigation path to Plan. The surface reads server-owned identity, membership,
lifecycle, selection disposition, annotation, and action fields and derives none of
them from ratios, nulls, support, or ID syntax.

When the server reports `out_of_scope`, the selected case stays open with the
server's message. `aged_out` and `unavailable` return the case atomically to the
queue only after findings confirms the matching disposition. Failed,
generation-mismatched, or superseded requests preserve the last coherent
inspector/canvas pair; after one automatic coordinated retry, the surface marks it
stale and offers one explicit Retry instead of clearing or mixing evidence.

### Requirement: Diagnose renders Finding case files without browser-owned policy.

Diagnose loads the server-owned case-file preparation and renders its exact rows.
Opening any visible behavioral Finding, changing its clock window or alignment,
or selecting an Occurrence sends the preparation identity and opaque coordinates to
the case-file endpoint. The Inspector renders the returned header, verdict account,
full roster, 12-bucket clock or three server-named event cohorts, comparison state,
selection, and selected trace without mapping titles to Exposure families, joining a
second population, recounting cohorts, or falling back from event to clock alignment.

An active failed request preserves the last internally consistent queue,
Inspector, and canvas while showing the structured error. On `stale_projection`,
the replacement preparation and replacement case are built in shadow state and
all three surfaces swap only after both succeed. Responses superseded by newer
coordinates are discarded by generation and projection/Finding identity. Initial
load failure, queue-level refresh failure, case failure after refresh, and a valid
unavailable selection remain distinct visible states.

For Missed / unannounced meal, the event view renders the server's attributed-
missed and all-completed-carb-bolus announced cohorts as separate populations.
It displays their independent missed, announced, and not-comparable counts,
anchors missed rows at detected rise onset and announced rows at completed
carb-bolus time, and uses the fixed `[-60, +300]` axis. A zero attributed-missed
cohort is an explicit empty state, not a fallback to High verdict membership;
announced rows remain selectable through their server-owned Occurrence identity.
The five-way High verdict band and its denominator remain a separate account.

### Requirement: Plan surface asks "what will I program into my pump?"

The Plan surface holds a unified ≤16-segment pump-ready schedule built from the user's currently-active profile plus any accepted Diagnose recommendations and hand-edits. It shows the active profile as a reference, lists the accepted changes with provenance, and renders the editable deliverable. Plan reconciliation compares the deliverable to the latest detected pump profile to confirm it matches or flag keying errors. Users cannot stage changes directly on Plan; they stage from Diagnose and edit the deliverable here.

### Requirement: Day surface asks "what happened on this day?"

The Day surface is a one-day forensics view: a severity-encoded calendar navigator (ADR 0031) at the top, a sticky glucose chart on the left showing the day's CGM and insulin events, and a chronological Episode Log on the right where behavioral evidence (meals, corrections, lows, rescue carbs) folds in as tier-2 inline detail. Both components are self-contained; the app supplies the selected date. The Day surface is read-only and discovery-focused; it does not stage changes or execute commands.

### Requirement: Verify surface asks "are my changes working?"

Verify tracks active Trials (detected setting changes) and pinned Focuses (behavioral changes the user is watching). For each, it shows before/after metrics anchored to the change date, rendering the specific metric most relevant to that change (e.g., overnight lows for a basal raise, post-meal nadirs for an I:C adjustment). Verify also shows outcome trends — glycemic metrics and clean rates — across an observation window. All data on Verify is read-only and retrospective; no staging or configuration happens here.

### Requirement: Surfaces render server-owned projections; they do not re-derive analysis verdicts

Each surface renders data calculated by the backend and carried in `/api/analyze` or specialized endpoints (`/api/day-navigator`, `/api/verify/trials`, etc.). A surface never recalculates the engine's own verdicts — asserts_move, priority, recurrence, harm gates, silence reasons, localized outcome triage — even if tempted to re-check them for UI purposes. The backend is the single source of truth for all analysis. This boundary has been repeatedly load-bearing: frontend re-derivations of backend gates have diverged and silently invalidated the app's behavior.

### Requirement: All four surfaces are available from the cockpit shell tab bar

The app shell presents a workflow sequence — Diagnose → Plan → Verify — as numbered steps in the header, plus a separate Day button anchored to the right. The drawer offers the same four buttons plus Settings. All surfaces update a single `tab` state; only the active tab is visible (others are `v-show="false"` and remain mounted).
