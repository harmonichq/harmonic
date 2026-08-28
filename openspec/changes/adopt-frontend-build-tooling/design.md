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

## ADR 239 — The stage-1 harness toolchain, pinned and uninspected

**Decision.** The stage-1 harness is a small local page built on Vite alone:
no framework plugin, and no story runner (no Storybook, no Histoire), served
by Vite's own dev server and proxying `/api` and `/assets` to a running
`harmonic serve`. The package manager is npm. Every harness dependency is
pinned to an exact version, and the lockfile is committed. No CI job
exercises the harness in stage 1. Node 22 is the required runtime — the same
version `.github/workflows/ci.yml` already pins — and it is documented as
required rather than enforced. The harness lives in a new top-level directory
named `harness/`, not under `frontend/`.

**Why.** This is a self-hosted tool with an audience of one, accepting no
outside contributions, whose development is expected to slow; every ruling
above is priced for minimum ongoing maintenance rather than completeness.
Storybook is not merely heavy here, it is structurally mismatched: there are
no single-file components to isolate, because components are inline templates
inside `frontend/index.html`, and the evidence charts are option producers
drawn onto a plain div by the `window.echarts` global rather than components
a stories UI can mount. That leaves a stories product supplying scaffolding
around a thing nobody would open, so Vite's dev server alone is the whole
requirement. Pinning is chosen as the low-maintenance option rather than the
cautious one: nothing in CI watches this tooling, so a floating range would
be discovered only as breakage on next use, while exact pins mean the harness
opens next year as it was left. Enforcing the Node version protects
contributors from a mismatch, and this project accepts none, so the version
is written down and left there.

**Consequences.** ADR 213's phrase "Storybook-style workbench" described the
shape of the tool, not a choice of product; it is settled here as Vite, and
ADR 213 is otherwise untouched. `harness/` falls outside the materialised
public tree by default exclusion, so the link and contamination checks never
inspect it; the same harness placed under `frontend/` would be swept in by
that tree's existing glob and would owe both checks. Pinned harness
dependencies will go stale, including with known vulnerabilities, and that is
accepted because they never enter the shipped app and never run in CI. The
stage-1 build child must add `node_modules` to `.gitignore`, which has no
such entry today.

**Risk contract.**

- **Must prevent:** any change to the shipped app's bytes; any real glucose,
  insulin or credential data reaching a commit; a harness dependency entering
  the shipped artifact or the dependency-free fast gate.
- **Must recover:** nothing; no unattended or long-running process exists here.
- **Accepted failure:** the harness breaks because a pinned dependency no
  longer works with the host Node or browser. It is found the next time the
  harness is opened and repaired by hand then. Pinned harness dependencies go
  stale, including with known vulnerabilities; accepted, because they never
  enter the shipped app and never run in CI.
- **Unsupported:** contributor setup on an unpinned or mismatched Node; any
  use of the harness as a test or gate; running it without a local
  `harmonic serve`.
- **Evidence owed:** none from this ticket, which changes no behavior. The
  stage-1 build child owes proof that the shipped app is byte-identical and
  that the fast gate still runs with no npm install.
