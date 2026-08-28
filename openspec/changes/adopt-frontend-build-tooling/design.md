# Design — adopt frontend build tooling, staged

## ADR 213 — Staged build adoption, dev harness first

**Decision.** Build tooling is adopted in stages. Stage 1 is a dev-only
component harness (npm toolchain + Storybook-style workbench) over the existing
plain ES modules, proxying to a running `harmonic serve`; the shipped app is
byte-identical. Monolith decomposition, CI/gate rework, CDN retirement, and any
production bundle are separate later stages, each filed as its own child when
its question is precise.

**Why.** The chart-review workstream (#203) needs a per-chart iteration harness
now; a stdlib one-off (#213's original deliverable) duplicates what standard
tooling provides, and the operator wants the toolchain for other reasons.
Staging caps the cost: stage 1 needs no rewrite of `frontend/index.html`, no
change to the dependency-free fast gate, and no CI overhaul, so the nine chart
reviews are not blocked behind a migration.

**Consequences.** #213's stdlib-workbench order is superseded. The stage-1
harness must import the shipped registry modules
(`frontend/diagnose-evidence-charts.js`, `frontend/diagnose-canvas-layout.js`)
live, never copies — the same no-extraction rule the original ticket carried —
so `tests/test_frontend_asset_routes.py`'s routes-equal-reachable-graph
invariant and the generated-mockup `--check` rule are both untouched.

## ADR 213 — The shipped artifact stays buildless by default

**Decision.** Build tooling serves development only until an explicit future
ruling says otherwise. The production app keeps its current form: no bundle
step, an explicit per-file asset whitelist in `api.py`, and a fast gate that
runs with no npm install. A production bundle, if ever, is its own late-stage
decision with its own trade, made after the dev-side stages have proven the
toolchain.

**Why.** For an advisory insulin-dosing tool, an auditable, boring shipped
artifact is a safety property. The dev-velocity wins (hot reload, component
isolation, pinned dependencies in the harness) do not require betting the
shipped app on toolchain longevity, so the default is to take them without
that bet.

**Consequences.** Stage children are reviewed against "shipped app
byte-identical" until a ruling changes it; a stage that cannot deliver its
value without touching the shipped artifact must come back to the epic as a
decision, not smuggle the change through a build ticket.
