# Harmonic v2 design investigation

Status: the desktop prototype and completed cold-QA repairs are the selected
direction. The complete desktop journeys and review records from merged PR #379
are adopted below. Product interview decisions remain settled. ADR 383 governs backend selection. ADR 386 below records the durable
identity/endings and comparison contract, now settled and independently reviewed; production
implementation and UI Craft fidelity evidence are not yet complete.

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

## #386 investigation admission

Tasks 2.2–2.3 are one flat, bounded investigation. The dominant uncertainty is
the still-unsettled durable follow-up contract; the selected desktop direction,
the current backend authorities, ADR 131, ADR 348, and #340's comparison policy
are inputs, not questions to reopen. The spike records its rulings in this
change and uses a small synthetic scratch replay to make the sequential and
period rules observable. It creates no production code, schema migration,
committed fixture or replay program, rendered surface, clinical policy, or
second OpenSpec change.

### Risk contract

**Must prevent:** an invented legacy fact, a finished Trial reopening or
promoting an older candidate, a historical read mutating an active Focus, and a
comparison presented as causal or as evidence from a changed inference context.

**Must recover:** an ordinary retry after a finish request returns the recorded
ending without a duplicate write or a reopened watch.

**Accepted failure:** a legacy record lacking original context or an ending keeps
those unstored facts explicitly unavailable. A separate read-only reassessment
may use existing raw data, but it neither rewrites the original record nor
invents the missing facts.

**Unsupported:** inferring Plan-to-Trial linkage from time or a matching setting,
backfilling legacy ending dates, live vendor data, and production persistence
changes in this spike.

**Evidence owed:** a synthetic replay that explicitly asserts every task
checklist identity, ending, reconciliation, preemption, legacy, exact-period,
denominator, and correction-family outcome, prints and records in `evidence.md`
its inputs and actual observed/asserted outputs, and exits nonzero for a failed
or unexercised case; strict OpenSpec validation; and the repository's
documentation guards.

Why: these contracts carry historical meaning and must not silently manufacture
facts or clinical conclusions. Disposition: inline in this active parent change.


## ADR 348 — Adopt the reviewed desktop direction

On September 7, 2026, Connor instructed: “The desktop prototype and completed
cold-QA repairs are the selected design direction.” PR #379 was human-merged
as `ee0460eca3618aac0977f65a286ccb4357504544`. This continuation adopts the
existing change rather than starting a new product plan.

The selected artifacts at that commit are the journey and contract documents
in this change; `mockups/harmonic-v2.exploration/BRIEF.md`; the desktop prototype
`mockups/harmonic-v2-glucose.html` at `source=journey` and its generated inputs; and
`REVIEW.md`, `FABLE-REVIEW.md`, `AUDIT.md`, `COLD-WALKTHROUGHS.md` and
`OPUS-QA-REPAIRS.md` in the exploration directory. The completed repair record
governs the repaired navigation and acknowledgment behavior where earlier
rounds differ. The existing comparison graphs and their authority remain intact.

Keep the selected Overview / Explore / Changes / Day destinations, the premium
desktop cockpit, original Trial evidence, saved conclusions, precise Day return,
and the visible Set aside/Restore behavior. Continue using CONTEXT.md and the
existing app's prose. No new concept or navigation debate is required.

This closes direction selection and the completed desktop walkthrough work.
It does not turn page-memory prototype state into durable production behavior,
prove a second sequential change, or supply a formal UI Craft build/fidelity
record. The implementing ticket formalizes that contract from these artifacts
and verifies the built surface. It does not redesign the selected direction.

The v2 architecture, both-loop first-release boundary and risk contract below
remain controlling. Vite and single-file components own the new v2 boundaries;
wholesale v1 decomposition is not a prerequisite. Mobile is deferred. V1 stays
available during `/v2/` development; cutover and retirement remain later gates.

Connor then authorized autonomous orchestration while AFK and asked for best
judgment without over-engineering a one-person tool. Use Opus 5 medium for
design and Codex Sol medium for browser walkthroughs when needed. Carry routine
implementation choices through review under that delegation. Agents leave PRs
open for human review and never merge. One implementation child may be in flight;
the next implementation handoff waits for its human merge.

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
  Use Vue/Vite/TypeScript with single-file components for the new shell,
  journey surfaces and shared evidence views. Establish those boundaries in
  the first useful v2 increment, rather than postponing them to cleanup.
  Preserve v1 routes and expose v2 at `/v2/`, with assets at `/v2/assets/`.
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
- The first usable v2 release completes the full priority → setting or habit
  change → follow-up → saved conclusion loop (Q10). This is a product milestone
  that may span several reviewed PRs. A guidance-only surface handing the action
  and follow-up back to v1 does not meet it.

### Why and consequences

The frontend can change substantially while retaining the tested analysis
engine and existing installation. PR #380 merged the v1 Vite foundation on
September 6, 2026. ADR 347 supersedes ADR 213's buildless production default;
its build, packaging, local-asset, authentication and built-output checks are
now existing delivery work for v2 to extend.

The v2 build owns decomposition of its new shell and extraction of shared
pieces it actually uses. It does not depend on decomposing every region of
the retiring v1 shell first. Component boundaries must concentrate a real
responsibility; exact components belong in the subsequent build brief. Reuse
one implementation of existing domain and chart behavior, as the contracts
below require. This clarification follows Connor's September 6 question about
PR #380 and ADR 213's later decomposition stage; it creates no separate ticket.

V2 remains a sibling application under `/v2/`. The timing and acceptance of
final cutover remain open. No application implementation is authorized by
recording this decision.

## ADR 348 — Guidance leads, findings explain

### Decision

While following an active change, lead with that change and its current progress
(Q6). Important worsening remains visible alongside it. Viewing another concern
does not replace the active watch or begin a second change.

Outside that active journey, center v2 on one concrete, evidence-backed next action. The
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

## ADR 348 — Decisions retain their context and ending

### Decision

Preserve a snapshot of what the user knew at the time and how the Trial ended
(Q7). A later assessment may be read separately; it must not rewrite the record
that explains the original decision. The complete Focus journey carries the
same historical distinction.

Capture the chosen action, its explanation and evidence window, the relevant
support or uncertainty, and the decision time. Preserve the actual detected
setting change separately from Plan intent. At the ending, retain when it ended,
what ended it, and the available final assessment with its limitations. A
user decision to stop or continue, a new detected setting, and a loss of usable
follow-up are distinct facts; none is proof that the change worked.

Keep this a bounded record of the decision and its ending, not a copy of the
database or every intermediate analysis. Existing Plan, Trial, and Focus
identities stay authoritative. A Trial detected outside Harmonic must not acquire
an invented earlier Plan or pretend to have a contemporaneous snapshot from
before Harmonic first observed it. Historical facts that were never stored are
shown as unavailable, including missing ending times for legacy Focus rows.

### Why and consequences

Connor needs to revisit what the decision was based on and how the attempt
concluded. The current derived Trial roster and transient Keep feedback cannot
provide that account. A minimal persisted snapshot and ending record are
therefore concrete v2 requirements. The exact storage fields and migration must
be designed around the existing identities before implementation admission.

## ADR 348 — Reviewing can finish a Trial

### Decision

Once a Trial has enough data to judge under the existing backend maturity rule,
let the user record a conclusion and finish it (Q9). The finished Trial remains
in history with the context and ending defined in ADR 348 — Decisions retain
their context and ending. Finishing releases the active slot so the user can
choose the next supported change. It neither changes a pump setting nor marks
an observational improvement as caused by the Trial.

This is an explicit change to current watch behavior. All consumers must use one
backend finish/admission verdict: Overview, Trial review, and the Focus pin
guard must agree. A refresh must not reopen the same finished Trial, and closing
it must not promote an older historical Trial into the foreground and block the
next choice. A genuinely new detected pump change still opens a Trial and
preempts a Focus under the existing one-active-watch rule.

### Why and consequences

Today `detect_trial` selects an eligible non-reverted change within its watch
horizon, and `trial_is_active` uses its existence, not whether it is maturing.
The frontend's Keep handler records no decision. A ready-to-review Trial can
therefore still block Focus. Merely adding a history card or hiding the Trial
in v2 would fail the requested behavior.

`watched_change.py:388–523,631–701,1015–1058,1106–1115,1284–1323` also exposes an
important split: the active singleton and review roster are different
projections. Captured block-I:C Trials can appear in review while being excluded
from the singleton. Reconcile those identities and admission semantics through
the backend before building the new finish action; do not invent a third
frontend classifier. Preserve actual pump-change detection and the retained
comparison rules from #340. Treat changed active admission as a deliberate
review item, not a claim that #340 already authorized this behavior.

A user finish, an observed reversal or superseding change, and an unreviewed
expiry remain different endings. No missing historical ending is backfilled
as a successful conclusion.

The complete proposed destination and journey walkthrough is in
[journeys.md](journeys.md). It applies the decisions above and is pending
rendered validation and approval.

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
   and any draft, pending pump confirmation, or active watched change. Apply
   the active-change precedence in ADR 348 — Guidance leads, findings explain.
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

The minimum proposed ownership and persistence changes are recorded in
[contracts.md](contracts.md). That proposal makes the existing Focus admission
boundary, evidence/advice separation, and historical-period limits explicit.

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
| One active watch | `watched_change.py:1297–1323` gives Trial precedence and persists Focus preemption; Focus pin rejects conflicts in `api.py:1551–1577` | Implement ADR 348 — Reviewing can finish a Trial in these backend authorities. A read-only history view must not call the active resolver merely to inspect history, because that resolver may drop a Focus |
| Day investigation | `/api/timeline`, `/api/day-navigator`, existing Day chart, and `frontend/tab-routing.js:47–70` | Reuse the chronology and occurrence rendering. The routing module serializes Day date and destination-specific state; it does not itself provide a complete v2 return-to-priority contract |
| Set-aside preferences | `store.py:442,1205–1223`, `api.py:1095–1118`, `frontend/data.js:307–310` | Existing audit dismissals store item ID, exact evidence fingerprint, and dismissal time. The production Findings queue does not consume them. Add only the selected journey's stable priority identity, optional reason, selection consumption, and meaningful-return comparison |

Potential persistence work must be priced against a concrete user action. Two
candidates already have evidence: recording a durable review decision for a
Trial, and recording when/why a Focus ends so its historical period can be read
honestly. ADR 386 settles the record contract and ownership; production display
and migration remain owed.
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
| #347 production Vite foundation, merged in PR #380 | Pinned local runtime assets, reproducible build, API proxy, packaging, same-origin/auth behavior, Node absent at runtime, built-output checks | Extend the merged delivery foundation for `/v2/`. The v2 build establishes its own component boundaries and extracts the shared pieces it uses; wholesale v1 decomposition is not a prerequisite |
| #336 complete Verify feature | Setting and habit coverage; groups before individual events; useful evidence during follow-up; explicit uncertainty | Fit this complete follow-up experience into the broader discovery-to-history journey. Do not treat a lunch example as the whole feature |
| #340 reviewed comparison design | Treat its pinned ADR 340 as the comparison-design baseline: server-owned periods and populations, lazy selected detail, visible denominators, adherence distinct from outcome, one-active-watch constraint, actual component reuse | Its existing Verify-shell placement does not settle v2 navigation. Its exclusion of historical Focus review does not meet #348's broader durable-history goal. The history and explicit Trial-finish extensions are owned by the two corresponding ADR 348 records |

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
that future surface to `lock`. The first synthetic concept round now lives under `mockups/harmonic-v2*`,
with a shared source-derived scaffold and a brief at
`mockups/harmonic-v2.exploration/BRIEF.md`. Its empty chrome passed a rendered
comparison with v1 before the three concept agents were dispatched. No visual
lock or production revision is claimed. The predecessor behavior inventory
must also cover jobs that v2 will replace.

## First concept comparison

The three unlocked directions are reviewed in
`mockups/harmonic-v2.exploration/REVIEW.md` and available together through
`mockups/harmonic-v2-review.html`. Six prototype states were rendered at desktop
and narrow widths; primary episode, set-aside, conclusion and retry flows were
walked. This is hierarchy evidence only. It does not discharge the complete
walkthrough obligations above. Q11 selected Glucose first. The parent
recommendation recorded in the first review is historical; Connor
asks that the selected direction become a cohesive workstation and retain the
existing aggregate event comparisons as central evidence.

## ADR 348 — Glucose first as a workstation

**Decision.** Develop the selected Glucose first concept. The primary working
surface must feel like a cohesive premium workstation: the leading concern,
its evidence and the next action retain their relationship as the user
inspects them. A long vertical sequence of narrative sections does not satisfy
this direction. Resolve the concrete arrangement in the next prototype round
using the existing Harmonic visual language.

The aggregate event comparison is a valued part of the existing experience.
Preserve comparison between events that matched the finding, nearly matched
events, and the eligible comparison population. Make that comparison central
to understanding the selected concern, with a continuous route into a cohort
member, its relevant episode and Day, and back to the same context. This
requirement concerns Diagnose event cohorts; Trial before/after and Focus
adherence/outcome evidence remain separate jobs with their existing semantics.

Membership, eligibility, denominators, support and anchors remain backend
owned. A comparison is not a claim of causation, and a nearly matched event
does not become a recommendation. Retain the shipped distinctions for limited
and withheld aggregates and their inspectable episodes. Presentation grouping
must not silently replace the comparison population or reclassify events.

**Why.** Connor selected Glucose first because seeing the glucose evidence is
valuable, while also asking for stronger curation. One leading priority and
rich comparison evidence serve the same decision when they share a working
context. They do not require a competing list of recommendations.

**Boundary.** This settles a direction and retention requirement. The next
render must prove the arrangement, narrow behavior and active Trial/Focus
continuity. It does not lock the design, complete the full-loop walkthroughs,
or authorize production implementation. Connor requested an additional
Claude Fable 5.1 critique at high effort before the next revision.

### Aggregate comparison reuse grounding

The existing `frontend/diagnose-event-comparison.js` exposes
`eventComparisonChartOption` and `renderEventSurface` for a server-produced
`diagnose-finding-case-file-v1` with event alignment. The surface can lend its
readout to a caller-owned headline. Its caller owns frame sizing and cleanup,
which gives the next workstation prototype a composition seam without a
second chart implementation.

`ciq_autotune/finding_case_file.py::_event` supplies matched, nearly matched
and comparison cohorts, with names, anchors and membership. Its policy in
`analyzers/scenario/evidence_population.py` determines comparison eligibility.
Other lever claims can remain comparison members when eligible; the UI must
not reconstruct membership by pooling verdict labels. Cross-population
comparisons also have their own population and anchor contract.

`ciq_autotune/event_comparison.py::project_cohort` owns per-cohort and per-point
support, usable counts, the median and interquartile range. A missing aggregate
is not zero glucose or evidence that no problem exists. The renderer preserves
support gaps and uses the cohort values to set its glucose field, so selecting
one episode does not silently rescale the comparison. That field invariant
must not be applied to full Day in a way that hides glucose outside the
comparison range. A shared stage can use the existing renderer for each job.

The case-file producer does not opt into `project_cohort`'s legacy raw-episode
fallback for withheld aggregates. The renderer can draw such a fallback if
supplied, but v2 cannot assume the current response contains one. Preserve
withheld status and available member inspection. Likewise the served
`not_comparable` count is a roster residue, not a UI formula for deriving who
belongs to the comparator.

The older `mockups/diagnose-event-comparison.synthetic/project.mjs` emits
`finding-case-file-event-capture-v1` and the earlier cohort taxonomy. It is
not a drop-in input for the current case-file renderer. The next generated
capture must exercise the current producer contract instead of renaming the
older fixture keys. Any extension to the v2 generator retains its existing
`--check` CI gate. These are inspected source facts, not an executed v2
comparison walkthrough.

## Proposed delivery sequence

Q10 sets one first-release milestone: the full loop for settings and habits.
The steps below may land in several ordinary reviewed PRs behind `/v2/`;
intermediate availability is preview work, not fulfillment of that milestone.
They are proposed capability boundaries for later ticket locks, not an
executable component backlog or permission to change the related tickets.

1. **Settle selection and decision identity.** Validate the selected experience
   against complete synthetic journeys. Specify how the backend chooses one
   supported action or an investigation and explains that choice; identify the
   persistent subject of a set-aside preference. Define what constitutes a
   meaningful action or seriousness change. Existing raw fingerprints and queue
   order are insufficient. Evidence-policy questions that remain unresolved
   become bounded investigations with an explicit exit criterion before any
   dependent recommendation ships.
2. **Complete the setting loop in preview.** Extend the merged Vite delivery
   foundation for v2, with single-file component boundaries for its shell,
   journey and shared evidence views, together with a useful setting journey:
   guidance and cited evidence,
   Plan, manual entry, reconciliation, Trial follow-up, conclusion, and history.
   Reuse the existing setting-specific eligibility and delivery paths; basal,
   I:C, and ISF do not acquire interchangeable staging rules. Add the snapshot
   and Trial-ending persistence this journey requires, with one backend verdict
   consumed by active selection, review, and the Focus admission guard.
3. **Complete the habit loop in the same preview.** Reuse guidance, navigation,
   cited episodes and history. Start and follow a Focus through the guidance owner’s supported-action
   decision and the existing pin/watch constraints, distinguish adherence from outcomes, record manual endings and
   Trial preemption, and preserve the original context and ending. Cover the
   supported behavioral families rather than blessing one meal example as the
   complete feature. Do not make a second watch authority or outcome engine.
4. **Accept the full-loop release.** Complete the limiting-state walkthroughs
   and evidence coverage across both loops, including held/quiet/failed reads,
   ordinary failed actions, set aside and meaningful return, direct Day and
   return to the same concern, restored drafts, settings access, and historical
   unknowns. Verify the production build served by Python and the retained v1
   journeys against the same database. The selected visual and behavior records
   and independent review must agree with the rendered result.
5. **Cut over and retire separately.** After Connor accepts the complete v2
   release, authorize the root-route cutover explicitly. Keep the previously
   served v1 route/assets available during that transition. Verify installations,
   authentication, direct links and history access after cutover. Retire v1 only
   when its inventoried jobs are preserved or Connor has explicitly approved
   their retirement, and remove old routes/assets/docs together. Restoring the
   prior frontend must not require discarding the shared decision history.

Every backend write continues to follow the existing cache invalidation rule;
the existing Plan-draft exception is not expanded by analogy. Ordinary failures
follow the risk contract below; no new recovery subsystem belongs in this plan.

Current backend/Node tests, generated-fixture drift checks, browser gates,
OpenSpec validation, and ADR/publication guards remain the existing verification
bar. Each future ticket adds checks through the public interface for the
behavior it actually changes. V2 delivery additionally needs built-output proof
for `/v2/`, `/v2/assets/`, API authentication and the packaged Python-only runtime;
a working Vite development server alone does not establish deployment. Exact
commands and reviewed source pins belong to the eventual implementation locks.

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

## Remaining implementation decisions

### Priority selection and set-aside return — promoted to #383

[#383](https://github.com/harmonichq/harmonic/issues/383) owns the explicit
cross-parameter selection and tie-break, action/investigation/quiet dispositions,
stable preference subject, and exact action/seriousness return comparison.
It must demonstrate the rule on synthetic evidence before a dependent build.
The existing Priority and eligibility predicates are inputs; neither shared
queue tier nor an evidence fingerprint settles this policy. Resolve the existing
evidence/advice distinction without parsing clinical sentences in the browser.

That investigation's acceptance is the `guidance` capability delta in
[specs/guidance/spec.md](specs/guidance/spec.md), and its steps are
[tasks.md](tasks.md) 2.1.1–2.1.6. The delta states the shape the settled policy
must satisfy: one backend-owned deterministic rule with an explicit tie-break, a
stable set-aside subject that survives routine recomputation, an action or
seriousness comparison that returns that subject with a stated reason, and cited
evidence kept distinct from advice. It deliberately does not choose the rule, the
tie-break or the comparison. #383 settles those and records them as an ADR
identified by that issue in this document, with its replay receipts in
[evidence.md](evidence.md). Task 3.1 then builds against that same delta.

### Durable Trial/Focus context and endings

ADR 386 — Retain decision facts and one watch verdict below records the
versioned records, Plan reconciliation and canonical Trial admission contract.
Its synthetic replay and qualified independent-review receipts are in evidence.md.
The coordinator verified completion of tasks 2.2–2.3; production work remains owed.

### Follow-up comparisons and exact Focus periods

ADR 386 — Keep Focus comparisons in one retained context below settles exact
periods and the demonstrated correction-family discrepancy. The retained #340
policy at `1ee53b341192b0943c83aae94b47dc6b33c571e3` continues to own comparison
populations, denominators, assessment and chart reuse. ADR 386 adds historical
Focus and durable watch endings under ADR 348; it does not rewrite statistics.
The source-contract handoff in contracts.md names the remaining implementation,
UI Craft and production-verification obligations.

### Production surface and delivery proof

The selected desktop settles the product direction. Its UI Craft build contract,
exact component reuse interfaces and changed-surface verification belong to the
implementing brief. Preserve both setting and habit loops in the first usable
release, including sequential changes and durable history. Extend the existing
Vite production checks to `/v2/` while retaining v1. Mobile, root cutover and
v1 retirement do not block a bounded desktop preview increment.

The safety, architecture, manual-pump, active-watch and accepted-failure rules are
settled inputs. A build is admitted only when its own outcome cannot be
invalidated by a remaining question; no production behavior is inferred from
the design checklist.

## ADR 383 — Select one admitted concern and retain a bounded set-aside choice

### Decision and status

Policy version `383:1`, investigated at
`cfc3e9e36ca3ad17c2318051ab643c34469b26a7`. Independent Standards and Spec
review converged with zero findings on
`a6ea888f8f9d51e4707f85847fc76acdc3c5a1c9`. The coordinator verified the
[tracker result](https://github.com/harmonichq/harmonic/issues/383#issuecomment-5565889507)
and authorized completion of task 2.1. This is a verified investigation result,
not shipped guidance. The replay and its limits are recorded in
[evidence.md](evidence.md#adr-383-policy-replay).

### One selection rule

1. Use the existing backend's active watched change first, with its identity and
   progress. A new concern remains inspectable alongside it and cannot open a
   second change. Guidance neither chooses between competing Trial identities
   nor finishes one. The separate durable-watch decision remains controlling.
2. Build candidates from one coherent backend analysis: the setting analyzers,
   scenario report and Findings projection. A setting action requires its own
   final `asserts_move`; use only those staged members and their existing delivery
   path. Basal, I:C and ISF retain their different predicates. A held or
   direction-only setting cannot borrow another member's permission.
3. A habit action requires its existing surfaced scenario Pattern, its existing
   active Priority admission (`priority >= priority_active_threshold`), a
   behavioral action under the closed Lever recommendation contract, and Focus
   admission. `low_confidence` members and observation-only `meal_bolus_short`
   are investigations. `pinnable_levers()` is only the last admission constraint,
   never clinical support. `wide` remains visible uncertainty; it is not a new
   exclusion, since `assemble` explicitly does not use it to hide a Pattern.
   Behavioral findings without this supported-action contract remain evidence.
4. Remove subjects still set aside under the comparison below. Among remaining
   admitted actions, choose the greatest existing integer Priority. Break an
   exact tie by ascending canonical subject string, using code-point order and
   no localized title. Do not use episode counts, flavor, a queue register or
   display order as an additional preference. Two basal rows do not compete as
   independent copies of the same parameter Priority.
5. If no action remains, choose a guided investigation from evidenced concerns,
   priced before unpriced, descending existing Priority, then the same subject
   tie-break. Read held/thin analyzer results as well as queue rows: the whole-day
   queue deliberately drops held settings. A nonzero observed support count with
   an explicit insufficient/held verdict is inspectable uncertainty, not a new
   support floor. Preserve named held reasons, direction-only verdicts, unknown
   causes and observation-only findings. If none remains, return quiet with
   its reason: no current concern, or all current concerns set aside. Missing
   data stays explicitly unavailable; a failed read is an error, never quiet.

The selected result explains both admission and ordering. It cites the selected
Lever's own impact, recurrence, denominators and held/support verdict, and says
that it leads the **available admitted actions**. It does not call Priority a
predicted benefit, preventable harm, proof of causation or a clinical urgency
scale. An investigation contains no actionable dose/timing recommendation.

### Why this cross-parameter rule

Admission before ordering is the substantive choice. Raw highest Priority would
promote the observation-only meal-bolus-short case (47); `next_in_line` misses
supported habits altogether. Reusing only queue rows also loses the seven-night
basal concern and held I:C evidence. Neither raw order nor the shared tier meets
the product decision.

After admission, existing Priority is the smallest defensible ordering input:
it combines recurrence discounted for uncertainty with the existing
hypo-weighted behavioral impact or tuning insulin currency. It already permits
both flavors on one scale. Choosing the largest such value serves the accepted
objective of consequential recurring problems without inventing a second
clinical weighting scheme. A universal lows-first override would require a new
cross-family severity rule; counting events as a tie-break would compare nights,
meals and lows as if interchangeable. Neither is added. The canonical tie-break
makes no medical claim and remains stable across copy changes.

The mixed replay chose basal (97) over the supported habit (38), and the same
habit over an unstaged seven-night basal estimate. Setting basal aside selected
the habit. These are consistency checks on manufactured inputs, not clinical
calibration of Priority. Its limitations remain visible in the explanation.

### Stable subject and minimum preference

The subject is one tuning variable or one behavioral Lever in this local
wearer's database, independent of action eligibility:

| Concern | Canonical subject | Scope of Set aside |
| --- | --- | --- |
| Basal | `setting:basal_rate` | The basal concern across the day |
| I:C | `setting:carb_ratio` | The carb-ratio concern across its current blocks |
| ISF | `setting:isf` | The correction-factor concern |
| Behavioral Lever | `habit:<lever enum value>` | That Lever and its own populations |
| Uncaused highs | `investigation:uncaused_highs` | The existing uncaused-high concern, with no invented action |

An investigation of a setting or habit keeps that same subject when support
arrives. It does not get a new identity from its disposition. The four problem
shapes remain explanation groupings, never preference keys or pooled support.
An active watched change has its existing identity and is not set aside through
this preference operation.

The deliberate tuning granularity is the variable, not a mutable queue span.
The choice must say, for example, “Set aside the basal concern,” and show its
scope. All relevant hours remain inspectable. This avoids losing a preference
when adjacent slots merge or an I:C block identifier changes. It also means the
choice is broader than one selected chart row; the interface must disclose that
scope rather than silently promising a per-row dismissal. Selecting a variable
never automatically stages all its members or combines unrelated changes.

Persist one upserted row per subject: subject, decision time, optional user reason,
comparison version, and the bounded action/seriousness state set aside. Restore
removes that row and returns the subject to ordinary selection, subject to current
eligibility and active-watch precedence. Viewing evidence does not restore it.
No event archive, analysis copy or per-refresh history is needed.

### Return comparison, version 383:1

Always compare the full subject's current backend state, before any display-clock
filter, with the saved state. A clock-window move, generation, fingerprint,
occurrence identity, title, evidence count or raw Priority change alone cannot
return it. A temporary disappearance, quiet result, weaker support or failed
read does not delete the preference or reset its saved comparison.

* **Setting action:** retain the ordered, canonical pump-entry instructions for
  its staged members: affected clock intervals, direction, units and the
  existing deliverable's recommended values. Merge adjacent identical
  instructions for comparison; exclude current values and mere source block
  IDs. A newly admitted interval, changed direction or changed deliverable value
  on an interval is a changed action. An unrounded estimate change is not.
  Disappearing instructions alone do not return a concern. A narrowed interval
  is compared on its surviving hours, not treated as a new instruction merely
  because a row boundary moved. This uses existing delivery precision, not a new
  numerical materiality threshold. A different actual pump-entry value can
  return even when numerically close; that is the cost of this threshold-free
  definition. Its reason names the hours and old/new instruction.
* **Habit action:** retain its closed semantic action identifier, currently the
  Lever's own recommendation identity, only when admitted. Promotion from an
  investigation to that action returns it. Copy edits do not change the action;
  a future semantic recommendation change must deliberately version its action
  identifier. Low-confidence recommendation strings are not action identifiers.
* **Seriousness:** use existing categorical judgments, never raw count/score
  movement. For settings, a newly asserted recurring-low/harm verdict on an
  affected interval returns the concern even if the instruction is identical.
  Preserve the parameter owner's harm/hold semantics; ordinary caps and support
  changes are not new seriousness. For habits, an increase in the existing
  `Confidence.severity` order (`info`, `low`, `medium`, `high`) returns it.
  Expose that judgment from the owner before serialization rounding; do not
  duplicate its thresholds or classify rounded JSON in production. A decrease
  alone keeps the user's choice. Uncaused highs have no categorical seriousness
  authority here and cannot auto-return on count growth; explicit Restore
  remains available. No new seriousness classifier is introduced for them.

Return is permission to compete again, not guaranteed selection or action.
A seriousness change in a held subject still yields investigation. Explain the
specific changed action or categorical worsening, with its current uncertainty.
The preference remains stored, so repeated reads can retain that explanation;
Set aside again replaces its baseline. Restore clears it. A comparison-version
change alone never restores anything: migrate semantic equivalents or retain the
preference and require explicit Restore where equivalence is unknown.

### Smallest implementation boundary and concrete gaps

Extend the existing findings preparation/projection boundary with one public
backend guidance read that consumes the same analysis/scenario/exposure inputs,
current authoritative active-watch context and stored preferences. Return the
selected canonical subject, disposition, admission/order/return reasons,
source-owned evidence references, alternatives and unavailable context together.
Keep one candidate per tuning variable while retaining each member's separate
verdict and chart identity. Overview and Explore consume this result verbatim.
Existing Plan/Focus writes must recheck their authorities at action time; a
previous guidance read grants no permanent permission.

The build needs these additions; none exists merely because this ADR names it:

* A guidance projection that includes held/thin analyzer evidence omitted from
  the global queue, and enforces the supported-action/observation distinction.
  Existing `prepare_findings_projection` supplies composition, not this policy.
* A bounded preference table and Set aside/Restore writes through the existing
  Store/API owner, with normal cache invalidation. `audit_dismissals.item_id` is
  its primary key and upsert target, while `evidence_fingerprint` scopes the
  legacy dismissal. That behavior cannot represent this preference; do not
  silently migrate a legacy evidence-scoped dismissal into a durable choice.
* Owner-produced semantic action and categorical seriousness fields, including
  canonical delivered setting instructions and habit severity before rounding.
  The replay exercises the existing judgments, but the current serialized
  Pattern does not expose its severity label. This is an exposure requirement,
  not permission to invent a new score or support gate.
* Structured factual/inferred citations separated from recommendation text.
  Current scenario steps can embed treatment advice. Guidance must use explicit
  owner-authored factual fields/templates keyed by the existing closed source
  operation; no punctuation splitting and no arbitrary step-text passthrough.
  A low-confidence source remains readable through its cited observations and
  uncertainty without acquiring advice. Missing structured copy blocks that
  source's production advice presentation, not an excuse to promote raw prose.

These are concrete implementation obligations, not an unresolved selection
policy. Canonical finished-Trial admission and exact historical Focus periods
remain the already named downstream decisions, outside this spike. Reuse #340 at
`1ee53b341192b0943c83aae94b47dc6b33c571e3` for comparisons. Selection never changes
cohort membership, overlap ownership, observation anchors, chart support,
statistical assessments or adherence/outcome separation. No clinical threshold,
classifier, analyzer result or production file changed in this investigation.


## Backend guidance build admission

[#384](https://github.com/harmonichq/harmonic/issues/384) owns task 3.1: the
backend guidance read and bounded Set aside/Restore persistence under ADR 383.
The verified #383 result supplies the selection, admission, identity and return
policy. Its four concrete production gaps are implementation obligations in
this build, not open product questions. The guidance delta remains its acceptance
source; normal ticket triage independently grounds the executable scope.

This capability consumes the existing authoritative active watched change. It
neither defines finished-Trial identity/admission nor records a Plan/Trial/Focus
context or ending. The named durable-context decision will change its upstream
watch authority without changing the admitted selection or preference policy.
It does not claim the complete sequential-change journey. Historical Focus
periods and correction-family follow-up context do not enter this capability's
selection or set-aside comparison; the existing comparison authorities remain
unchanged. No rendered surface is included, so the implementing surface ticket
still owes its UI Craft contract and production evidence.

This is the second child. Keep the remaining decisions named until a recorded
ruling or a precise spike owns them. Do not hand off another child before this
implementation PR is human-merged. The complete setting and habit journeys
remain the first usable release destination.


## ADR 384 — Backend guidance implementation boundary

### Authority and delivery

This implements task 3.1 only. ADR 383 owns selection, subject identity and
comparison policy; the risk contract above remains unchanged. The public
interface added here is a backend read and preference writes. This increment
has no rendered surface and does not complete the first usable v2 release.
The remaining decisions in tasks 2.2–2.4 are not selected by this ticket.

### Public interface

Extend the existing findings preparation boundary with `FindingsProjection.guidance`
for the complete, unfiltered source day. It takes authoritative active-watch
context and stored preferences as explicit inputs and returns one versioned
JSON object. Keep the current `project` queue contract compatible. Internal
policy helpers may live in `ciq_autotune/guidance.py`; that module owns candidate
identity, instruction comparison and selection together, not a second engine.
The API is the I/O owner; the projection neither opens a Store nor calls HTTP.

Add authenticated `GET /api/guidance` for the existing fixed Diagnose source
window. Do not add display-clock or arbitrary analysis-window arguments to this
first read. Return the source window and generation, selected subject (nullable),
disposition, separate admission/order/return explanations, current active watch,
candidates/alternatives with preference state, source-owned evidence references,
and unavailable context. Candidates retain member verdicts, units, source windows,
populations, denominators and chart/episode identities. A stored preference whose
subject is currently absent remains visible for Restore. It has no fabricated
current evidence or action. The response must permit later Overview and Explore
consumers to render it without independently deciding eligibility or rank.

Evidence is a separate structured field from recommendation text. Extend the
scenario owners with factual/inferred fields and a closed semantic action ID;
expose `Confidence.severity` before numeric serialization rounds it. Keep the
existing scenario text and v1 payload meaning compatible. Only owner-authored
facts/templates from closed attribution/narration operations enter guidance
citations; raw Step text, annotations or recommendations are not a fallback.
A source lacking structured copy remains explicitly unavailable for advice
presentation. Investigations carry no treatment instruction anywhere in their
returned presentation, including nested citations and alternatives described as
investigations. Event references may still open the existing evidence views.
No prose parser, new classifier, new threshold or re-scoring is introduced.

Setting instructions use staged member verdicts and the existing accepted-pick
Plan semantics, including basal slot ends, complete I:C block membership and ISF
fan-out. The legacy analyzer consolidated profile is not the accepted-pick Plan.
Expose owner-produced action/seriousness state without deriving staging from
numbers. Guidance comparison canonicalizes those instructions under ADR 383;
it does not implement an alternative editable Plan or reconciliation engine.
Use the existing Plan precision and rounding behavior, including positive half
steps, and verify equivalence against `frontend/plan.js` through its public
functions. Python runtime must not require Node. Keep the comparison's normalized
intervals separate from chart identities and from the member staging records.
Unknown comparison versions retain the preference and explain that Restore is
required. Returned subjects keep the original stored baseline until another
Set aside or Restore, so repeated reads retain the reason.

Add `PUT /api/guidance/preferences/{subject}` with an optional reason and the
last read's generation, and `DELETE /api/guidance/preferences/{subject}` for
Restore. The PUT captures current comparison state on the server; clients cannot
supply an action or seriousness baseline. Reject an unknown subject, an active
watch identity, or a stale generation without writing. A currently absent subject
cannot acquire a new baseline; its existing preference remains restorable.
One preference row per canonical subject stores decision time, optional reason,
comparison version, and bounded action/seriousness JSON. An upsert replaces its
baseline; DELETE is idempotent. Use Store transactions and the existing revision
and cache invalidation conventions. Do not convert audit dismissals or retain
per-refresh histories. Failed writes return errors and leave the previous
preference intact. A repeated successful PUT cannot create duplicate records.

### Coherence and the current watch

Compose the analysis/scenario/exposure sources with the existing generation and
input-revision checks. Preferences and watch state must belong to the same
successful read; a crossing write yields the existing bounded retry/conflict
behavior, never a mixed successful response. Preference writes invalidate cached
guidance, including after process restart. Required new owner fields cannot be
silently absent in an old retained artifact: update its shape/version handling
or rebuild it through the existing artifact owner.

The existing `active_watched_change` resolver may persist Focus preemption.
Call that owner on a writable Store before acquiring a stable read snapshot;
if it changes the revision, invalidate and acquire fresh inputs. Do not call a
mutating resolver inside a query-only artifact computation. Reuse its current
Trial/Focus identity and progress and its existing data-tail clock. Guidance
must not introduce a finished-Trial policy, promote a review-roster Trial, or
reinterpret Focus adherence. No current watch is a valid result; failure to
read its authority is an error, not absence. Missing analysis data remains
explicitly unavailable and cannot be described as quiet.

Existing Plan apply checks draft presence, the one-variable constraint and any
claimed complete I:C block provenance; Focus pin checks its existing Lever
universe, live Trial and unique active Focus. Preserve those checks at write
time. Guidance is a recommendation read, not an action authorization token.
This ticket adds no Plan/Focus action endpoint and does not retrofit clinical
support gates onto v1's manually authored Plan or manually selected Focus.
The later guided-action journey must recheck guidance support before claiming
that its submitted action remains a supported recommendation.

### Implementation and evidence ownership

Use three serial chunks. The first exposes source-owned comparison inputs and
structured evidence, with public producer tests. Its shared contract is the
candidate source data consumed by `FindingsProjection.guidance`: stable identity,
staged member instructions, owner seriousness and separated citations. Record its
concrete field shape in this section before handing off; no new policy decision
is delegated to that handoff.

Chunk 1 publishes the following additive source contract. Analyzer member payloads
(`basal[]`, `isf[]`, and `ic_blocks[]`) carry `guidance`, with `action` either
`null` or `{kind: "setting_instruction", parameter, start_min, end_min, direction,
units, recommended}`; I:C also carries `member_start_mins`. `action` exists only
when that owner's existing `asserts_move` verdict is true. `seriousness` is either
`"recurring_low"` or `null`, independent of whether an action is available. Basal
and I:C expose their existing `harm.nudged` judgment; ISF exposes the existing
`_day_rate_recurs` judgment over its correction-low and correction-rescue channels,
the same parameter-specific authority that produces direction-only weakening. A
single-low gate is not categorical seriousness. Instruction values use existing
accepted-pick Plan precision (basal 0.001 U/h, ISF whole mg/dL/U, I:C 0.1 g/U) with
positive-half rounding. Scenario Patterns carry `guidance.action_id` (the closed
`habit:<lever>` semantic identity, or `null` for observation-only
`meal_bolus_short`), `guidance.seriousness` (the owner's unrounded
`Confidence.severity` category), and `guidance.citation_episode_ids`. An action ID
is a source semantic identity, not an admission verdict; the guidance owner still
applies ADR 383's surfaced, Priority and Focus admission rules.

Every production Scenario Step carries a separate `citation` object shaped as
`{operation, tier, facts}`. `tier` is the source `EvidenceTier`. Attribution
operations are `scenario.attribution.<lever>` and all carry `lever`, `anchor_kind`,
`anchor_at`, `event_refs`, and `window`, plus these operation-specific facts:

| Attribution operation | Additional `facts` fields |
| --- | --- |
| `carb_undercount` | `logged_carbs_g`, `implied_carbs_g`, `baseline_glucose_mgdl`, `peak_glucose_mgdl` |
| `late_bolus` | `pre_bolus_slope_mgdl_min`, `pre_bolus_glucose_mgdl` |
| `meal_over_delivery` | `suspend_start`, `suspend_end`, `suspend_duration_min`, `nadir_glucose_mgdl`, `nadir_at` |
| `over_treated_low` | `nadir_glucose_mgdl`, `rebound_glucose_mgdl`, `logged_carbs_g` |
| `correction_on_iob` | `correction_at`, `iob_at_correction_u`, `pre_correction_slope_mgdl_min`, `glucose_at_correction_mgdl`, `nadir_glucose_mgdl`, `nadir_at`, `minutes_to_low` |
| `correction_stacking` | `stack_at`, `gap_min`, `iob_at_stack_u`, `pre_stack_slope_mgdl_min`, `glucose_at_stack_mgdl`, `nadir_glucose_mgdl`, `nadir_at`, `previous_bolus_seq_num`, `second_bolus_seq_num` |
| `missed_meal` | `rise_slope_mgdl_min`, `digestion_window` |
| `meal_bolus_short` | `rise_slope_mgdl_min`, `meal_at`, `correction_at`, `digestion_window` |

Narration operations are `scenario.narration.peak` with `glucose_mgdl` and
`event_refs`; `scenario.narration.correction` with `count`, `insulin_u`, and
`event_refs`; `scenario.narration.suspend` with `event_refs`;
`scenario.narration.nadir` with `glucose_mgdl` and `event_refs`; and
`scenario.narration.resolution` with `glucose_mgdl` and `resolved`. Nullable facts
remain explicit `null`; timestamps and windows use the existing event-reference
format. A legacy manually constructed Step may serialize `citation: null`, which
makes it unavailable to guidance rather than falling back to its text.

Guidance consumers use these fields, never recommendation or Step prose, to
compare action or cite evidence. The later guidance projection owner must rebuild
or version its retained-artifact boundary before it reads these required fields;
this source chunk does not advance the deferred scenario-fixture envelope.

The second owns guidance selection/comparison and bounded Store/API persistence,
including current-watch composition, cache invalidation and public API tests.
Its shared contract is the public guidance/preference API above. It consumes
only the first chunk's declared public data, not private helper behavior.

The third runs the complete repository gate and corrects regressions exposed by
that run, regenerates affected artifacts through their committed generators,
and records implementation evidence in this parent change. Corrections may touch
the prior chunks' files serially but cannot expand either contract. It owns no new
product behavior. The coordinator retains the aggregate review, parent checklist
and the single implementation PR. All chunks use manufactured inputs only.

### Closed change and documentation inventory

The executable source scope is the existing owners `api.py`, `store.py`,
`result.py`, `analyze.py`, `findings_projection.py`, `derived_artifacts.py`,
`analyzers/basal.py`, `analyzers/ic.py`, `analyzers/isf.py`, and
`analyzers/scenario/{payload,levers,attribute,narrate,engine}.py` beneath
`ciq_autotune/`, plus `ciq_autotune/guidance.py` if needed. Do not change safety,
harm, uncertainty, Priority, cohort membership, comparison statistics or the
watched-change policy. Reuse their existing public judgments.

Tests belong in `tests/test_guidance.py`, `tests/test_guidance_api.py`,
`tests/test_guidance_preferences.py`, the corresponding existing producer/API/Store
and QA tests. Cross-language Plan precision/interval evidence belongs in
`scripts/check_guidance_plan_contract.mjs`, run in the backend job with Python
available. It must not enter the dependency-free frontend test glob.

Documentation changes are limited to this parent change, `CONTEXT.md` for the new
guidance/preference domain terms, and `README.md` for the backend API additions.
Historical ADRs and earlier review receipts remain evidence, not editable policy.
The parent `contracts.md` One next step proposal must point to ADR 383 and this
implementation boundary for this capability; its pending-Plan/draft ordering and
durable-context proposals stay deferred. No UI design record changes are owed.

The fixture inventory is the generator-owned sets and extracts listed in
`.github/workflows/ci.yml`. Regenerate only those whose owned inputs changed,
with their existing provenance and drift commands. New manufactured cases belong
in `scripts/qa_e2e_cases.py` with literal complete expectations and the existing
QA budget checks. Avoid a new committed fixture when an existing recipe can
exercise the public interface in a temporary Store.


## Continuation through the complete desktop release

Connor delegated the remaining epic lifecycle on September 8: triage, start,
review, merge and finalize through completion. The epic coordinator owns those
transitions and merges after the required independent reviews and verification.
Fresh workers retain separate lifecycle sessions and return at mandatory-review
boundaries. This delegation replaces the operator-invoked handoff and manual-merge
stops for this epic; it does not waive evidence or admit implementation against an
unreviewed draft. Mobile, root cutover and v1 retirement remain separate from the
complete desktop preview destination.

[#386](https://github.com/harmonichq/harmonic/issues/386) owns the named durable
context/ending and exact Focus comparison questions in tasks 2.2 and 2.3. They
form one follow-up contract: the recorded start and ending determine which
periods and original context the retained assessment must use. The spike must
settle that contract before a dependent journey build. The selected desktop,
existing chart/statistical authorities and guidance policy remain settled.


## ADR 386 — Retain decision facts and one watch verdict

### Decision and evidence boundary

This is the settled, reviewed implementation contract produced by #386's bounded
investigation. The coordinator independently verified findings commit
`11610c0ae7c8fd3e1753d79d6e340a3977be5274` and its 21/21 replay cases and
documentation guards. Mandatory full Standards/Spec review converged with zero
findings: 18/18 Standards rules hold and 17/17 Spec entries are met. Review used
operator-approved Luna/medium; the Full route remains **UNVALIDATED**.

The coordinator authorized completion of the six selected parent tasks. No
production behavior or build admission follows from the scratch simulation;
next child admission remains coordinator-owned. The original admitted source is
`b9791d9b91e1897d8557c4f037538f9e82b8edd5`; evidence.md retains the historical
review-ready receipt and records verified completion separately.

Use record version `386:1` for the bounded context and ending envelopes specified
in contracts.md. Retain the existing applied Plan key (`applied_at`), stored
Focus id and derived Verify Trial id. The current Plan API exposes `applied_at`
and items; it does not expose SQLite's incidental rowid. Do not introduce a new
identity based on a display label or a current evidence fingerprint.

Record a Plan decision only at apply, a Focus decision only at pin, and a Trial's
first-observed context only when it is first reconciled into the durable watch
records. Capture the selected action, explanation, support/unknowns, source
window and generation, units and source identities. Keep detected change time,
first observation time, and applied Plan intent distinct. A Trial observed
without a Plan has no original user-decision snapshot. A later eligible Plan
match may add a relationship; it cannot rewrite that first observation.

A Plan relationship requires one uniquely reconciled applied deliverable and a
real observed transition to that deliverable. Retain the schedule comparison's
union of boundaries and pump precision, plus captured I:C block provenance.
A time-near apply, `deliberate`, matching parameter, or draft equality alone is
insufficient. Preserve the matched Plan key and observed snapshot/change identity
as the reconciliation receipt. Several indistinguishable applies leave the
relationship unavailable with an ambiguity reason; do not pick the latest.
This is a public backend reconciliation responsibility. Share the existing
schedule semantics with `frontend/plan.js` through parity verification rather
than trusting a browser-supplied `confirmed` flag.

### Canonical candidates and admission

The backend watch owner reuses the existing regime/switch detection,
corroboration, reversion suppression, profile coalescing and captured-block
matching. The existing Verify `_review_id` remains the canonical identity,
including the captured block end. Active selection, Verify summaries/detail,
guidance and the Focus pin guard consume one verdict from this owner. They no
longer derive admission separately. Maturity remains the existing target-data
14-day bounded rule; comparison support is a different fact.

Select the newest detected change before considering finished records. Do not
use Verify's maturity-first display ordering or its three-row presentation cap
for active admission. Persist the newest admitted change's identity and detected
time as the admission frontier, including after its ending. A terminal latest
candidate yields no active Trial; do not fall through to an older candidate.
A candidate disappearing from a refreshed roster does not erase that frontier
or its retained record. Newly discovered older history remains history.

A genuinely later detected change advances the frontier and can open a new Trial.
Existing switch corroboration prevents a late dose observation of the same
change from doing so. Existing profile grouping is applied first; if distinct
canonical candidates remain at one instant, use canonical-id ascending as the
stable tie-break for the one watch, and retain the others as historical members
with an explicit not-selected-for-watch disposition. Never promote those peers
when that watch ends. This selects a watch, not a clinical priority or a new
pump-change classifier. Captured block-I:C candidates already admitted by Verify
join this same active verdict, deliberately closing the singleton's #518 fallback
only for its already-proven captured groups. Uncorroborated block edits retain
the existing exclusion; do not reconstruct a block from today's profile.

Return active kind/id, admission reason, Trial maturity, `can_finish_trial`,
Focus pin availability and its reason, and the retained ending together. Pending
applied Plan intent also withholds a new Focus pin until reconciliation or
explicit withdrawal, as specified in contracts.md; a draft alone does not.
A new live Trial supersedes the previous watch and preempts an active Focus;
reading an older subject cannot select it as the watch. A mature but unfinished
Trial still occupies the slot. Finishing releases it without implying benefit.

### Endings, retries and historical reads

Trial endings are `user_finished`, `reverted`, `superseded`, and
`expired_unreviewed`. User finish requires the current backend maturity verdict;
record its conclusion without operating the pump. Revert-to-Plan remains a
manual-entry route, not an observed reversal. Reversal requires the detector's
actual reversal evidence. Supersession records the new detected change, and
expiry uses the existing 28-day watch horizon. An ended watch does not terminate
#340's separate setting comparison period while that setting remains in force.
Its saved ending assessment stays fixed; a later read is labeled reassessment.

Focus endings distinguish `manual`, `trial_preempted` and
`lever_unavailable` (the existing invalidated-taxonomy drop). A manual ending
has no maturity gate. Automatic endings contain no user conclusion. A preempted
Focus is dropped, not paused; another attempt receives a newly pinned id.

Every ending has both effective time and recorded time. For a manual ending they
are the request's server time; for an observed reversal/supersession/preemption,
effective time is the detected event time and recorded time is reconciliation
time. Expiry's effective time is the watch horizon, not the day it was noticed.
Unavailable event timing remains unavailable. Never infer an old ending time
from a status or stamp migration time as an earlier historical fact.

The first ending wins. A repeat finish/resolve returns the stored ending, even
if the retry supplies another conclusion or later clock. It does not append a
second ending, update the original assessment, reopen a Trial, or revive a Focus.
An attempted first finish of an immature/nonactive Trial is rejected; an unknown
identity is not found. Reconcile pending detected changes and check the write
against the same input revision inside the bounded write transaction; a race
must yield the winning recorded ending or an explicit stale/conflict response.
No offline queue or recovery subsystem is needed. Every durable write bumps the
result cache after commit; a failed transaction publishes neither ending nor
released watch.

Use Store-owned persistence through authenticated public operations. Reconcile
observed lifecycle changes after ingested data changes and before accepting a
watch mutation. Read-only history and selected evidence never call
`active_watched_change`, insert snapshots, update a frontier or drop a Focus.
A read with pending reconciliation may show unavailable/stale current admission;
it cannot present conflicting permission or infer a quiet state. Retained history
remains readable. The implementing ticket must wire reconciliation and cache
invalidation for both the ingestion path and ordinary action retries.

Legacy Plan/Focus facts that exist remain readable. Unstored context, ending
time, user conclusion, or original assessment are explicit unavailable fields.
A derived legacy Trial may acquire a first-observed record now, clearly labeled
as such, but no earlier decision or ending. On first migration/reconciliation,
seed the frontier from the newest eligible existing detected candidate and retain
older records as history; do not auto-finish or date them. Missing historical
facts cannot be repaired by silently rerunning today's model.

## ADR 386 — Keep Focus comparisons in one retained context

### Exact periods and inference context

Retain #340's half-open periods: Before starts at the later of available history
or 90 elapsed days before pinning and ends at pin; After starts at pin and ends
at the recorded effective ending, or the selected data tail for an active Focus.
Return full pump-local timestamps and boundary reasons, not date-only tile
labels. A terminal record lacking an effective ending cannot serve an exact
historical comparison. If a late-observed preempting change predates pin, report
After unavailable (`change_predates_pin`), not a negative or fabricated interval.
A zero-length period has zero opportunities and remains unknown. With no
pre-pin data, Before is empty and unavailable; do not reverse its boundaries.
An active Focus whose data tail precedes pin has no After observations and an
explicit data-not-yet-arrived reason.

Ownership follows the existing opportunity/event anchor. Clip plotted and
measured observations to the owned period. Context needed by existing detectors
may be loaded with their existing padding, but it does not become an observation
in either arm. All charts and scalar outcomes receive the same selected period
pair and source revision. Never tile rolling percentages or relabel a current
14-day trend as “since starting”. Preserve false-low correction, response-time
eligibility for rescue answers, and observation-aware rescue context from the
existing producers. Saved snapshots remain what was known then; recomputation
with subsequent corrections is a separately labeled reassessment.

At pin, retain the programmed-profile ISF selected by the existing trend owner
(the active schedule median), its source snapshot and units, source code/policy
revision, and the detector configuration identity. Freeze that one value across
both comparison arms and later follow-up. Keep each meal's historical dose-stamped
I:C, never replace it with a current profile ratio. Missing inputs remain
unavailable under existing detector semantics. No new clinical default or
classification threshold is introduced.

This preserves the fixed-ISF rationale recorded in `outcomes_trend.py` for #131:
window-specific analyzer estimates must not manufacture a behavioral trend.
The initial Diagnosis snapshot remains under its original analyzer/settings
context. The initial Focus comparison recomputes both arms under the retained
follow-up context and names that context. On the committed correction-on-active-
insulin recipe, unchanged records produce 2/5 under effective ISF 0 and 0/5 under
programmed ISF 40. Show that as a different inference context, never an adherence
improvement or an outcome result. Do not alter Diagnosis's clinical eligibility.
A later profile change cannot silently change the retained comparison value.

Adherence uses the existing lever's numerator and named opportunity denominator;
zero opportunities returns an unavailable rate, distinct from zero unwanted
behavior over a positive denominator. Retain the correction-stacking behavior
and harm numerators separately. Outcomes and their denominators remain distinct
from adherence, under #340's existing mapped outcomes and assessment rules.
Do not call a change causal, treat descriptive spread as confidence, or grant a
favorable assessment from maturity alone. This spike selects no statistical
constant and implements no assessment method.

### Delivery boundary

The record and selected-detail fields are specified in contracts.md. The source
replay proves current behavior and the bounded proposed rules, not persistence,
race recovery, clinical validity, production period serving, or rendered fidelity.
The implementing ticket must close those named verification obligations under
full review before admission of the complete desktop release. Keep the selected
Changes placement, both loops and exact Day return. No new chart design, mobile,
root cutover or v1 retirement belongs to this ruling.


### Fourth-child capability boundary after #386

The [verified #386 result](https://github.com/harmonichq/harmonic/issues/386#issuecomment-5579342873)
settles the durable context, ending and exact Focus comparison questions. Its
qualified independent review and replay are recorded above. #384's completed
implementation/finalization evidence is recorded in evidence.md; its backend
guidance and preference capability is already merged.

A fourth child is justified by a concrete dependency: the complete desktop
journeys require durable, authenticated setting and habit follow-up APIs with
one watch verdict and read-only history. This is independently verifiable and
shippable backend behavior, while the subsequent rendered release depends on
those records, periods and assessments. Consolidating it with the entire new
surface would combine two different delivery contracts: persistence, reconciliation
and comparison proven through backend public interfaces, and visual/interaction
fidelity proven through the rendered application. The backend must supply the
records and assessments before those complete surface stories can be verified.

The backend child [#387](https://github.com/harmonichq/harmonic/issues/387) owns
tasks 3.2.1 and 3.3.1 together. Ending persistence and the
available exact-period assessment belong to one capability so a finish can save
what was actually known at its boundary. Explicitly unavailable data remains a
valid state; making every assessment unavailable is not completion. Triage must
size bounded executable chunks with explicit ownership and an integration owner.
It must preserve ADR 386 and the retained #340 statistical authority.

### #387 production risk contract

**Must prevent:** an invented legacy or original-context fact; a duplicate,
reopened or cross-subject ending; an ambiguous Plan link treated as actual; a
history read changing an active watch; a stale cache or pre-ingestion verdict
authorizing a write; and an assessment presented outside its retained period,
denominator or inference context.

**Must recover:** retry of a completed lifecycle write returns its one recorded
result; a stale or racing request returns the winning result or an explicit
conflict; and a failed transaction commits no ending, frontier advance or partial
assessment.

**Accepted failure:** missing retained evidence, legacy facts, an unavailable old
policy version, or a period with no opportunities produces an explicit unavailable
assessment that preserves the record. A separately labeled later reassessment may
be unavailable too; it never replaces the original snapshot.

**Unsupported:** live vendor pulls, patient data, credentials, new clinical or
statistical policy, a historical executable archive, UI rendering, and recovery
beyond the bounded retry/conflict response.

**Evidence owed:** synthetic public-interface proof of additive migration/restart,
authentication, v1 compatibility, unique schedule reconciliation and withdrawal,
stale/duplicate/racing lifecycle writes, cache and ingestion reconciliation,
read-only history, exact half-open periods and anchor membership, named
denominators, retained original-versus-reassessment context, and at least one
available exact-period assessment. New committed synthetic artifacts require an
owned generator and drift check; use none where existing generated fixtures already
exercise the public boundary.

Why: durable records and assessments influence advisory insulin-dosing guidance,
so the backend must preserve meaning across retry, restart and later data without
inventing a clinical conclusion. Disposition: inline in this active parent change.

The rendered setting/habit release remains tasks 2.4, 3.2.2, 3.3.2, 3.4 and 3.5.
Its applicable UI Craft contract must be settled before its build admission; it
consumes the selected prototype and completed repair records, with no new concept
round. This capability split does not admit that surface build yet, divide work
by component, or weaken either complete first-release journey. Before any later
child is filed, record its own dependency or independently shippable boundary.


## ADR 387 — Preserve classification context before comparison ownership

The comparison build found a missing provider boundary, not a Store defect. The
existing `scenario.engine.tally_attributions` runs the anchor/segment/split/attribute
walk but exposes only aggregate counts. A synthetic high retained the same
in-period opportunity while clipping away its preceding meal changed its
missed-meal attribution. `assemble` supplies narration, and the opportunity
provider supplies denominator anchors; neither supplies the complete attributed
recurrence/driver association needed by this comparison consumer.

Expose the shared attributed-occurrence read specified in contracts.md under
“Attributed occurrences for exact-period comparison”, then filter owned anchors
without removing classification context. Keep the walk and association in the
existing scenario provider, with legacy tally aggregation as its other caller.
This concentrates existing computation rather than introducing another classifier
walk or a shallow comparison wrapper. The implementation/export/test owners are
`ciq_autotune/analyzers/scenario/engine.py`, its package `__init__.py`, and
`tests/test_scenario_engine.py`, all assigned to comparison chunk2. Existing
outcome/trial provider paths remain owned there.

The completed Store chunk and its private storage contract remain unchanged.
Retain three serial chunks, setting and Focus acceptance, and the full delivery
gates. The refinement changes no clinical/statistical policy, recurrence meaning,
source-context policy or public lifecycle API. Its executable proof and the new
public-interface test obligations are recorded in the contract; implementation
and independent review remain required before this comparison boundary is done.

## ADR 387 — Keep comparison readiness specific to the change

The operator clarified FOLLOW-UP READINESS ONLY for Trials AND Focus. I:C remains
fixed at eight effective qualifying closed meal runs per captured block and exact
arm. Basal uses fourteen clean nights per affected slot; ISF thirty distinct
qualifying fasting Rest windows in the affected hours; whole-profile changes
thirty elapsed days with thirty coverage-qualified dates; Focus fourteen elapsed
days with its own available measured recurrence population. These are pragmatic,
conservative observation rules, not clinically validated thresholds. Exact units,
source ownership and gating behavior live in contracts.md, “Type-specific
comparison readiness”. No generic bootstrap sample count substitutes for them.

Existing producers supply actual clean samples, eligible closed-run ownership,
fasting steps/window identities and coverage-qualified dates. A bounded replay also exposed comparison membership treating a canonical
midnight-wrapping I:C block as an empty linear span. The existing circular block
semantics must govern both period selection and owned meals; this correction stays
in the comparison owner's existing paths. Local immutable
history informs availability and highlights incomparable or unreadable periods;
it cannot establish benefit or population-wide reliability. Recommendation and
classifier eligibility, safety predicates and the #340 inference methods remain
unchanged. The type-specific readiness predicate replaces the old generic fourteen-date
support gate; the bootstrap, coverage, polarity, two-date estimability minimum and
interval limitations remain unchanged. Values and progress remain visible. An ending can be inconclusive and is never
triggered by a favorable result or by reaching fourteen days.

## ADR 387 — Preserve unreadable negatives with proportionate verification

The operator cancelled the proposed preregistered Monte Carlo study, independent
training/evaluation split, false-positive/power assurance and CPU-hour admission
machinery. That work is historical and superseded, not completed or failed, and
must not block delivery. A handful of public synthetic placebo, known-signal and
missingness checks and exact-period no-change history replays are the appropriate
verification here. Report descriptive findings and limitations without promising
clinical or repeated-look validity. No research framework enters the product.

The positive shortfall classifier owns a bounded possible HIGH-onset domain for a
completed meal; maximal HIGH runs and episode attribution have no fixed closure.
The observation contract retains readable no-high negatives and observed-only,
unavailable judgment for unresolved high-associated cases. Known positives stay
known. Correction behavior and harm availability stay separate; record-proven
exclusions imply zero corresponding harm, while missing provenance or an unreadable
harm tail is not observed zero. Correction-on-IOB's existing inference is preserved.

Shared observation reads remain with the scenario and existing correction-counter
owners, factoring their decision facts once instead of copying classification or
provenance logic into comparison. contracts.md specifies the interfaces and source
partition. The completed Store task and three serial chunks remain intact. Normal
independent plan review of this amendment and its successor lock precedes production
admission; no further readiness study or design round is a prerequisite. Private
history, prior study material and instrumentation stay out of tracked artifacts.


## ADR 387 — Include existing verification maintenance in final integration

Full integration exposed test doubles that lack the admitted Store frontier read,
synthetic Focus setup that relied on read-time reconciliation, and generated captures
that predate additive lifecycle fields/schema. These are execution-inventory defects,
not new product requirements. The closed path list and semantic restrictions live in
contracts.md “Existing verification maintenance”. The final integration owner takes
the existing outcomes-trend and block-I:C test files for compatibility setup and
additive response assertions, and refreshes only the
named existing derived artifacts with their existing generators. Completed Store and
comparison tasks and all accepted comparison decisions remain intact. No production
comparison edit, UI work, new fixture family or weaker delivery gate is admitted.


## ADR 348 — Freeze the desktop lock and admit one integrated UI child

The selected desktop direction now has a formal UI Craft contract:
`mockups/harmonic-v2-desktop.lock.md`, with the ★ LOCKED narrative header in
`mockups/harmonic-v2-glucose.html` and its primary companion module. The route
is `lock` rather than `revise` because `/v2/` has no shipped embodiment; the
predecessor inventory ran anyway, because this surface takes over jobs the
shipped Cockpit shell and Finding → evidence routing surfaces perform today.
Both v1 surfaces stay served and registered, and their ledgers are unedited.
The manifest carries thirty-four terms `HV2-01`–`HV2-34`, the complete
predecessor disposition for the cockpit, finding/evidence, Diagnose-registry and
executable lists, and every retirement's existing operator sanction. No sanction
originates in the manifest, and no historical ledger was rewritten: the two
stories sharing the reused `P55` identifier are cited by ledger path plus story
title, boundary-crossing draw kept and the global Align Tab stop retired under
its own ruling.

Precedence is explicit, because three authorities answer three different
questions. The selected prototype and the adopted repair records govern `/v2/`
arrangement, hierarchy, destination behavior, acknowledgment and return. The
shipped app's token layer, role-based chrome, sibling geometry and production
chart renderers govern component material. Backend responses govern identity,
eligibility, readiness, admission, permissions, evidence populations, periods,
comparison results, persistence and endings. Where the prototype fed an
arrangement from page memory, the build keeps the arrangement and binds it to
the serialized field: watch maturity copy stays lifecycle metadata and supplies
no evidence readiness, which comes from the selected record's retained
comparison. The backend bindings verified at `3686b417` are unchanged at the
final CI candidate, and no backend capability is owed.

**Why a fifth native child rather than a component or view backlog.** The
delivery sequence caps ordinary splits at three and requires a written
dependency or independently-shippable-capability justification beyond that. This
child clears both. Its dependency is real and now satisfied: a complete
Python-served desktop composition cannot be accepted before the merged guidance
capability (#384) and the merged durable follow-up APIs (#387) exist, because
its acceptance turns on rendering served admission, permissions, readiness,
endings and history rather than on page memory. Its capability is
independently shippable: `/v2/` served by the packaged Python runtime with v1
still available, completing the priority → setting or habit change → follow-up →
saved conclusion loop behind a preview route. Both loops stay in one child
because they share one desk, one navigation contract, one active-change seat and
one history surface; splitting them would produce two halves neither of which
completes the first-release milestone, and a per-chart or per-view backlog would
fragment exactly the composition the lock exists to hold.

Sequencing is the lock's own rule and is not negotiable by the build: the `★
FROZEN` v2 behavior ledger and its fail-closed replay are written **before** any
production UI implementation, following `behavior-sweep`. The complete synthetic
acceptance fixture matrix, the verbatim-first port, the paired prototype and
built-app fidelity evidence at both target viewports, the one-row-per-term
fidelity ledger, and human acceptance of the complete first usable release
follow in their existing stages under tasks 3.4 and 3.5. Task 2.4 stays open
until that ledger and replay exist; this decision formalizes the contract, not
its verification.

This admits no mobile design or acceptance, no root-route cutover and no v1
retirement; those remain tasks 4.1–4.3. It opens no new concept, navigation or
naming round. `/v2/` names its destination `Explore` under *ADR 348 — Adopt the
reviewed desktop direction*, and v1's `Diagnose` is not renamed — the open
question in `predecessor.md` was about renaming the shipped surface, which this
work does not do. Watch fourteen-day maturity and twenty-eight-day expiry remain
accepted lifecycle metadata and are not reopened. This is a formal design
contract; it is not fidelity evidence, built-app acceptance or release approval,
and it authorizes no production edit on its own.

## September 8 direction change — outcome shapes and three destinations

The grounded September 8 interview, recorded in
`docs/scope/what-harmonic-is-for.md`, showed that the existing individual-lever
headline obscures the recurring outcomes the wearer needs to act on. Its settled
ledger path opened child epic #390 to reshape the first release around outcome
shapes and three destinations. This planning change does not reopen v2's loop,
backend authorities or data boundary.

### Decisions already made

- Diagnose leads with outcome shapes: highs after meals, lows after meals, highs
  after treating lows, lows after correcting highs, and overnight lows with no
  insulin on board. A shape owns its habit levers and setting findings as
  evidence, carries one rate on one denominator and one chart, and is the unit
  the app prices, leads with, sets aside and follows as a Focus; levers become
  the drill beneath it. This develops the four connected problem shapes framed
  in ADR 348 — Guidance leads, findings explain.
- Habits lead; a strongly supported setting change takes priority when it
  asserts, preserving ADR 383's existing admission inputs pending #390's shape
  selection policy.
- Focus confirmation gates on observed opportunities rather than fourteen
  elapsed days, amending `HV2-24` and ADR 387 — Keep comparison readiness
  specific to the change; the count is backend policy.
- A near-tie between a staged setting and a supported habit goes to the setting,
  amending ADR 383 step 4: #390 task 2.5.2 records its Wilson-recurrence-
  interval-overlap band from the snapshot pass; outside that band greatest
  Priority leads and an exact tie retains canonical-subject order.
- One active watch stays for the first release, retaining ADR 348 — Reviewing
  can finish a Trial and its active-change constraint.
- v2 ships three destinations: Diagnose, Changes and Day. Overview and Explore
  collapse into Diagnose carrying the shipped v1 rail as-is, amending `HV2-09`,
  `HV2-10`, `HV2-11` and ADR 348's navigation.
- Notifications and the endo 90-day snapshot come after the first release; no
  food diary, site-age finding or same-meal trials enters v2, retaining the
  settled product scope.
- v1 retires after Connor accepts v2, retaining task 4.3's acceptance boundary.
- #389 stays stopped: chunk c1 (desk, Day and utilities) integrates once #391
  is admitted; c2 (Overview/Explore/Plan) and c3's Focus-subject part wait for
  #390 steps 2 and 4.
- #342's eating-sequence levers are a child of #390, members of highs after
  meals, and sequence after #391.
- #390 sequences #391's shape-unit spike, backend build, design child, Diagnose
  collapse, then #389's resumption.

### Named open questions

All seven questions cleared on 2026-09-08 by the numbered ADR 391 records below.

- ~~Shape membership: which existing findings belong to each shape~~ — ADR 391 — Membership roster and evidence boundaries
- ~~One rate and denominator per shape~~ — ADR 391 — Rate and denominator ownership
- ~~The shape impact-summary rule~~ — ADR 391 — Impact, admission and the staged-setting near-tie
- ~~The collapse rule for a one-member shape~~ — ADR 391 — Collapse and rail behavior
- ~~Shape as selection, set-aside and Focus subject~~ — ADR 391 — Pattern subject and persistence migration
- ~~Focus readiness on observed opportunities~~ — ADR 391 — Focus readiness is opportunity-gated
- ~~The near-tie ruling~~ — ADR 391 — Impact, admission and the staged-setting near-tie

## ADR 391 — Name the unit and preserve the existing payload family

**Decision.** The new outcome-shaped advisory-selection unit is a **pattern**:
one named outcome, its backend-owned members, one rate on one denominator, one
admission verdict, and one selection/Focus subject. This supersedes the
September 8 direction's use of *shape* on 2026-09-08. Old terminology maps as
follows: a former behavioral **Pattern** (episodes grouped by one Lever) is a
**lever pattern**, while the new bare **pattern** is the cross-member outcome
unit.

`pattern` remains bare only for this new unit. The timeline analyzer becomes an
*actionable-behavior analyzer* (not an analyzer of a pattern); Scenario's retired
Patterns view becomes the *retired Scenario view*; lever grouping is always
*lever pattern*; the outcome summary is the positive counterpart to deficit
Findings and patterns; and a Clean rate is not described as a pattern's
complement. A Localized outcome card is not a pattern card. The former **Pattern
sweep** becomes the **candidate sweep**; its cell keeps the glossary's unchanged
**Tracked candidate** name, and its avoided term is *candidate engine*, not the new
unit's name. In the basal glossary entry, *recurring basal motif* replaces the
former avoided *basal pattern* synonym for a basal schedule. These dispositions cover each pre-existing
case-insensitive `pattern` sense in `CONTEXT.md` at lines 37, 275, 356, 386,
522, 536, 538, 548, 571, 583, and 593; no `_Avoid_` line forbids bare
`pattern`.

**Compatibility inventory.** The whole-tree inventory (`rg -n --ignore-case
'\bpatterns?\b' --glob '!node_modules/**' --glob '!dist/**' .`) returns 523
matches over tracked files at the pinned commit a9562db8 (`git grep -i -P` over the
same pattern and exclusions; this change's own prose and receipt add to the
count at its head, and #390 task 2.5.2 re-runs the inventory at its own base) and finds the
`patterns` key family in scenario production and API consumers, guidance,
findings projection and case files; its fixture-only JS mirror
`mockups/findings-projection.mirror.mjs`; generators and synthetic payloads;
browser gates; fixtures; and their Python and frontend tests. Those are the
existing serialized **lever-pattern** family, including `patterns` and
`low_confidence`, not the new unit. #390 task 2.5.2 owns every code, fixture,
mirror, generator, browser-gate and test rename/migration, and must retain the
mirror parity contract under ADR 735. `ciq_autotune/pattern_sweep.py` keeps its
internal module name while its public term becomes candidate sweep, so it is not
unowned by this disposition. This ADR changes no payload.

## ADR 391 — Membership roster and evidence boundaries

**Decision.** The first release has five patterns. Each member remains owned by
its current producer; membership composes source verdicts and never pools their
support populations.

| Pattern | Present members and owner | Exposure / recurrence noun / identity | Counting and source window |
| --- | --- | --- | --- |
| Highs after meals | `carb_undercount`, `late_bolus` lever findings from `analyzers.scenario`; I:C setting finding from `analyzers.ic`; `uncaused_highs` is investigation evidence only | meals / meals / episode identity for the levers; I:C block identity; uncaused highs is a count of high opportunities with no attribution, not a member recurrence | one attributed episode per lever occurrence; I:C's published block recurrence; uncaused-highs numerator is unexplained high opportunities and its denominator is all high opportunities in the findings window |
| Lows after meals | `meal_over_delivery` lever finding from `analyzers.scenario`; I:C setting harm from `harm.py`/`analyzers.ic` | meals / meals / meal-over-delivery episode identity; I:C harm low identity | one meal-attributed low episode; each member keeps its source window |
| Highs after treating lows | `over_treated_low` lever finding from `analyzers.scenario` | lows / lows / low-episode identity | one low-driven rebound episode in the scenario window |
| Lows after correcting highs | `correction_stacking`, `correction_on_iob` lever findings from `analyzers.scenario`; ISF setting harm from `harm.py`/`analyzers.isf` | correction clusters / correction clusters / correction-pair identity; lows / lows / low identity for correction-on-IOB and ISF harm | correction stacking counts one adjacent correction pair; correction-on-IOB and ISF may share a low, and that overlap is intentional across separate members |
| Overnight lows with no insulin on board | basal setting harm from `harm.py`/`analyzers.basal` | basal harm-band source nights / named night key | one printed fasting basal low per source night in the basal source window; it has zero habit members |

The two meal patterns are disjoint by outcome membership, even though their
separate members may begin at the same meal. Lows after meals owns
`meal_over_delivery`, whose outcome kind is low; highs after treating lows owns
`over_treated_low`, whose outcome kind is high. Each may also cite I:C harm
without turning shared low evidence into duplicate support.
Correction-factor setting harm may share lows with `correction_on_iob`; the
backend reports that overlap rather than de-duplicating it into false support.
`PreemptedLows` remains a count-only context signal and never becomes a member.
#342 eating-sequence findings are deferred and will join highs after meals only
through their own child decision.

## ADR 391 — Rate and denominator ownership

**Decision.** Every pattern publishes exactly one backend-produced rate and
denominator. It chooses one authority per pattern: `exposure_counts` from
`tally_attributions`/`build_opportunities` for an outcome family, or a named
member recurrence population where the pattern's outcome cannot be represented
by that family. A member's confidence still reads its own evidence population;
members never pool into pattern support.

Highs after meals uses the ordinary `MEALS` recurrence population for both
numerator and denominator: carb-tagged meal opportunities, identified by the
meal episode identity. Its numerator is only attributed `carb_undercount` and
`late_bolus` meal episodes in that same population, counted as distinct meal
identities (attribution gives an episode exactly one lever, `attribute.py`, and the
receipt unions member identities rather than summing member counts), so numerator is
a subset of denominator and the rate cannot exceed 1.0. `meal_bolus_short` keeps its separate
completed-carb-bolus population (Completed, insulin above zero, carbs at least
the anchor minimum); it is not a member of this first-release pattern and does
not change its denominator. Lows after meals uses the distinct carb-tagged-meal
population with a completed low-outcome window and `meal_over_delivery` identity;
it does not borrow `compute_clean_rates`' single `MEALS` rate.
Highs after treating lows uses `LOWS` opportunity exposure counts. Lows after
correcting highs uses `CORRECTION_CLUSTERS` counts for correction stacking; its
other members retain their own low recurrence populations, so the published
pattern rate must select and name the correction-outcome denominator rather than
sum those populations. The meal-bolus-short lever remains outside these first
five patterns and retains its completed-carb-bolus population.

Overnight lows with no insulin on board uses **harm-band source nights**: nights
with at least one CGM reading in the 00:00–06:00 basal band (a printed low is
itself such a reading, so every numerator night qualifies) whose reconstructed
bolus IOB at the band minimum is at or below the harm floor (0.1 U). #390 task
2.5.2 produces and publishes that count as `harm_band_source_nights` beside the
harm result. Its numerator is `BasalHarm.nights` — “distinct nights with a basal
low anywhere in the band” — restricted to printed fasting lows. A numerator
night is necessarily a source night: the fixed predicate uses the band minimum,
which is no greater than the IOB at the low's nadir, and that nadir is at or below
the same 0.1-U floor. The denominator is this source-night population, never
`BasalHarm.nights` itself. This supplies the named producer required by the
existing one-rate rule; no amendment to it is needed. Recurrence nouns and
windows therefore remain explicit: meals (scenario window), completed carb-bolus
meals (meal-bolus-short only), lows (scenario window), correction clusters
(scenario window), and harm-band source nights (basal source window).

## ADR 391 — Impact, admission and the staged-setting near-tie

**Decision.** A behavioral member's `Confidence.effect` and a setting member's
insulin-per-day `_impact_factor` are different currencies. They SHALL NOT be
added, averaged, or otherwise weighted together without a future explicit
conversion. Pattern pricing uses the existing owner-produced Priority only after
the chosen member has passed its own admission: a pinnable habit passes its
threshold admission; a setting passes its analyzer staging verdict. The pattern
returns that price, admission and source reasons rather than inventing a new
clinical score.

The alternatives were a fixed numeric band or habits leading whenever their
Priority is higher. A fixed band would be a new ungrounded threshold; habits-first
would discard the safety preference for an available staged setting. Therefore
#390 task 2.5.2 chooses the contention band from the snapshot pass's recorded
candidate values, using overlap of the two candidates' own existing Wilson
recurrence intervals — a habit's `Confidence` bounds and a setting's owner recurrence
channel bounds in `tuning_priority`, never a pattern-level rate interval — rather
than a bare number, and records its exact rule with the replay. This **amends ADR
383 step 4**: inside that derived band an admitted staged setting leads a
higher-priced supported habit; outside it the greatest existing Priority leads;
an exact Priority tie retains ADR 383's canonical-subject order. It preserves
threshold admission only for pinnable habits and staging admission only for
settings; an unstaged setting cannot suppress a supported habit.

## ADR 391 — Collapse and rail behavior

**Decision.** Collapse is decided from the backend member roster: a pattern with
one admitted member and no setting member collapses to that member; a pattern
with a setting member remains a pattern even if only one member currently
asserts; the overnight pattern remains a pattern despite its zero habit members.
The backend returns the collapse verdict. A collapsed single-member pattern uses
the member's existing rail row and Focus behavior; a non-collapsed pattern uses
one pattern rail row and one pattern Focus. The surface never infers collapse
from a client-side count.

## ADR 391 — Pattern subject and persistence migration

**Decision.** The canonical new subject is `pattern:<pattern-key>`, where
`<pattern-key>` is the closed outcome key. Future `guidance_preferences`, active
Focus records currently keyed to a Lever, and `is_pinnable` resolve against this
subject; #390 task 2.5.2 owns their migration. A return comparison for a
multi-member pattern compares the canonical recommended pattern action and its
backend categorical seriousness, including member-set changes, rather than an
arbitrary member priority or a raw count.

## ADR 391 — Focus readiness is opportunity-gated

**Decision.** Focus readiness is backend-owned and measured in opportunities,
not elapsed days and not `behavior_observations`. For each outcome exposure, its
unit is `exposure_counts` and the corresponding `BehaviorPoint.exposure_n`:
meals, lows, correction clusters, highs, or the new harm-band-source-night population.
No number is settled here. #390 task 2.5.2 chooses the numeric gate against this
ticket's snapshot of each pattern's `n` at 30 and 90 days for the four
exposure-denominated patterns, and for overnight lows with no insulin on board
against the `harm_band_source_nights` count it produces itself (this ticket's
overnight `n` is the basal recurrence-window stand-in), then enforces it in
the backend. This amends ADR 387's Focus arm from elapsed-time readiness to
opportunity readiness; it changes neither member floors nor classifiers.

## ADR 391 — Handoff to the build and shipped rail

**Decision.** #390 step 2 implements and tests the roster in the scenario report,
findings projection, and `guidance.candidates`; pattern Focus pinning and
readiness; QA replay; impact/collapse cases; and the whole-tree inventory plus
ADR-735 fixture-only mirror contract. It also makes the `HV2-24` lock-file
amendment. #390 step 3 supplies one per-pattern chart and one shipped-rail row
through the public findings projection and guidance interfaces.

Must prevent: membership, rate, and admission verdict arrive from the backend;
the surface renders them and derives none. In particular, the shipped
`frontend/index.html:4715` client-side re-ranking of `patterns` against a local
count is the defect class this unit forbids.

### Why a sixth native child under #348

The delivery sequence requires a written dependency or independently shippable
capability justification beyond three children. #390 is a planning container for
a scope change that #389, the admitted integrated UI child, is stopped on; it
cannot consolidate into #389 without unfreezing a build on unsettled policy. It
is independently shippable as backend policy plus a Diagnose revision before
#389 resumes. #390's own children — #391, #342, and the backend, design and
collapse children to come — are filed under #390, not #348.

## ADR 395 — Two Patterns count what the reader sees

**Decision.** Two roster rulings from the #395 design round on the operator's
own data, which showed the same behaviour split across a Pattern and a member
it could not count. (1) Highs after meals counts meal bolus fell short as a
rate lever beside carb undercount and late bolus: it is the same under-dosed
meal judged from the high it produced rather than from the meal, identified by
the meal opportunity its episode covers, which the exposures feed stamps on the
meals population itself, so a meal caught by both detectors counts once;
it stays observation-only for actions and admission. (2) Lows after correcting
highs counts over lows, not correction clusters: `k` lows preceded by a
correction on active insulin, stacked or not, of `n` lows, with both correction
stacking and correction on active insulin as rate levers identified by the low
opportunity their episode reaches, stamped by the exposures feed on the lows
population itself (a lever whose target lies outside its own episode stamps
nothing), anchored on the low in its case file. Correction clusters (adjacent pairs of user corrections) remain the
stacking detector's own evidence population and stop being a Pattern
denominator. The #391 receipt carries no union-of-both-levers rate over lows, so
the readiness gate for that Pattern is the lows-family floor of 12 by the
ADR 391 rule rather than a derived bound, and HV2-24's criterion line drops
"27 correction clusters".

Sanction: Connor Griffin · 2026-09-09 · "Personally I feel like those are
actually just the same finding in different clothes" (corrections), "It's the
same shit as undercount just with slightly different criteria" (meal bolus fell
short), "A" to both.

**Must prevent.** Pooling: each lever's identities are unioned within one
population, never summed across populations; missed meal stays outside every
Pattern because an un-bolused rise is not a meal opportunity.

## ADR 395 — The rail projects the roster

**Decision.** The design child #395 serves the Pattern roster through the
existing findings projection rather than beside it. On the unscoped whole-day
query only, each `remain_pattern` roster entry becomes one served ranked row
(`id` `pattern:<key>`, register `finding`, kind `pattern`, priority
`settled_price` or null when unadmitted), the rows of every lever that feeds its rate,
admitted or not, stay served and gain one additive `claimed_by` stamp, and the finding case file
accepts the Pattern subject, returning the Pattern's own Exposure population
read from the same exposures feed that prices the row (one occurrence list
serves the row's n and k and the case file's denominator and claimed count, so
the two cannot disagree), with each occurrence's existing per-member verdict
and claiming member; one predicate, `pattern_chartable`, decides both whether
the row carries a chart coordinate and whether the case file serves. A
scoped window serves no Pattern row, because the roster's counts are
whole-feed and every other row is window-local. No membership, rate,
admission, collapse or readiness rule moves: the projection re-shapes what
#393 already publishes.

This corrects the paraphrase in "Why a fourth native child under #390" above:
the lifecycle rule forbids one order mixing `build` with `revise`, and permits
a `none` sub-order under a `revise` header. #395's server half is therefore a
`none` chunk of the revision, not a second backend build, and the shipped rail
is untouched until that revision lands. The issue intake's expectation that the
projection shape would not be touched is superseded by the re-inventory
finding that the roster carries no chart series and no position.

**Must prevent.** A Pattern row printing counts from a different window than
its neighbours; the browser deriving placement, chips, or a verdict.

### Why a fourth native child under #390

#390 carries four children: the spike #391 (rulings), the backend build #393
(policy in producers, projection, guidance and persistence; surface lifecycle
none), the eating-sequence members #342, and the design child (the per-pattern
chart and the pattern row on the shipped rail; surface lifecycle revise under
`/ui-craft`, with Connor holding the lock). The backend build and the design
child cannot share a ticket: the lock rules forbid one order mixing `none` and
`revise`, the design child needs a visual lock the backend build does not, and
each is independently shippable — the backend policy already serves the roster
through public interfaces with the shipped rail untouched, and the rail revision
changes no policy. The Diagnose collapse (2.5.5) is a further lifecycle-gated
revision amending the desktop lock's navigation terms and is filed when the
design child is admitted.

### Effect on the desktop lock

`HV2-09`, `HV2-10` and `HV2-11` for navigation, and `HV2-24` for Focus
readiness, are amended-pending. Their amendments land with #390 step 4 and step
2 respectively, not in this planning record.
