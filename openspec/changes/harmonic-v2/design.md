# Harmonic v2 design investigation

Status: initial grounded checkpoint. Product direction, complete journey design,
synthetic walkthroughs, and rendered visual/interaction evidence are pending.

## Grounding

Grounded on `b8f4a71e89be1111b71439cea4b8761fbc95c46c` on 2026-09-06.
Issue #348 and related issues #347, #336, and #340 were read live, including all
comments. The #340 branch still resolves to its latest posted source,
`1ee53b341192b0943c83aae94b47dc6b33c571e3`. Its proposals are not shipped behavior.

The current product describes Diagnose, Verify, and Forensics as the user's
three jobs (`PRODUCT.md`). `CONTEXT.md` defines Plan, Trial, Focus, Maturing,
and the one-active-change constraint. Current capability specifications in
`openspec/specs/plan/`, `outcomes/`, and `http-api/` constrain reuse. Existing
OpenSpec decision records are the standing-decision source; no additional
external decision store is configured for this ticket.

## Product brief

The user is a Control-IQ pump wearer reviewing their own data. They may arrive
with a recurring problem, a setting or behavior change already underway, or a
specific event to investigate. They need a clear next action that is justified
by the available evidence and appropriate to their current state.

Success means the user can explain what they are considering, why it is
supported or held, what they actually changed, what data has arrived since,
and what remains uncertain. A quiet or thin result must still answer the user's
question honestly. Follow-up must distinguish trying a behavior from its observed
outcomes. Observational differences never establish causation.

Connor identified the missing product layer: findings do not resolve into one
concrete piece of advice. The app presents many possibly useful improvements
with separate charts, often with thin evidence, while related meal, low,
treatment, and correction events belong to connected stories. The lead journey
must prioritize and explain one useful next action, and point to the supporting
parts of the glucose trace. The complete setting, habit, and Day journeys remain
in scope.

## ADR 348 — A parallel v2 frontend with one Python data owner

### Decision

Carry the mechanical approach already agreed in issue #348 into the plan:

- Add the eventual v2 app in `frontend-v2/` alongside the existing `frontend/`.
  Use Vue/Vite/TypeScript. Preserve v1 routes and expose v2 at `/v2/`, with
  assets at `/v2/assets/`.
- Retain one Python API and one database owner. Reuse existing capabilities.
  Add backward-compatible contracts or migrations only for demonstrated v2
  needs. The browser does not re-derive clinical judgments or stageability.
- In development, Vite proxies requests to the repository-authorized synthetic
  offline backend. In production, Node builds assets and Python serves them
  within the existing deployment model. No Node production runtime is added.
- Introduce Vite with the first complete useful v2 increment. Do not require
  a preliminary migration of v1, a separate backend, a wholesale source copy,
  or a permanent diverging application branch.
- Ship ordinary short-lived PRs to main behind the preview route. Human merge
  and product-direction approval remain separate gates.

### Why and consequences

The frontend can change substantially while retaining the tested analysis
engine and existing installation. #347's standalone v1-tooling prerequisite
conflicts with this sequence; its reproducible-build, packaging, local-asset,
authentication, and synthetic-verification concerns still belong in v2 delivery.

This is the explicit future ruling anticipated by ADR 213's buildless default,
limited to v2. It does not change v1's current buildless delivery. The timing
and acceptance of final cutover remain open. No application implementation is
authorized by recording this decision.

## ADR 348 — Guidance leads, findings explain

### Decision

Center the v2 experience on one concrete, evidence-backed next action. The
opening experience should answer what is most worth addressing, why that is the
priority, and where the supporting episodes appear in the glucose chart.
Secondary findings provide explanation and alternatives on demand; they do not
all compete as parallel advice.

Use the operator's four connected problem shapes to investigate the product:
highs after meals, lows after meals, highs after treating lows, and lows after
correcting highs. This is a user-centered framing to test, not an authorization
to collapse distinct engine judgments, count the same events repeatedly, or
label an association as a proven cause.

### Why and consequences

Connor's Q1 answer describes the current app as a BI tool with many charts and
possible improvements rather than useful prioritization. Navigation and
component design must serve a chosen action and its evidence. A renamed or
shorter findings list alone does not meet this goal.

The engine remains the authority for eligible recommendations. The case where
a recurring pattern is visible but no concrete change is supported is the next
open product decision. Guidance must never manufacture stronger certainty to
make the app feel decisive.

## Journey inventory to design

These are required journeys and questions to test, not approved screen layouts.

| Arrival | Complete journey | Required distinction |
| --- | --- | --- |
| Recurring adverse outcome | See relevant findings and data freshness; examine support and alternatives; choose one justified change or deliberately hold; follow it; review its history | An unsupported finding remains explainable without becoming stageable |
| Supported setting change | Explore evidence; stage one tuning variable; review the full pump-entry schedule; record the decision; enter it manually; reconcile the next detected profile; follow the detected Trial; revisit the decision | Saving, deciding, entering on the pump, detected confirmation, and observed outcomes are distinct events |
| Behavioral change | Explore the behavioral finding; choose an eligible Focus; understand the concrete behavior; follow adherence and outcome independently; resolve or observe preemption; review the prior Focus | Starting a Focus proves intent, not adherence; no opportunities is unknown, not perfect adherence |
| Setting changed outside Harmonic | Detect the real pump change; show affected context and available before/after evidence; explain maturity and uncertainty; provide later review | A Trial can exist without an applied Harmonic Plan; do not invent a Plan link |
| A particular event | Open Day directly or from an occurrence; inspect the episode and related evidence; return to the same selection, window, and navigation context | An episode is an investigation entry, not automatic proof of a finding or a new active change |
| Routine return | See freshness, an existing draft, reconciliation, an active watch, or a quiet state; choose the next relevant action; reach settings and history | No new recommendation is a valid outcome; an active watch should not disappear behind new findings |

## Navigation hypothesis

Test four destinations without treating their names or boundaries as approved:

- Overview: state-aware next useful action, data freshness, and concise context.
- Explore: supported setting and habit findings with progressive evidence,
  uncertainty, and contextual entry to Day.
- Changes: the connected Plan, manual-entry/reconciliation, Trial/Focus, and
  durable review/history journey.
- Day: direct chronological investigation with explicit return context.

App settings and pump settings need clear access without becoming accidental
fifth and sixth primary jobs. Decide their placement during the navigation
walkthrough. Preserve the semantic distinction between proposed pump settings
and currently detected settings.

## Existing capabilities and concrete gaps

These source findings are an initial reuse map, not an exhaustive interface audit.
The graph located the domain implementations; exact source reads verified the
routes that the graph did not enumerate.

| Capability | Existing source and interface | V2 question or gap |
| --- | --- | --- |
| Findings and evidence | `ciq_autotune/api.py:857` exposes `/api/diagnose/findings`; following routes expose carb-ratio block/history, basal-night, ISF-rest, eating-sequence, and case-file evidence | Map the selected journey onto existing server-owned verdicts, identities, memberships, and denominators before adding another projection |
| Current context | `/api/status`, `/api/pump-settings`, `/api/outcomes`, `/api/outcomes/trend` in `api.py`; current freshness and chart consumers under `frontend/` | Establish which existing reads make a coherent Overview and how pending, stale, and failed states appear; do not infer quiet from an error |
| Plan and decision history | `api.py:1501–1540` exposes draft read/save, apply, and history; `store.py:1068–1106` persists the draft and timestamped applied items | Reuse the existing decision record. Determine the minimum durable linkage or review fields the selected journey needs; apply remains a record, never a pump write |
| Reconciliation | `frontend/plan.js:727–773`, `reconcileDeliverable`, compares proposed and detected schedules with parameter rounding and pending/mismatch/confirmed states | This behavior already has an implementation. Reuse it through a deliberate shared boundary, or explicitly choose one authoritative move when v2 needs it; do not duplicate its rules |
| Trial review | `/api/verify/trials` calls `watched_change.review_trials` (`api.py:812–836`, `watched_change.py:631–701`) | The shipped roster uses a bounded horizon and at most three candidates. #340 proposes broader derived history and selected-detail loading; a durable user review decision is a separate concrete need |
| Focus lifecycle | `/api/focus` and `/api/focus/{id}/resolve` (`api.py:1542–1590`); `store.py:417–424,1110–1163` | All pinned Focus rows persist with id, lever, pinned time, and active/resolved/dropped status. No end timestamp is stored. A historical follow-up period cannot be reconstructed from that status alone |
| One active watch | `watched_change.py:1297–1323` gives Trial precedence and persists Focus preemption; Focus pin rejects conflicts in `api.py:1551–1577` | Retain these authorities. A read-only history view must not call the active resolver merely to inspect history, because that resolver may drop a Focus |
| Day investigation | `/api/timeline`, `/api/day-navigator`, existing Day chart and navigation modules | Inventory reusable episode and return-context behavior before designing v2 links; retain the source window and selected occurrence |

Potential persistence work must be priced against a concrete user action. Two
candidates already have evidence: recording a durable review decision for a
Trial, and recording when/why a Focus ends so its historical period can be read
honestly. The final record shape, display, migration, and ownership are pending.
Do not invent terminal dates for old Focus rows, or treat an expired derived
Trial as a user decision. Unknown historical facts must remain unknown.

## Reconcile related work

| Work | Retain | Re-scope or supersede within the v2 plan |
| --- | --- | --- |
| #347 production Vite foundation | Pinned local runtime assets, reproducible build, API proxy, packaging, same-origin/auth behavior, Node absent at runtime, built-output checks | Its standalone migration of the current app is not a prerequisite. Attach those delivery obligations to the first meaningful v2 increment |
| #336 complete Verify feature | Setting and habit coverage; groups before individual events; useful evidence during follow-up; explicit uncertainty | Fit this complete follow-up experience into the broader discovery-to-history journey. Do not treat a lunch example as the whole feature |
| #340 reviewed comparison design | Treat its pinned ADR 340 as the comparison-design baseline: server-owned periods and populations, lazy selected detail, visible denominators, adherence distinct from outcome, existing active-watch authority, actual component reuse | Its existing Verify-shell placement does not settle v2 navigation. Its exclusion of historical Focus review does not meet #348's broader durable-history goal. Reconcile that extension explicitly before approving the v2 plan |

The detailed #340 comparison rules are read at the pinned commit, not copied
into a second statistical authority here. No shipped implementation is inferred
from a reviewed plan or a closed ticket. None of these related tickets or their
branches is changed by this checkpoint.

## Synthetic walkthrough obligations

These rows define the evidence to obtain; they are not claims of executed tests
or completed rendered designs. Select existing generated QA cases where they
cover the required state. Any new committed data needs its generator and drift
check in the same eventual change.

| State | What the walkthrough must establish |
| --- | --- |
| Held or thin | Evidence and the reason remain readable; the backend's staging verdict is honored; the user can investigate or wait without a fabricated recommendation |
| Quiet | The absence of a supported action is distinguishable from absent data, pending computation, and failure; Day and prior changes remain reachable |
| Maturing | The actual changed setting, its affected window, available observations, gaps, and remaining uncertainty stay visible; changing a display window does not change the engine's maturity verdict |
| Reconciliation | Exercise a saved draft, recorded intent, pending fresh pump data, mismatch, and detected match; no state implies Harmonic transmitted a setting |
| Focus follow-up | Exercise adherence improving without clear outcome movement, zero opportunities, manual resolution, and setting-change preemption; show each fact separately |
| History | Return to a former Trial or Focus after it leaves the active view; distinguish persisted facts, recomputed evidence, and unavailable legacy dates |
| Error and recovery | Exercise initial failure and failed replacement after a good result, plus retry; keep old evidence labeled as old and never attach it to the new subject |
| Day return | Follow an occurrence, inspect its episode, and return to the same prior subject/window/selection at desktop and narrow widths |

Use the current repository-authorized QA copy-then-serve workflow when a backend
is needed. Do not use the obsolete revise-E2E startup command in older issue
text. No live vendor fetch or personal data is needed for this investigation.

## Sequence to settle

1. Establish the lead unmet need and map all required journeys.
2. Validate navigation and progressive evidence through synthetic walkthroughs;
   settle the shared state transitions, history behavior, and risk contract.
3. Select a complete useful first journey and its minimum backward-compatible
   data contracts. Include the v2 build and delivery path with that increment.
4. Sequence remaining complete journeys while verifying that v1 still works
   against the same API/database. Split at real capability dependencies, not
   at individual charts or components.
5. Set cutover evidence, restoration of the previous frontend if cutover fails,
   and the conditions for retiring v1 routes/assets/docs. Keep v1 until those
   conditions are met and Connor authorizes cutover.

Current backend/Node tests, generated-fixture drift checks, browser gates,
OpenSpec validation, and ADR/publication guards remain inputs to the eventual
verification plan. A v2 increment must additionally exercise its built output;
a successful Vite development server alone will not prove deployment.

## Open decisions

- Q2: what leads when a recurring pattern is visible but no specific change is
  supported: guided investigation or waiting for evidence.
- The prioritization contract: how the existing engine chooses one actionable
  candidate, how related episodes inform it, and how other findings remain
  inspectable without creating competing advice.
- Navigation names, destination boundaries, and settings placement after the
  complete journeys are walked through.
- Durable decisions/history, terminal timestamps and reasons, legacy unknowns,
  and their exact relationship to existing Plan/Trial/Focus state.
- Concrete shared component contracts and any capability extension required
  to retain existing evidence interactions.
- Explicit reconciliation of #340's history and presentation boundaries.
- Visual/behavior contracts, bounded implementation risks, full coexistence
  verification, cutover, and retirement criteria.

The issue's safety, architecture, manual-pump, and one-active-watch constraints
are settled inputs, not questions to reopen. The remaining decisions prevent
an execution lock at this checkpoint.
