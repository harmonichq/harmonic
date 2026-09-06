# Harmonic v2 product plan

## Why

Harmonic should help a Control-IQ user understand recurring adverse outcomes,
choose one supported setting or habit change, and return to see how it is going.
Connor's lead unmet need is prioritization: one concrete next action, with the
related glucose episodes showing why it matters. Today's many findings and
charts leave that synthesis to the user. A fresh frontend needs complete
journeys through those jobs. A new toolchain or a rearrangement of today's
charts does not establish a better experience.

[Issue #348](https://github.com/harmonichq/harmonic/issues/348) requests an
attended planning investigation. This change is its planning authority. It is
an open draft, not an execution lock, approved visual design, or permission to
build the application.

## What changes

Produce and agree:

- A product brief and journey map spanning discovery, one-change selection,
  manual pump entry and reconciliation, setting and habit follow-up, durable
  review/history, Day investigation, and app/pump settings access.
- Synthetic walkthroughs for held, thin, quiet, maturing, reconciliation,
  unavailable, and failed states. Show adherence separately from outcomes and
  preserve uncertainty throughout the journey.
- A navigation and component design, with evidence contracts, that tests the
  Overview / Explore / Changes / Day hypothesis against those journeys.
- A grounded map of reusable engine, API, and storage capabilities, plus only
  the concrete contract or persistence changes the chosen journeys require.
- A sequence of complete useful increments, v1/v2 coexistence and verification,
  eventual root-route cutover, and v1 retirement.

The draft journey proposal is [journeys.md](journeys.md), the grounded interface
proposal is [contracts.md](contracts.md), and current-system probes are recorded
in [evidence.md](evidence.md). The bounded [existing-job inventory](predecessor.md)
records what the prototype has yet to carry forward. The ADRs in [design.md](design.md) own the settled
product decisions; these accompanying drafts apply them.

## Impact

The eventual frontend is `frontend-v2/`, built with Vue/Vite/TypeScript and
served under `/v2/`, with built assets under `/v2/assets/`. V1 keeps its routes.
One Python process/API and one database remain authoritative. Node builds
production assets but is not a production runtime. Vite arrives with the first
meaningful v2 product increment. Migrating v1 to Vite is not a prerequisite.

This investigation may write planning documents and properly governed synthetic
design evidence. It changes no production source, analyzer, database schema,
clinical threshold, deployed service, or existing ticket outside #348. Connor subsequently requested an open draft PR
containing the planning and prototype checkpoint, with unfinished work identified and no merge. That later
delivery instruction governs this investigation. Approved implementation later
uses ordinary short-lived, human-reviewed PRs to main behind the preview route.

The design records how #347, #336, and #340 relate to v2. Their tracker state
and branches remain untouched. Connor approves the selected direction before
execution; no implementation order is posted while that approval is pending.
