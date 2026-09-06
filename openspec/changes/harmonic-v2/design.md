# Harmonic v2 design investigation

Status: interview checkpoint. Q1–Q5 are settled; the save-recovery question was
removed after Q8. Q6 (active-change precedence) and Q7 (historical context) are
awaiting answers. Current-app grounding is complete; the v2 journey walkthrough,
visual design, review, and direction approval are still pending.

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
all compete as parallel advice. Among well-supported actions, prioritize the
most consequential recurring glucose problem, even if a different change would
be easier. This states the product objective; it does not certify an existing
score as preventable harm or authorize new clinical thresholds.

When the leading priority does not fit what the user wants to work on, let them
set it aside, optionally record why, and offer the next supported priority. This
records their choice; it neither declares the finding false nor weakens the
engine's clinical rules. The user can still inspect the underlying evidence.
Keep a set-aside priority aside until its recommended action or seriousness
meaningfully changes (Q5). Routine new data or a changed exact evidence
fingerprint alone must not erase that choice. Explain what changed when it
returns. The precise versioned comparison policy must be reviewed before
implementation; no numerical threshold is implied by this product decision.

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

The engine remains the authority for eligible recommendations. Connor settled
Q2 in favor of a guided look at the relevant episodes when a recurring pattern
is visible but no concrete change has sufficient support. That investigation
must help narrow what to address, identify what remains unknown, and keep its
status distinct from an eligible setting or habit recommendation. Guidance must
never manufacture stronger certainty to make the app feel decisive.

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

## Guidance journey proposal

This proposed sequence applies the settled product direction. It still needs
synthetic walkthrough and visual/interaction validation before approval.

1. On arrival, show the one next useful action in the context of data freshness
   and any draft, pending pump confirmation, or active watched change. An active
   watch stays visible; reading another finding does not silently replace it.
2. Explain the priority in terms of the recurring glucose problem, its observed
   consequence, support, and the reason it leads the available alternatives.
   Avoid a naked numerical score or a claim about future benefit.
3. Put the relevant glucose trace beside that explanation. Open a representative
   episode and make the repeated supporting occurrences reachable. Highlight
   only the source events or intervals cited by the engine. Keep observed,
   inferred, and missing facts distinguishable.
4. If an eligible action exists, explain the single change and route it through
   the existing one-variable Plan or eligible Focus journey. When no action is
   supported, use the same evidence view as a guided investigation with explicit
   unknowns and a clear stopping point; do not end with ten competing remedies.
5. Let the user act, investigate further, or set the priority aside with an
   optional reason. A skipped priority remains a recorded choice with accessible
   evidence. It returns only when the action or seriousness meaningfully changes,
   with an explanation of that change.
6. Return to the same concern after the change: show adherence separately from
   outcome, relevant before/after observations and uncertainty, and the actual
   state of pump reconciliation or the active watch. Keep decisions/history
   readable after the active view moves on.

The frontend interface should receive one coherent guidance result containing
the disposition, canonical selected action or investigation subject, concise
reasons, support/uncertainty, cited episode references, alternatives, and active
change context. The backend owns selection and eligibility. The caller should
not assemble a clinical story by joining independently arriving chart requests
or interpreting a score. Final endpoint shape and persistence writes will follow
the settled journey; this is not a commitment to a new parallel API service.

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
| Day investigation | `/api/timeline`, `/api/day-navigator`, existing Day chart, and `frontend/tab-routing.js:47–70` | Reuse the chronology and occurrence rendering. The routing module serializes Day date and destination-specific state; it does not itself provide a complete v2 return-to-priority contract |
| Set-aside preferences | `store.py:442,1205–1223`, `api.py:1095–1118`, `frontend/data.js:307–310` | Existing audit dismissals store item ID, exact evidence fingerprint, and dismissal time. The production Findings queue does not consume them. Add only the selected journey's stable priority identity, optional reason, selection consumption, and meaningful-return comparison |

Potential persistence work must be priced against a concrete user action. Two
candidates already have evidence: recording a durable review decision for a
Trial, and recording when/why a Focus ends so its historical period can be read
honestly. The final record shape, display, migration, and ownership are pending.
Do not invent terminal dates for old Focus rows, or treat an expired derived
Trial as a user decision. Unknown historical facts must remain unknown.

## Guidance capability boundary

The inspected backend already supplies meaningful parts of this experience:

- `analyzers/scenario/priority.py:43–86` computes a shared Priority from normalized
  impact and recurrence. Behavioral recurrence uses the Wilson lower bound;
  the score does not estimate preventable future harm or action effort.
- `findings_projection.py:895–931` orders independent findings, and explicitly
  withholds a cross-parameter headline. Every priced asserting row shares
  `next_in_line`; selecting the first as the overall recommendation would exceed
  what that row's independent assertion establishes.
- `analyzers/scenario/payload.py:139–225` supplies episodes, steps, source windows,
  highest-severity representative episodes, sibling episode IDs, and stable
  occurrence groups. These are concrete evidence for where to look on the
  glucose trace, without inferring associations from visual coincidence.
- `analyzers/scenario/attribute.py:364–493` preserves distinct meal and low
  attributions and their precedence. An over-treatment inference remains
  distinct from an observed carb entry and can be refuted by an explicit answer.

The product needs a backend-owned leading-priority decision across those existing
facts. Its contract must distinguish an eligible action, guided investigation,
and the next step for an already active change. The browser should receive the
selection and its reasons rather than inventing them from row order. Scope this
as a concrete v2 capability, not a new dosing engine or a wholesale re-score of
all classifiers. Settle the actual selection and comparison policy before build.

The user's four problem shapes organize several existing signals:

| Recurring problem | Existing behavioral signals | Preservation obligation |
| --- | --- | --- |
| Highs after meals | Carb undercount, late bolus, missed/unannounced meal, meal bolus fell short | Keep the different claims and opportunities distinct. Meal-bolus-short advice is observation-only; its grouping cannot promote it to dose advice |
| Lows after meals | Meal over-delivery, including meal-owned suspend evidence | Retain the owning meal, support, and existing assertion boundary |
| Highs after treating lows | Over-treated low | Show what was observed, inferred, or user-confirmed; retain refutations |
| Lows after correcting highs | Correction stacking and correction on active insulin | Retain the distinction between multiple nearby corrections and a lone correction onto earlier active insulin, while explaining their related problem together |

This map is supported by `analyzers/scenario/levers.py:45–139` and the linked
attribution functions. The group names are explanatory views over the existing
facts, not interchangeable classifier IDs or shared denominators. Qualify each
recommendation under its own rules. Do not add unrelated occurrence counts or
pool thin findings into apparent support for a specific action.

New prioritization must also preserve relevant setting recommendations such as
basal, ISF, and I:C. The four behavioral stories are not a rule that all adverse
outcomes originate in behavior. Do not force unexplained or background problems
into a meal/correction story. Keep those settings and unknowns reachable and
eligible to lead when the evidence warrants it.

The engine can assemble time-ordered episode stories under deterministic rules;
that is not proof that one step caused the next. Group related evidence for
understanding while retaining its identities, uncertainty, and overlapping
ownership. Existing scenario `Pattern.rank` must not be substituted for Findings
Priority: their assembly and queue ordering are not the same contract.

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
| Held or thin | Evidence and the reason remain readable; the backend's staging verdict is honored; a visible recurring problem leads into guided episode investigation with explicit unknowns, without a fabricated recommendation |
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

## Current-app walkthrough and fixture grounding

On 2026-09-06 the attended session opened the current app using the authorized
QA copy-then-serve workflow and inspected rendered Diagnose, Plan, Verify, and
Day. Only the generated showcase database was copied, and vendor fetching was
disabled. Screenshots were inspected locally and kept outside the branch. This
was an existing-app reconnaissance pass, not a v2 acceptance walkthrough or a
claim that the full browser gates passed.

Observed behavior:

- The browser still asks for a token on the empty-token QA server. Entering an
  arbitrary synthetic token through Settings enables the client requests. No
  vendor credentials were entered and Fetch was not used.
- Diagnose presents the selected setting evidence, a separate findings list,
  and an active Trial summary. The selected setting is not an engine-certified
  overall recommendation.
- Plan exposes the detected profile, accepted changes, and a manual-entry
  schedule. An empty plan says there is nothing to program.
- Verify exposes a derived Trial and its observations. Its current copy says
  Keep is session feedback and records nothing, confirming the durable-history
  gap in the source map.
- Day opens the selected date and lets the user open an Episode log row to
  inspect the detector's reasoning and Evidence tier. A full v2
  occurrence-to-Day-to-priority return journey has not been implemented or
  demonstrated by this pass.

Reusable manufactured state inputs and the limits of existing proof:

| Need | Existing source | Gap the v2 walkthrough must cover |
| --- | --- | --- |
| Qualified settings; held, thin, blind, quiet, and historical tuning | `scripts/qa_e2e_cases.py` and `scripts/gen_qa_e2e_db.py`; cases such as `setting-recommendation`, `basal-insufficient-seven-night`, `basal-no-change`, `ic-collecting`, `ic-held`, and `ic-history-register` | The catalog's `execute_case` ends at producer/projection evidence; it does not exercise a continuous decision or follow-up journey |
| Plan and reconciliation | `tests/test_api.py`, `frontend/plan-first-match.browser.mjs` | Connect a guidance-selected eligible setting through the existing Plan, recorded intent, detected pump match, and Trial |
| Behavioral Focus | Behavioral cases in `scripts/qa_e2e_cases.py`; `tests/test_outcomes_trend.py` Focus API round-trip; `tests/test_watched_change.py` Focus and preemption tests | An integrated Focus walkthrough with distinct adherence/outcomes and a durable historical ending |
| Maturing and past Trials | `mockups/verify-660-story.synthetic/payload.json` and `frontend/verify-660-story-behavior.replay.mjs` | Apply the retained comparison contract to the new journey and its durable decisions |
| Failure and navigation | Existing Diagnose/Verify replay drivers, `frontend/day-surface.browser.mjs`, and `frontend/cockpit-shell.browser.test.mjs` | Guided-priority failure states and preservation of its context through Day and back |

These source inspections establish reusable material, not executed coverage of
v2. A quiet selected clock window, thin I:C evidence, and a product-level decision
that no change is warranted are different cases. Do not substitute one for
another to make a walkthrough appear complete.

The issue explicitly requests a new sibling v2 surface, and no `frontend-v2/`
implementation exists at the grounding base. UI Craft setup therefore routed
that future surface to `lock`. No v2 mock, visual lock, or production revision
was created in this triage checkpoint. Source tokens and rendered v1 chrome
remain the material baseline for the eventual v2 design round; the required
predecessor behavior inventory must also cover jobs that v2 will replace.

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

## Risk contract

This contract uses the repository invariants and ordinary failure handling.
Connor rejected treating save recovery as a separate product-design project (Q8).

- **Must prevent:** secret or personal-data exposure; irreversible loss of authoritative data; silent incorrect success, including a failed save shown as saved; unsupported treatment advice or pump transmission implied by a recorded decision.
- **Must recover:** no new automatic-recovery capability is required.
- **Accepted failure:** a rare failed read or write may visibly stop the affected action and require a user retry. Preserve the current in-memory draft where it already exists; do not add an offline write queue, background retry engine, or crash-recovery subsystem.
- **Unsupported:** automated pump control, live vendor fetching in automated work, guaranteed operation while disconnected, and reconstructed historical facts that were never stored.
- **Evidence owed:** verify the selected guidance against backend eligibility and cited episodes; one active watch; Plan/actual pump-change distinction; adherence/outcome separation; set-aside persistence; ordinary failed actions never reported as successful; synthetic-only walkthroughs and v1/v2 coexistence.

Why: the advisory consequences require truthful state, while speculative recovery work does not serve the requested care-improvement journey.
Disposition: inline; governing plan contract, to be carried into any eventual implementation admission.

## Open decisions

- Q6: whether the active change or a new more consequential problem leads on return.
- Q7: how the historical decision context and updated assessment are presented.
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
