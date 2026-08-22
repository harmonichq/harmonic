# Surfaces

## Purpose

Harmonic is a single-page app with no build step and no login — the HTML shell loads unauthenticated, and the browser's embedded Vue interpreter renders four distinct surfaces to answer different questions about the data. Each surface renders read-only server-owned projections; surfaces never re-derive analysis verdicts that belong to the backend.

## Requirements

### Requirement: The app is single-page, no-build, no-login HTML and Vue

The frontend is a single `frontend/index.html` file containing inlined Vue 3 and ECharts, loaded without a build step or login screen. The SPA shell loads on every origin, then makes bearer-token-gated API calls to load data. The three CDN dependencies (Vue esm-browser, ECharts) are vendored in browser tests; live requests use the unpkg / jsdelivr CDN.

### Requirement: Diagnose surface asks "what tuning moves are available now?"

Diagnose reads the current analysis result and presents a server-ranked queue of tuning findings (Audit). Each finding carries the evidence and severity behind it. The queue register is server-owned and direction-derived, so a direction-only ISF finding may remain in the asserted register even though it cannot stage. A staging control and actionable Recommended number appear only when the exact backend `asserts_move` verdict is true; a false or missing verdict fails closed. Findings in the held or still-collecting registers stay visible in a separate "Watching" section below. Diagnose also hosts an Explore mode for inspecting glucose, insulin, and behavioral evidence without generating advice.

### Requirement: Plan surface asks "what will I program into my pump?"

The Plan surface holds a unified ≤16-segment pump-ready schedule built from the user's currently-active profile plus any accepted Diagnose recommendations and hand-edits. It shows the active profile as a reference, lists the accepted changes with provenance, and renders the editable deliverable. Plan reconciliation compares the deliverable to the latest detected pump profile to confirm it matches or flag keying errors. Users cannot stage changes directly on Plan; they stage from Diagnose and edit the deliverable here.

### Requirement: Day surface asks "what happened on this day?"

The Day surface is a one-day forensics view: a severity-encoded calendar navigator (ADR 0031) at the top, a sticky glucose chart on the left showing the day's CGM and insulin events, and a chronological Episode Log on the right where behavioral evidence (meals, corrections, lows, rescue carbs) folds in as tier-2 inline detail. Both components are self-contained; the app supplies the selected date. The Day surface is read-only and discovery-focused; it does not stage changes or execute commands.

### Requirement: Verify surface asks "are my changes working?"

Verify tracks active Trials (detected setting changes) and pinned Focuses (behavioral changes the user is watching). For each, it shows before/after metrics anchored to the change date, rendering the specific metric most relevant to that change (e.g., overnight lows for a basal raise, post-meal nadirs for an I:C adjustment). Verify also shows outcome trends — glycemic metrics and clean rates — across an observation window. All data on Verify is read-only and retrospective; no staging or configuration happens here.

### Requirement: Surfaces render server-owned projections; they do not re-derive analysis verdicts

Each surface renders data calculated by the backend and carried in the `/analyze` or specialized endpoints (`/day-navigator`, `/verify-trial-list`, etc.). A surface never recalculates the engine's own verdicts — asserts_move, priority, recurrence, harm gates, silence reasons, localized outcome triage — even if tempted to re-check them for UI purposes. The backend is the single source of truth for all analysis. This boundary has been repeatedly load-bearing: frontend re-derivations of backend gates have diverged and silently invalidated the app's behavior.

### Requirement: All four surfaces are available from the cockpit shell tab bar

The app shell presents a workflow sequence — Diagnose → Plan → Verify — as numbered steps in the header, plus a separate Day button anchored to the right. The drawer offers the same four buttons plus Settings. All surfaces update a single `tab` state; only the active tab is visible (others are `v-show="false"` and remain mounted).
