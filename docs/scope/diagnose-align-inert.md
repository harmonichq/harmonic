# Diagnose header Align control renders while hidden

Issue #95. Fingerprint `initial-diagnose-align-affordance-inert`.

## Decisions

- Classify #95 as a bounded UI code change (`revise` lifecycle on the shipped Diagnose workstation). Reproduced live against the safe no-fetch app: on the initial `#/diagnose` frame `#align-group` carries the `hidden` attribute, yet `frontend/diagnose-workstation.css:140` `.instrument { display: flex }` outranks the user-agent `[hidden] { display: none }`, so the "ALIGN" cap and an empty `.seg` pill paint in the instrument rail with zero buttons. `inline`
- The ticket's "expected" is already settled by ADR 31 part 3 (#41): ALIGN is present only where the canvas shows a factor's events or I:C history. The initial view must therefore not present it; making it interactive there is not an option. `inline`
- Fix by the repo's own convention for hidden elements (`.filter-menu[hidden]`, `.brace[hidden]`, `.canvas-head[hidden]`): an explicit `.instrument[hidden] { display: none; }` rule beside the `.instrument` base rule. No JavaScript change; `paintAlign` already toggles the attribute correctly. `inline`
- Deepen the frozen Diagnose behaviour ledger so it pins rendered visibility, not the attribute: the `state()` snapshot's `alignShown` reads `!hidden`, which is why the gate was green while the surface was wrong. `inline`

### Risk contract

- **Must prevent:** hiding ALIGN where ADR 31 shows it (case files, I:C history, event charts); any change to insulin guidance or stored data (none reachable from a stylesheet rule); a green gate that asserts the attribute rather than what renders.
- **Must recover:** none; static stylesheet change, no durable state.
- **Accepted failure:** the ledger amendment fails against the built app; the build stops and is fixed before the pull request.
- **Unsupported:** restyling the instrument rail, changing ALIGN's modes, touching the event-comparison or history canvases.
- **Evidence owed:** a ledger story that fails on the base commit (ALIGN visible on the initial frame) and passes after; the existing ALIGN stories still pass where ALIGN is meant to show; Diagnose replay at the app's locked viewports green.

Why: advisory-app chrome; the credible harms are a regression that hides a real control or a gate that cannot see the bug.

Disposition: `inline`

## Open questions

- None.

## Spawned tasks

- None.

## Plan review

- Round 1 (cold pass, sonnet): 0 blocking, 2 notes, both `authoring` and both reproduced: the mobile block is `@media (max-width: 760px)` not 768px (css:884); the #59 exemplar has no `## ADR` heading, so the order now names HEADING_RE explicitly. Order amended; verdict: countersigned.
