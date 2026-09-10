# Harmonic v2

## Why

Harmonic should help a Control-IQ user understand recurring adverse outcomes,
choose one supported setting or habit change, and return to see how it is going.
The first usable release completes the priority → change → follow-up → saved
conclusion loop for both settings and habits. A rearranged findings list or a
new toolchain alone does not meet that destination.

[Issue #348](https://github.com/harmonichq/harmonic/issues/348) is the epic.
This existing change remains the planning authority. The desktop prototype and
completed cold-QA repairs from [merged PR #379](https://github.com/harmonichq/harmonic/pull/379)
are the selected direction. ADR 348 — Adopt the reviewed desktop direction
records Connor's selection and the exact artifacts.

## What changes

Deliver the selected Diagnose / Changes / Day journeys under ADR 397:

- One backend-selected supported priority, or a guided investigation when no
  action is supported, with the cited glucose evidence and alternatives.
- A setting journey through Plan, manual pump entry, reconciliation, detected
  Trial, follow-up, conclusion and retained history.
- A habit journey through eligible Focus, adherence and outcomes shown
  separately, manual ending or Trial preemption, and retained history.
- Set aside, its optional reason, Restore and meaningful return; direct Day and
  exact return to the concern; freshness, held/thin/quiet and failed states;
  retained app and pump settings, Carb questions, Guide and Glossary.

[journeys.md](journeys.md) and the prototype brief describe those jobs.
[contracts.md](contracts.md) maps the existing authorities and concrete gaps.
[design.md](design.md) owns decisions and the remaining implementation questions;
[tasks.md](tasks.md) owns the checked sequence and child links. Historical
grounding remains in [evidence.md](evidence.md) and [predecessor.md](predecessor.md).

## Impact

Build `frontend-v2/` alongside `frontend/` with Vue/Vite/TypeScript and
single-file components. Extend the merged Vite foundation for `/v2/` and
`/v2/assets/`. V1 remains available on its existing routes. One Python API and
one database remain authoritative; Node builds production assets but is not a
production runtime. The v2 increment owns its new component boundaries and
extracts shared behavior only where it uses it. Wholesale decomposition of v1
is not a prerequisite.

Preserve the premium desktop cockpit and existing comparison graphs. Reuse
actual domain and chart implementations, their interactions, server-owned
eligibility and evidence populations. The browser derives no clinical rule.
Harmonic records decisions; the wearer enters pump settings manually.

The accepted risk contract is in design.md. Ordinary visible failure and retry
are sufficient; no offline write queue, recovery engine, event archive or new
analysis service belongs in this effort. Use synthetic evidence and the
repository's declared safe offline workflow.

Mobile is deferred. Root-route cutover and v1 retirement require later explicit
acceptance of the full v2 release. Intermediate PRs behind the preview route do
not satisfy the first-release milestone.

## Delivery

The reviewed priority-selection and set-aside policy from
[#383](https://github.com/harmonichq/harmonic/issues/383) admits the bounded backend
guidance and preference build in
[#384](https://github.com/harmonichq/harmonic/issues/384). Reuse #347's merged delivery foundation
and #340's reviewed comparison policy under #336; do not duplicate their work.
The durable-context, ending and comparison-integration contract is recorded by
ADR 386 from the bounded [#386](https://github.com/harmonichq/harmonic/issues/386) spike under
tasks 2.2–2.3. The coordinator verified the committed findings and synthetic
evidence and accepted the mandatory independent review, with its qualified
coverage recorded in evidence.md. These six investigation tasks are complete;
next child admission remains with the epic coordinator. The contract adds bounded
context/endings, one Trial finish/admission verdict and exact Focus comparisons;
production persistence, UI Craft and built-app verification remain owed.

Keep this active change on the pushed epic planning branch. It travels with
the implementation PR that realizes it; no planning-only PR is opened. Each
child receives normal ticket triage and independent review. Connor authorized
autonomous orchestration while AFK; routine decisions may use that delegation.
Agents leave implementation PRs open for human review and never merge.
