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

## ADR 240 — Harness stories, and where each story's numbers come from

**Decision.** The stage-1 harness carries six stories: one for each chart kind
the registry publishes — basal, ISF, carb ratio and event comparison — plus the
full-width clock strip (#204) and the inspector drill reached from a finding's
case file (#212). Drawer thumbnails and mini tiles (#209) are not a seventh
story: all four chart option builders already take a miniature flag, so a
thumbnail is one of those four chart stories drawn at its miniature size
setting. Inside a story, mode (where the kind carries more than one),
coordinate, size and theme are pickers rather than stories of their own, and the
picker state is carried in the address, so an exact view reopens from a link
days later. Every story can be fed two ways behind one switch: from manufactured
data committed to this repository, or from a running `harmonic serve`.
Manufactured is the default. The manufactured side starts as exactly the payload
set already committed under `mockups/`; a new manufactured state is added only
when a review needs one it cannot otherwise show. No chart's form is settled
until it has been seen on the operator's own history through that switch.

**Why.** The goal that priced these rulings is cheap iteration on a chart with
an AI agent, not coverage completeness. Manufactured data is the default because
the operator's real history is never committed: an agent cannot load it and
cannot reproduce what it is looking at, so a real-history default would make the
agent's half of the loop impossible rather than merely slower. The flip to real
history is nonetheless not optional. Measured read-only against a local snapshot
of the operator's own database, his current history does not exercise every
state the chart reviews judge, so manufactured data alone cannot show them all;
which states were empty is deliberately not recorded, because what this ruling
needs is that the gap was measured rather than assumed, and a later reader owes
no re-measurement of that database to act on it. Starting the manufactured set
at what is already committed holds the ongoing maintenance at nothing until a
review proves it needs more, in the same spirit as ADR 239's pricing for minimum ongoing maintenance.

**Consequences.** Feeding a story from committed data reuses the path the
browser gates already run on — route stubs over the committed synthetic payloads
plus the drift-checked mirror of the findings projection
(`mockups/findings-projection.mirror.mjs`, held identical to the Python by
`frontend/findings-projection-mirror.test.js`) — rather than standing up a
second source of truth for what a chart is shown. The harness must never be
pointed at the committed synthetic database by serving it: that mutates a
tracked file, leaving WAL sidecars and a derived database beside it. A
manufactured state added later owes a generator and a `--check` step in the same
change, per this repository's fixture rule, so a committed payload can never
silently drift from its producer. #209's review is conducted inside the four
chart stories at their miniature setting, so closing it does not wait on a story
of its own. ADR 239 listed running the harness without a local `harmonic serve`
as unsupported; that bound was written before this ruling and is narrowed here,
because the manufactured default is precisely such a run and is the case the
harness is built for. Running the harness against a live vendor pull stays
unsupported. And because no chart is settled on manufactured numbers, each of the
chart reviews under #203 ends with a flip onto the running app, not with a
manufactured screenshot.

**Risk contract.**

- **Must prevent:** any real glucose, insulin, dose, timestamp or credential
  value reaching a commit, a screenshot, a CI log or a pull request body; a
  chart settled on manufactured data alone; any harness dependency entering the
  shipped app or the dependency-free fast gate.
- **Must recover:** nothing; no unattended or long-running process exists here.
- **Accepted failure:** the harness breaks because a pinned dependency no longer
  works with the host Node or browser, or because a committed payload's shape
  drifted from the app. Found the next time the harness is opened, repaired by
  hand then.
- **Unsupported:** running the manufactured side against a live vendor pull;
  pointing the harness at the committed synthetic database by serving it; any
  use of the harness as a test or a gate.
- **Evidence owed:** none from this ticket, which changes no behavior. The
  stage-1 build child (#241) owes proof that the shipped app is byte-identical
  and that the fast gate still runs with no npm install.

## ADR 241 — The drill is a chart's state, not a story of its own

**Decision.** The inspector drill is a state each chart story can be opened in,
not ADR 240's sixth story. The harness reaches that state by mounting the real
workstation unmodified and clicking the chart tile. ADR 240 is otherwise
untouched.

**Why.** The drill belongs to each chart: every chart that can take the
spotlight must be drillable, and the inspector is the surface expected to be
iterated on next. `showChartInspector` is the one entry for both parameter and
behavioral chart families.

**Consequences.** `gotoState` cannot address a drill, so clicking the tile is
the app's own path into it. This adds no harness-only rendering path that could
disagree with the app. The manufactured case-file store already carries
`unavailable_*` and `empty_event` variants, so the drill's failure states need
no new fixture.

**Risk contract.**

- **Must prevent:** any change to the shipped app's bytes; any real glucose,
  insulin, dose, timestamp or credential value reaching a commit, a screenshot,
  a CI log or a pull request body; any harness dependency entering the shipped
  artifact or the dependency-free fast gate; a copy of shipped source, markup
  or tokens living under `harness/`.
- **Must recover:** nothing; the harness runs no unattended or long-running
  process.
- **Accepted failure:** the harness breaks because a pinned dependency no longer
  works with the host Node or browser, or because a committed payload's shape
  drifted from the app. Found the next time the harness is opened and repaired
  by hand then. The operator starts `harmonic serve` himself for the live
  switch; the harness does not launch it and shows a plain message when it is
  absent.
- **Unsupported:** running the manufactured side against a live vendor pull;
  pointing the harness at the committed synthetic database by serving it; any
  use of the harness as a test or a gate; contributor setup on a mismatched Node.
- **Evidence owed:** the byte-identical `git diff` above, and the fast gate
  passing with no `npm install`. No test suite is owed for the harness itself —
  ADR 240 rules its use as a test or a gate unsupported, and a suite would be
  the gate the epic declined.
