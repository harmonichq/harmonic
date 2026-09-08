# V2 contract proposal

Planning under #348. These are the minimum additions implied by the agreed
journeys, for review before implementation. They do not change the existing API,
schema, clinical policy, or active-watch behavior in this branch. The ADRs in
[design.md](design.md) own the settled product decisions; this document proposes
the interfaces that would implement them. [evidence.md](evidence.md) records
verbatim command output and executed producer checks for the current facts.

## One next step

ADR 383 and ADR 384 in [design.md](design.md) now govern the admitted backend
guidance and preference increment. The table below remains the broader journey
proposal; pending-Plan/draft precedence and context/endings are specified by ADR 386 below,
not part of #384.

Overview and Explore read one backend-owned selection. They do not independently
sort findings, interpret scenario rank, or turn a chart's support stamp into
permission to recommend a treatment.

| Current state | Lead content | What remains available |
| --- | --- | --- |
| Active Trial or Focus | The actual change and current progress | Important worsening, its evidence, Day and history; no second watch |
| Recorded Plan awaiting pump confirmation | Manual-entry schedule and the actual reconciliation result | Proposed and detected settings, the decision context, Day |
| Saved draft, with no active watch or pending confirmation | The draft and its next decision | Current evidence and detected settings before recording intent |
| Supported action, no current change | One selected eligible action and its cited evidence | Other supported actions and set-aside choices on demand |
| Recurring concern without an eligible action | A guided look at the relevant episodes | Distinct cohorts, uncertainty, Day and set aside |
| No supported action or recurring concern | Quiet state | Day, history and settings |
| Failed or unavailable current read | Explicit read failure; last known state remains dated if retained | Retry and already available context; never infer quiet from failure |

ADR 386 retains active-watch precedence (Q6) and settles pending Plan before
draft when no watch is active. These are distinct retained states, not competing
watch identities. Current guidance remains unchanged by this investigation. The returned selection needs its canonical subject,
action or investigation disposition, evidence window/revision, plain explanation,
cited occurrences, available actions, and active-watch context. Clinical eligibility
stays in the existing setting-specific backend predicates. The existing Priority
is a candidate input, not a validated estimate of preventable harm or an existing
cross-parameter recommendation. Before execution, review the selection policy
against overlapping findings, consequential recurring lows/highs, thin support,
held settings, ties, and an already active change. A synthetic chosen subject
must not be described as proof of that policy.

Two current boundaries need explicit treatment:

- `watched_change.pinnable_levers()` identifies the behavioral lever universe.
  It is not a recommendation-support gate. The Focus pin endpoint checks that
  universe and the active-Trial guard; v2's claim that one habit action is
  supported must come from the guidance owner. Do not bless a low-confidence
  recommendation because the pin endpoint accepts its lever.
- Scenario step text currently mixes an evidence statement with advice in one
  string. The late-bolus fixture demonstrates this: the inferred step contains
  treatment-timing advice while the selected recommendation is low confidence.
  A v2 evidence read needs factual/inferred explanation separated from an
  eligible action. Hiding a button does not remove advice embedded in prose.
  The exploration may excerpt the existing factual clause for this known case;
  production must not depend on splitting arbitrary clinical text on punctuation.

## Decision context and endings

The settled, reviewed ADR 386 in design.md owns this implementation contract.
Version `386:1` extends
existing records; no schema or endpoint is implemented by this document.

| Record | Identity and minimum retained fields | Public owner |
| --- | --- | --- |
| Applied Plan | Existing `applied_at` key and items; bounded `decision_context`; complete pump-entry deliverable including its source profile and captured I:C provenance | Extend Store apply/history and authenticated `/api/plan/apply`, `/api/plan/history` |
| Trial | Existing Verify id, parameter/slot, detected time, before/after settings, captured block/members where present; `first_observed_at`, bounded `observed_context`; nullable reconciled Plan key and match receipt | Backend watch reconciliation persists through Store; selected reads extend `/api/verify/trials` |
| Focus | Existing stored id/lever/pinned time; bounded `decision_context`; retained `comparison_context` | Extend Store pin/list and authenticated `/api/focus` |
| Plan intent withdrawal | Applied Plan key, withdrawn time and optional user reason; original intent remains readable | Authenticated `/api/plan/history/withdraw` through Store; see #387 implementation interfaces |
| Trial or Focus ending | Kind, effective time, recorded time, optional user conclusion, bounded final assessment with its actual periods/context/limits | Proposed authenticated `/api/verify/trials/{trial_id}/finish`; extend `/api/focus/{focus_id}/resolve`; automatic endings are written by watch reconciliation |
| Admission frontier | Newest admitted canonical Trial id and detected time; retained after ending | Same backend watch owner and Store; read by active selection, Verify, guidance and Focus pin guard |

Each context envelope carries `version`, `state` and `reason` when unavailable.
Available contexts carry capture time, action and explanation as shown then,
source evidence window, source revision/policy identity, canonical source
subjects/occurrences, relevant settings with units, and the displayed support and
unknowns. Preserve only the evidence summary needed to explain the decision;
raw CGM/bolus/basal series and every-refresh snapshots are excluded. The backend
copies these from its source-owned read, not from arbitrary browser clinical
prose. A write rechecks the selected action against the current source revision.

An ending assessment carries the selected period pair, the comparison-context
identity, displayed adherence/outcome rows with units and named denominators,
assessment/limitations, and its own availability. A missing final assessment may
be recorded as unavailable without inventing one; it does not transform a user
conclusion into a supported result. Request failure is distinct from an
unavailable assessment. No inference failure may silently supply favorable text.

Use explicit availability for unstored legacy context and ending facts. Do not
populate those fields with current evidence or a guessed date. An existing
applied Plan keeps its key, even when its historical full deliverable was never
stored; without enough evidence for unique reconciliation its Trial link remains
unavailable. A Trial without a Plan preserves observed facts at first discovery;
its original user decision remains unavailable. The reconciliation receipt names
the applied Plan key, observed change/snapshot, matched deliverable and captured
block, and when the match was established. The `deliberate` soft flag does not
prove this receipt. Draft-only equality does not prove an applied decision.

One backend verdict returns active kind/id, admission reason, maturity,
`can_finish_trial`, Focus pin availability/reason, and ending. Consumers display
it verbatim. Select the newest candidate before checking terminal status and
retain the admission frontier after finish. Never promote an older or same-instant
peer on refresh. Keep existing candidate detection/grouping and `_review_id`,
including block end; admit proven captured-block candidates consistently across
consumers. The ordering, automatic endings and retry semantics are in ADR 386.

Public writes validate identity and source revision, reconcile observed changes,
and atomically preserve the first ending and release the slot. Repeating a known
ending returns it unchanged; an unknown subject is not found and a first invalid
finish is a conflict. An ordinary caller can read and retry after a stale input
conflict. The production implementation must test transaction rollback, concurrent
finish/preemption, and one-active-Focus enforcement. The in-memory spike does
not prove them. All durable writes bump the cache after commit. Saving a draft
retains its one existing cache exception.

History reads are read-only: they do not call the active resolver, perform
migration or reconciliation, or mutate a live Focus. Extend the #340 selected
`(kind,id)` envelope and lazy roster to include retained Trial records and ended
Focus rows. Original context/ending and a later reassessment are separate fields
with explicit availability; a reassessment never replaces the saved snapshot.
Deduplicate retained and derived Trial summaries by their canonical id. A record
whose raw evidence is no longer available remains readable as a record.

## Follow-up periods and source context

Return one `periods.before` and `periods.after` with full pump-local start/end,
half-open semantics and boundary reasons. For Focus, Before is available history
up to 90 elapsed days before pin; After is pin to effective ending (active:
selected data tail). Missing legacy ending time makes the historical comparison
unavailable. An ending preceding pin is an explicitly unavailable After, not a
made-up boundary. The read's data cutoff and source revision accompany the pair.
Use those periods for every selected chart, adherence tally and outcome row.

`comparison_context` carries version `386:1`, the programmed-profile ISF at pin
with units and source snapshot identity, and the code/configuration identity of
the existing classifiers and comparison producers. One value is used across both
arms and later follow-up. Per-meal dose-stamped I:C and existing detector policies
remain authoritative. Source/profile/configuration changes cannot silently
reprice one arm. If an old retained computation version cannot be executed, the
original stored record remains readable and exact reassessment is unavailable;
a separately labeled current-policy reassessment cannot claim like-for-like
improvement. This requires no historical executable archive.

The initial Diagnosis snapshot may use another effective-ISF context. Retain that
fact and recompute a Focus baseline under the follow-up context; never use the
initial Diagnosis count as the Before rate of a comparison computed otherwise.
The synthetic correction-on-active-insulin discrepancy is 2/5 versus 0/5 on the
same records, under ISF 0 versus 40. It is not an outcome or adherence improvement.
The fixed-context rationale is the current trend producer's #131 rule; the
inference-method/population authority remains #340 at
`1ee53b341192b0943c83aae94b47dc6b33c571e3`, with the follow-up readiness and
observation refinements specified below.

Adherence carries lever, numerator, named opportunity denominator, rate and
availability; `n=0` yields a null rate with an unavailable reason. `k=0,n>0` is an
observed zero unwanted-behavior rate only under the measurement eligibility in
“Follow-up observation eligibility” below. Outcomes use their own named denominators
and assessments. Correction-stacking behavior and harm remain distinct. Existing
false-low preprocessing, response-time observation eligibility, eligible anchors,
context padding, period clipping and rescue observation apply in both arms.
Do not average rolling tile percentages or derive populations in the browser.

A setting Trial's watch ending does not change #340's setting comparison bounds:
Before is the immediately preceding continuous relevant setting period capped
at 90 days; After ends at the next relevant setting change or data tail. A saved
ending assessment uses only its then-available evidence. Later accumulating data
belongs in reassessment, clearly dated. The watch's existing 28-day expiry and
14-day maturity are not comparison confidence or evidence-duration rules.

## Pending Plan and draft precedence

An active watch leads; a pending applied Plan remains accessible but does not
become a second watch. Without a watch, the latest unconfirmed applied Plan leads,
then a saved draft, then current guidance. A confirmed Plan yields to its actually
matched Trial. When several old applies remain unmatched, present them in history
without silently declaring them entered or canceled; only the latest pending
intent leads. Explicit withdrawal releases pending intent and is recorded once against the
applied Plan key with its time and optional reason. Retry returns that same
withdrawal. It is never a Trial ending or pump reversal; a later real detected
change still opens its own Trial and cannot revive withdrawn intent.

A draft is consideration. It cannot erase an applied Plan, preempt a Focus, or
prove a setting change. An existing draft remains inspectable during a watch;
new apply/pin actions use the backend one-change verdict and current guidance
eligibility. A pending applied Plan blocks starting an unrelated Focus until
confirmation or explicit withdrawal of that intent. No silent queue of watches
is introduced. The selected desktop retains its manual-entry/reconciliation
journey and the draft can be revalidated against current evidence on return.

## Set aside and return

Persist the canonical priority subject, optional reason, decision time, and the
action/seriousness state the user set aside. Guidance consumes this preference;
the existing audit-dismissal table is not already consumed by the Findings queue.

Keep it aside through ordinary evidence refresh. A return needs a reviewed,
versioned determination that the recommended action or seriousness materially
changed, plus a plain explanation of that change. A raw evidence fingerprint,
small count fluctuation, or a new analysis generation alone is insufficient.
ADR 383 in `design.md` settles the comparison as policy `383:1`, verified by
the synthetic replay in `evidence.md`. Task 3.1 implements that policy; it adds
no numerical materiality threshold. The user can explicitly revisit or
restore the concern at any time.

## Reuse and delivery boundaries

- Build the new shell, journey surfaces and shared evidence views as Vue
  single-file components from the first useful v2 increment. Components own
  composition and interaction; extract shared behavior only where the actual
  callers need it. This does not require wholesale decomposition of v1 or a
  component for every fragment of markup. The build brief settles the exact
  component boundaries.
- Import the pure `frontend/plan.js` deliverable and reconciliation functions
  through a deliberate shared boundary. Do not port a second copy of their
  schedule-merging, rounding or single-variable rules into v2.
- Reuse evidence producers and chart renderers where their contracts fit.
  Matched, Nearly matched and the named eligible comparator retain membership,
  support, denominators and limits. A selected trace stays distinct from an
  aggregate. Display-window changes do not change cohort membership or maturity.
- One navigation owner retains subject, time window, selected occurrence and
  return destination. Direct Day entry carries no invented prior concern.
- Keep application settings, pump settings and carb logging reachable through
  the retained jobs. A prototype utility that is not wired is a recorded gap,
  not a completed journey.
- Backend additions are backward compatible while v1 and `/v2/` coexist.
  Production assets are built ahead of time and served by Python. Validate API
  authentication, base paths, direct links and installed-package assets against
  the built result before release; a Vite development page is insufficient.

The first usable release requires both setting and habit loops, with these
contracts and the rendered limiting states reviewed. The #387 backend migration and endpoint interfaces are fixed below; rendered
delivery remains subject to its later execution lock.


## #386 shared-chart and production handoff

The #340 retained comparison design owns the statistical contract and its
explicitly approved common glucose scale, zero marker and data-boundary
extensions. The current `renderEventSurface` owns the full event comparison
mount, legend, pointer/keyboard readouts, selected-trace behavior and cleanup.
Its current mount accepts a Finding case file and header/headline hosts, and
computes its own scale. The current option supplies an anchor label and ordinary grid lines; it does
not supply a dedicated bolus-zero marker despite an older source comment.
The smallest response-chart extension is a real Before/After data boundary,
shared-scale input and the already-approved zero marker on that existing mount. It must not manufacture
a diagnostic Finding or copy option builders into a replacement mount.

| Selected v2 job | Existing owner to reuse | Required proof in the build |
| --- | --- | --- |
| Changes setting comparison | #340 selected-detail periods; `trial_evidence`; shipped basal/ISF/I:C chart descriptors and mounting interactions | Same canonical subject/affected span in header, both arms, support and outcomes; profile changes show constituent evidence without attribution |
| Changes Focus and retained history | Existing behavior tally and mapped outcomes, exact periods/context above; shared event mount where its evidence shape fits | Original Diagnosis versus retained comparison context; manual/preempted/legacy/zero-opportunity states; no invented chart for unsupported evidence |
| Group inspection and paired/overlay | `renderEventSurface` plus approved data/scale seam | Group-first opening; -1 to +5 hours for meal alignment; zero marker, named groups, common scale, support gaps, legend and pointer/keyboard readout; selection and overlay preserve populations |
| Occurrence to Day and return | Shipped Day/navigation and selected-desktop return behavior | Retain kind/id, affected window, period/view, occurrence and return destination; direct Day invents no prior subject; full Day does not inherit a clipping glucose range |

Extract existing non-event mounting/interaction behavior for actual second
callers; do not copy `mountDescriptorChart` or compose a new chart from fragments.
A missing capability beyond the admitted seams remains a separately reviewed
proposal. This spike produces no rendered evidence and changes no chart.

The implementing ticket must formalize UI Craft's build contract from the selected
#348 brief/prototype and completed repair records, map retained predecessor
behaviors and #340's sanctioned session-only Keep removal, and distinguish it
from ADR 348's new durable conclusion action. Preserve Revert-to-Plan. Attach
paired prototype/build evidence and interaction replay at the locked desktop
viewports, with retained light/dark and limiting states. No new concept round.

Production verification must exercise Store/API writes and readonly history,
restart and migration, duplicated requests, stale input and finish/preemption
races, failed transaction rollback and cache invalidation; canonical/block
identity, old-versus-new admission, Plan-match ambiguity, draft/pending intent,
sequential setting/Focus attempts and exact legacy availability. Generate owned
synthetic cases and drift checks in that build. Prove exact timestamp boundaries,
anchor membership, missing coverage, zero opportunities, retained context under
profile changes, and separate adherence/outcome assessment through public
producers. Apply #340's statistical tests without altering its policy.

Then prove selected-subject replacement, loading/error/Retry, read-only history,
chart interaction/cleanup and exact Day return against the built no-fetch Python
app. Run its repository gates and packaged v1/v2 asset/authentication checks.
These are unexecuted build obligations, not blockers concealed by the spike's
passing scratch assertions. Mandatory independent review of findings commit
`11610c0ae7c8fd3e1753d79d6e340a3977be5274` is complete, with the qualified
coverage recorded in evidence.md. Next child admission remains with the epic
coordinator; production and UI verification remain owed.


## #387 implementation interfaces

This section fixes the build interfaces under ADR 386 and the #387 production
risk contract in design.md. It specifies planned additions, not shipped behavior.
The existing identity, context, reconciliation, ending and period rules above
remain normative. The build uses the three ownership boundaries below; a consumer
cannot revise its provider's files. An interface change requires a revised lock.

### Public requests and responses

Every operation below uses the existing token authentication. Read routes return
`input_revision` (the Store's input-data revision) and the one `admission` verdict.
Guidance retains its existing `analysis_generation` and `input_revision` fields.
New durable writes carry `request_id` (nonempty opaque string) and
`input_revision` (integer). Apply and pin also carry `subject` and
`analysis_generation` from the current guidance read. These select a backend
source; they never supply clinical prose, settings context or an assessment.

On existing write routes, the presence of `request_id` selects the durable
contract. All durable fields required for that operation must then be supplied;
a partial durable request is rejected by ordinary API validation (422). A request
with none of those fields retains the legacy request shape and documented error
behavior. It still runs through the common lifecycle owner and cannot bypass
admission; missing source fields are captured and revalidated server-side. The
legacy Plan draft remains `{items}` and still has its cache exception. Legacy
apply still accepts no body; legacy pin still accepts `{lever}`; legacy resolve
still accepts no body and returns 404 if its Focus is already closed. New callers
use the durable contract to receive the idempotent result on retry.

A successful durable mutation returns its existing response fields, where any,
plus `record`, `input_revision`, and `admission`. `record` is the retained Plan,
Trial or Focus described above, with its canonical identity and versioned context,
reconciliation/withdrawal or ending. The first accepted result is retained against
`request_id`; retry of that operation and identity returns that result unchanged.
Reusing a request id for a different operation or identity is 409. For an already
ended subject or withdrawn Plan, a new request id also returns the first retained
ending/withdrawal, ignoring a changed conclusion/reason or stale revision. It does
not save another assessment. An apply/pin retry returns the original Plan/Focus
identity even after the draft is cleared or that watch ends. Responses to retries
retain the original result's revision; obtain a fresh read for current admission.

Before a first mutation, compare `input_revision` inside the reserved Store write
transaction, reconcile the captured observed input, then revalidate admission and
source action against that same input. Apply also checks the draft's `updated_at`
against required `draft_updated_at` from GET `/api/plan`; saving a draft does not
advance the input-data revision. A stale draft or source cannot apply. A missing
known-identity target is 404; a stale source, stale draft, unavailable admission,
nonactive/immature first Trial finish, or invalid lifecycle transition is 409.
An existing record with missing evidence is a successful explicit unavailable
record, not 404. Invalid legacy lever/draft remains 400. Durable errors keep the
FastAPI `detail` field and add a machine-readable `code` in its object, with
`input_revision` and `admission` on 409; legacy `detail` strings remain compatible.
Unexpected computation/transaction failures remain errors, never successful
unavailable assessments. No receipt is saved for a failed request.

| Method and route | Identity, revision and selection input | Additive success and error/compatibility behavior |
| --- | --- | --- |
| GET `/api/plan` | None | Existing `items`, `updated_at`; add revision/admission. No write. |
| PUT `/api/plan` | Existing `{items}` | Existing `{items, updated_at}` and validation; draft-only, no watch mutation. |
| POST `/api/plan/apply` | Durable body `{request_id, input_revision, subject, analysis_generation, draft_updated_at}`; draft is server-stored | Existing `applied_at`, `items`; add retained applied record, full deliverable and decision context. Duplicate id returns same apply; empty draft is 400, changed draft/source or occupied admission is 409. No Plan decision is inferred from draft equality. |
| GET `/api/plan/history` | None | Existing `history` list with additive context, reconciliation and withdrawal per row, plus revision/admission. Does not reconcile. |
| POST `/api/plan/history/withdraw` | Body `{applied_at, request_id, input_revision, reason?}` | `{applied_at, record, input_revision, admission}`; unknown Plan 404; first request on a confirmed/nonpending Plan 409; prior withdrawal returns saved withdrawal. Does not end/reverse a Trial. |
| GET `/api/focus` | None | Existing `focuses`, `pinnable`; add retained fields per row and revision/admission. `pinnable` remains the lever universe, not permission. |
| POST `/api/focus` | Existing `lever`; durable body adds `{request_id, input_revision, subject, analysis_generation}` | Existing `id, lever, pinned_at, status` plus record/revision/admission. Canonical subject must match lever; invalid lever 400; a pending Plan, active watch or ineligible source is 409. Retry returns same Focus id. |
| POST `/api/focus/{focus_id}/resolve` | Stored integer id; durable body `{request_id, input_revision, conclusion?}` | Existing `id, status` plus record/revision/admission with saved manual ending/assessment. Unknown 404; durable retry of any recorded ending returns it; legacy already-closed request remains 404. No maturity gate. |
| POST `/api/verify/trials/{trial_id}/finish` | URL-encoded canonical Verify id; body `{request_id, input_revision, conclusion?}` | `{id, record, input_revision, admission}` with saved `user_finished` ending/assessment; unknown 404; invalid first finish 409; prior automatic/manual ending wins on retry. |
| GET `/api/verify/trials` | Existing `selected`; `kind=trial|focus` defaults to trial; `assessment=original|retained|current` defaults to original | Existing `trials, selected`; add lazy `focuses` roster, revision/admission. `selected` uses the #340 common envelope and retains existing Trial fields and `plan_route`. Unknown selected identity 404, invalid kind/mode 422. No selection returns summaries only and rejects a nondefault assessment mode (422). Retained records remain selectable outside the derived roster's old cap/horizon. |
| GET `/api/guidance` | Existing arguments | Existing guidance fields plus the common admission verdict and pending Plan/draft context using the precedence above. No second permission calculation. Existing preference writes are unchanged. |

The selected detail always carries `original` (the saved decision or first-observed
context and ending assessment, with explicit availability). `assessment=original`
returns `reassessment: null`; on an active record without an ending snapshot that
original assessment is unavailable. `retained` requests a read-only reassessment
under the stored comparison context. `current` explicitly requests current-policy
reassessment. Both return `reassessment: {mode, computed_at, input_revision,
comparison_context, comparison}` separately from `original`. An unavailable
retained executable context is not silently substituted with current policy.
A current-policy result labels that context and cannot claim like-for-like
improvement. Live/legacy Trial detail fields continue to use their existing
projection; the additional original/reassessment fields do not relabel them.
Cache keys include kind, id, assessment mode and revision/context identity.

The common comparison object follows #340: `periods.before/after`, `views`,
`outcomes`, `denominators` and `availability`; Focus adds `adherence` separately.
Each period contains full pump-local start/end, boundary reasons, data cutoff and
source revision. Every outcome retains its unit, named denominator, observed
difference, assessment state/reasons and interval/method where estimable. The
assessment states remain #340's `favorable`, `concerning`, `unclear`, `context`;
record/data availability remains `available` or `unavailable`. Available data with
an unclear inference is not an unavailable record or a favorable conclusion.

### Store persistence interface (owner: durable Store boundary)

Extend the existing Store, preserving its legacy methods and return types. Its
new boundary owns storage, transaction mechanics and immutable-field enforcement;
it does not detect candidates, select admission or compute an assessment. No
second persistence module, generic event store or background recovery service.

| Interface | Contract consumed by lifecycle/API and comparison owners |
| --- | --- |
| `Store.follow_up_transaction(*, expected_revision=None)` | Context manager on a writable Store; reserve the SQLite writer with `BEGIN IMMEDIATE` before checking the existing integer input revision. A mismatch raises `FollowUpConflict`. The outer scope commits changed rows with one revision advance, or rolls back everything on exception; a no-op does not advance revision. Existing apply/pin/resolve methods join this scope without an inner commit. Read-only Store rejects it. The transaction exposes the same Store, not a second session type. |
| `Store.follow_up_record(kind, id)` and `Store.follow_up_records(kind)` | Read-only retrieval; kinds are `plan`, `trial`, `focus`; ids are applied_at string, canonical Trial string, and Focus integer respectively. Missing returns None; records lists use existing newest-first ordering with canonical identity ties. Merge legacy base rows into explicit unavailable envelopes without persisting during reads. |
| `Store.save_follow_up_record(record)` | Transaction-only insert/update of the retained envelope. Identity and first-captured context are insert-once; an eligible later Plan receipt may fill an absent relationship. Ending and withdrawal are first-wins; attempts cannot overwrite their effective/recorded times, conclusion or assessment. Return the stored winner. Reject invalid identity/kind and orphan Plan/Focus base rows. Record validation is bounded to the fields in this contract. |
| `Store.follow_up_frontier()` and `Store.advance_follow_up_frontier(trial_id, detected_at, *, reconciled_input_revision)` | Read `{trial_id, detected_at, reconciled_input_revision}` or None; nullable Trial fields permit recording an empty-candidate reconciliation. Transactional monotonic advance preserves ADR 386's canonical-id tie rule and retains the frontier when no new candidate exists. Candidate selection remains outside Store; a referenced Trial must exist. Return stored winner. The reconciliation revision identifies the committed input state, including this transaction's own durable changes. |
| `Store.follow_up_request(request_id)` and `Store.save_follow_up_request(request_id, *, operation, kind, id, result)` | Read or transactionally save the first bounded successful public result and operation/identity. Duplicate mismatch raises `FollowUpConflict`; exact retry returns original result. No raw inputs, evidence series or per-refresh history. |

Retained records extend the existing identities: `kind`, `id`, `version`,
`decision_context` (Plan/Focus), `observed_context` and `first_observed_at` (Trial),
`comparison_context` (Trial/Focus), `deliverable` (Plan), `reconciliation` (Plan/Trial),
`withdrawal` (Plan), and `ending` (Trial/Focus). Preserve the legacy row fields.
The context/ending availability envelopes use the minimum fields already defined
above. A Trial record additionally freezes parameter, slot, detected time,
before/after values and captured block/members for later read-only comparison.
Schema columns/table organization are private to Store; consumers never issue SQL
against these records. `FollowUpConflict` carries a reason code and actual input
revision; HTTP translation belongs to the lifecycle/API owner. SQL errors remain
errors. Writable startup owns migration; history uses the existing readonly or
query-only opening without DDL.

### Comparison interface (owner: exact-period comparison boundary)

Add `ciq_autotune/follow_up_comparison.py` with these read-only front doors:

| Interface | Input and result |
| --- | --- |
| `capture_comparison_context(store, *, at, input_revision)` | Capture the existing programmed-profile ISF selection, units/source snapshot and executable code/configuration identity as the `386:1` envelope. The Store is already bound to the caller's source revision. Missing input is explicitly unavailable. |
| `compare_follow_up(store, *, record, data_cutoff, input_revision, context_mode="retained")` | `record` is the Store envelope above, with a proposed ending when computing a finish. `context_mode` is retained or current. Return the common comparison object and the actual comparison-context envelope. Read only; no resolver, migration, persistence, admission or cache mutation. |

This is a deep comparison module shared by final-ending capture and selected
reassessment. It owns continuous setting-period selection, exact Focus periods,
shared populations/denominators and #340 assessment composition. Removing it would
split that coupled period/context/population calculation across ending and history
callers. It is not a façade over the legacy rolling trend. Factor reusable
observation/metric computation inside `outcomes_trend.py` and `trial_evidence.py`
for both their existing callers and this real caller; never call the writable
legacy trend/watch resolver from comparison, and never duplicate classifier or
metric policy. Preserve the old default producer signatures and output shapes.

Implement #340's already-settled setting as well as Focus assessment: I:C captured
block membership, basal relevant hours, ISF rest windows, whole-profile
constituents, and mapped Focus outcomes. Use the exact #340 selected period,
coverage and day-grouped uncertainty rules at
`1ee53b341192b0943c83aae94b47dc6b33c571e3`,
`openspec/changes/verify-change-comparison/design.md`, “One selected-detail
interface” and “Narrow outcome assessment”. The ADR 386 period/context refinements
above apply. Neither maturity nor an analyzer recommendation floor becomes a
comparison support rule. Synthetic producer tests must exercise an available
setting comparison and an available Focus comparison, unclear/degenerate cases,
zero opportunities, positive denominators with zero unwanted events, exact
boundaries, context changes, and original-versus-current differences.

#### Attributed occurrences for exact-period comparison

ADR 387 in design.md records the provider refinement. The comparison owner also
owns the following shared read inside the existing scenario provider; it adds no
classifier or recurrence policy.

| Public interface | Contract |
| --- | --- |
| `attributed_occurrences(bolus_events, cgm_readings, basal_events=(), *, isf=None, scenario_config=ScenarioConfig(), low_answers=())` | Export from `ciq_autotune.analyzers.scenario` through `__init__.py`; implement in `scenario/engine.py`. Return an immutable tuple of `AttributedOccurrence` records, one per lever-bearing attributed episode before recurrence deduplication, in existing episode order. Accept the same contextual inputs/defaults as `tally_attributions`; no Store, window metadata, narration or scoring is required. |
| `AttributedOccurrence` | Define in `scenario/engine.py` and export through the same public package. Retain `lever`, `episode_id`, `recurrence_id`, `driver_family`, `driver_source_key`, and `anchor_t`. Episode identity follows the existing provider's episode indexing for the supplied input; it is not a new durable identity. Recurrence identity comes from `policy_for(lever).occurrence_for_episode`; the driver key uses the existing canonical opportunity/actual correction-pair identity. `anchor_t` is the policy-owned recurrence opportunity time, not a narrated step, display start or classification onset. If a driver cannot be associated with its owned population, retain the attributed row with null anchor and an explicit `unavailable_reason`; do not silently remove its attribution from the old tally or invent a comparison anchor. |

Factor the existing `tally_attributions` anchor/segment/split/attribute walk into
this shared provider read. The legacy tally consumes its rows with its current
recurrence deduplication and returns the same `(exposure_counts, attributed_by_lever)`
shape, defaults and counts. Preserve current low-answer handling, context padding,
ISF/configuration inputs, earliest-driver choice and split semantics. Do not copy
the walk into `follow_up_comparison.py` or `outcomes_trend.py`, or replace it with
narrated `assemble` episodes. Only the shared correction-counter observation
factoring specified in
“Follow-up observation eligibility” below may change classifier implementation
structure; threshold values, classifier decisions, confidence gates and recurrence
definitions remain unchanged.

Resolve ownership using the existing `opportunities.build_opportunities`,
`canonical_anchor_key` and `evidence_population.policy_for` population/identity
methods over the same contextual inputs. An ordinary driver's key resolves to its
opportunity's `anchor_t`; high ownership is its peak, low ownership its nadir,
and a correction pair belongs to its second correction. Preserve the existing
rebound-to-nadir association. For the custom completed-meal recurrence population,
resolve the policy's recurrence id to that completed meal and use its event time;
several episodes attributed to that meal remain one recurrence. Driver identity
and recurrence identity remain separate, including when their populations differ.
Do not replace either with the narrative's first step time. The provider owns
this association; a comparison consumer does not re-derive it.

Comparison loads classification context and performs the provider walk before
applying the selected `[start, end)` ownership interval. Filter numerator rows
by the returned policy-owned `anchor_t` and deduplicate by `(lever, recurrence_id)`.
Build denominator opportunities from that same contextual input, then select the
existing lever recurrence population and filter its opportunity `anchor_t` (or
completed-meal event time for that policy) by the same half-open interval.
Required preceding/following classification context stays available even when its
own anchor is outside the selected period; it contributes no observation or
opportunity merely by being loaded. Do not pre-clip CGM, bolus or basal inputs as a
substitute for ownership filtering. Feed the resulting owned dates and
populations to the unchanged #340 assessment. Unknown ownership makes that
comparison unavailable with its reason; it never licenses a favorable result.
Existing false-low, rescue-observation and data-cutoff contracts still apply.

Add public-import regression coverage in `tests/test_scenario_engine.py` and the
already-owned `tests/test_follow_up_comparison.py`. The minimal counterexample is
a high whose opportunity peak lies inside the period and whose preceding meal
lies outside: the full-context provider must retain the classification, the owned
high denominator remains one, and no missed-meal numerator may be manufactured.
The known failing clipped-input assertion documents why the old interface is
insufficient; it is not a regression introduced by Store persistence. Add genuine
attributed rows with anchors exactly at start/end, a classification onset outside
but peak inside, context-only opportunities, completed-meal recurrence deduplication
across episodes, and correction-pair/rebound ownership. Assert the new read's
all-input aggregation equals unchanged tally results on synthetic cases, including
low answers and nondefault configuration, through the public package import.
Do not mock classification or hand-set the verdict being proved. Retain the
original available setting and Focus comparisons, unavailable-versus-unclear
states, retained-context and readonly tests; this is an additional provider proof,
not a replacement for them.

#### Type-specific comparison readiness (ADR 387 practical policy)

These are pragmatic follow-up observation rules for setting Trials AND habit
Focus. They are not calibrated clinical thresholds, evidence of benefit, or a
claim of reliable repeated-look inference. The operator cancelled the proposed
full study and its preregistration, reserved evaluation and runtime-admission
requirements; none is a delivery prerequisite. I:C eight effective qualifying
closed meal runs remains fixed. The other rules adopt conservative observation
periods informed by local evidence availability, without a threshold search.

| Selected change | Readiness in each exact comparison arm |
| --- | --- |
| Basal | At least **14 qualifying clean nights for every affected slot**, using actual arm-owned clean samples from the existing basal producer, with dates deduplicated per slot. Preserve the relevant programmed regime and clean/readable eligibility. A nominal roster timestamp, detected Rest window or directional-support count is not this population; never add slots into nights. |
| Carb ratio | At least **8 effective qualifying closed meal runs for the captured block**, using existing eligible `in_pool` runs, source ownership weights and an outcome readable by the look cutoff. Retain exact captured span/members, arm-appropriate schedule, regime provenance, full run context and contributing dates. Excluded/unreadable runs do not count toward readiness; fractional ownership is not rounded into whole runs. Unmatchable captured membership is explicitly unavailable. |
| Correction factor | At least **30 distinct qualifying fasting Rest windows in the affected hours**, each with a source-eligible fasting step whose endpoints belong to the arm and affected interval. Preserve source window identity and contributing night/date clusters. Report step count separately; many micro-steps in one window count as one window. |
| Whole profile / multiple settings | At least **30 elapsed days AND 30 coverage-qualified informative dates** in each arm, using the existing whole-period glucose coverage rule. Retain constituent evidence separately; do not add component counts or imply a combined causal effect. This is a conservative observation policy, not a new profile estimator. |
| Focus | At least **14 elapsed days** in each arm and an available lever-specific behavior population: original opportunities must be positive and the measurements needed for the full-population behavior rate readable. Report measured/unmeasured recurrence opportunities and contributing dates separately from duration. No universal opportunity count or glucose gate replaces the lever's own population. Mapped outcomes retain their independent readability and assessment; known record-proven behavior remains visible without glucose. |

Measurement availability, follow-up readiness, inferential confidence,
recommendation support and watch lifecycle remain separate. Keep readable values,
intervals and progress visible before readiness. Expose arm-local unit, observed
qualifying count, required count/duration, contributing dates, criterion-met and
reason through the existing comparison-owned `trial_evidence.comparison_evidence`
and `compare_follow_up` boundary. For duration rules report elapsed days alongside
the actual evidence counts; do not label elapsed days as independent observations.
Reuse existing public analyzer/provider populations. Do not copy clean-sample,
meal-run, fasting-step or classifier walks into a consumer. Preserve complete
classification context up to the look cutoff while filtering actual owned anchors
and samples to `[start, end)`; the analyzer's inclusive end cannot admit the next
arm's anchor. Missing context or unmatched retained provenance stays unavailable.
No Store or HTTP source ownership is added. Canonical I:C blocks may wrap
midnight (`end_min <= start_min`); use the existing circular block membership
semantics for both relevant-regime comparison and meal ownership. Preserve the
captured endpoint/member identity rather than treating a negative linear span as
empty. A public synthetic wrapping-block case must retain its owned meal/readings
and distinguish a relevant change inside that arc from one outside it. The
comparison owner fixes this in its existing comparison/trial-evidence paths.

The type-specific predicate REPLACES #340's generic fourteen-informative-date
support/readiness test in the directional gate. That arbitrary support count is
not the bootstrap estimator and must not remain as a second floor. Replace the
same generic support test on Rest-window low-incidence rows while preserving their
Newcombe interval and two-sided Fisher clearance. Preserve the
existing date-clustered resampling, source statistic and rounding, confidence
interval, outcome polarity and outcome-specific coverage/readability rules. Keep
the genuine minimum of two contributing dates for estimability and the existing
non-estimable, degenerate and zero-crossing limitations. Do not introduce another
independence floor. Eight effective I:C runs need not span fourteen dates; they
still cannot support a direction when the unchanged interval is unestimable,
degenerate or crosses zero, or required measurement is unavailable. Before practical
readiness, retain readable values/intervals and withhold the directional claim.
Recommendation eligibility, classifier eligibility, clinical thresholds and all
existing safety predicates/floors remain untouched. Context-only outcomes do not
acquire a direction, and missing mapped outcomes cannot be filled by adherence.

An observation period may end inconclusively. A significant or favorable result
is never required for an ending and never triggers one. There is no automatic
fourteen-day ending or silent clipping. Continue under the existing effective
Focus ending, next relevant setting change or data cutoff as applicable. Watch
maturity/expiry remains lifecycle metadata; it is neither comparison readiness
nor confidence and does not truncate settled setting comparison bounds.

Targeted verification uses a few public-interface synthetic placebo, known-signal
and missingness cases plus a small, preselected set of exact-period no-change
replays on an immutable local snapshot where available. Report all sampled splits,
including incomparable regimes and unavailable/unclear results; do not select
only favorable splits. Unchanged settings do not prove unchanged physiology or
habits. These checks give descriptive implementation/availability evidence, not
false-positive, power, clinical-validity or repeated-look guarantees. No Monte
Carlo grid, train/evaluation partition, threshold search or study infrastructure
is required. Private real-data aggregates and instrumentation remain outside the
repository and public logs.

Public regression tests in the already-owned comparison and trial-evidence suites
must prove the named units and exact-arm counts, fractional/excluded/unreadable
I:C runs, per-slot basal ownership, ISF window deduplication, partial dates,
continued accumulation beyond fourteen days, and readiness-met but uncertain
assessment. Prove I:C eight-run readiness is not silently subject to fourteen dates,
while the original inference kernel/interval and its genuine limiting cases remain
unchanged. Preserve all original available setting AND Focus acceptance and
complete repository/browser/package verification. This practical amendment and
the complete successor execution lock require the normal independent plan review;
the cancelled study is not an additional admission stage.

#### Follow-up observation eligibility (ADR 387 refinement)

This follow-up-only read distinguishes observed behavior, its measured harm and
unknown measurement while preserving the existing recurrence denominator. An
observed positive remains known. An explicit record-proven behavior exclusion
implies zero corresponding harm; missing override provenance is not intentional
exclusion. Keep existing absent-flag fallback when its required dose components
are present. Do not infer bolus-feed completeness or introduce a generic glucose
coverage percentage. Existing classifier verdicts, recurrence membership, low
lines, lookbacks, low horizons and recommendation safety predicates do not change.

For a completed meal with no shortfall attribution, derive possible HIGH onsets
from the positive classifier's digestion lookback and strict preceding completed-
meal identity, not its chart window. A readable no-high domain can establish an
observed negative. Readability covers that entire domain by the union of the
existing `CgmSeries.nearest` valid-time intervals of finite, false-low-filtered
samples, using the retained configuration's maximum staleness. This span predicate
is a new observation contract, not an existing `CgmSeries` guarantee of continuous
physiology. It introduces no interpolation or new sampling constant. Keep each
positive rule's existing slope-readability requirements wherever it needs a slope.

A candidate HIGH can continue indefinitely under the existing maximal-run anchor
rule; digestion and correction lookbacks do not bound final episode attribution.
Do not invent a fixed meal closure horizon. The minimal proposal leaves an
unattributed meal with a candidate HIGH explicitly observed-only/unavailable.
Known attributed positives and readable no-high negatives remain available;
this does not disable the entire lever. Retain this conservative observed-only
limitation explicitly; no stronger closure contract is part of this ticket.

For a known stack or override behavior, an observed attributed low remains known.
A proven upstream exclusion establishes attributed harm zero. Otherwise absence
of a low becomes measured zero only when the positive counter's own low-lookahead
interval is readable by the same span rule. A missing or partial tail remains
unavailable harm while its behavior stays visible. Preserve correction-on-IOB's
existing inference with an absent optional slope and its record-proven exclusions;
its population remains observed low opportunities.

Expose meal recurrence observation eligibility in the existing scenario provider
alongside its attributed-occurrence read, sharing the anchor/segment/split/attribute
walk. The public `recurrence_observations` read accepts the same contextual inputs
plus the selected lever and returns policy-owned recurrence identity/anchor,
observed count, measurement availability and reason. Preserve the existing
`attributed_occurrences` and `tally_attributions` results/defaults. Comparison
consumers filter owned anchors after classification; no consumer duplicates the
walk or substitutes a clipped chart population.

The existing correction counter owners expose read-only
`correction_stack_observations` and `override_observations` with their current
counter inputs. Their rows retain the opportunity anchor, behavior/harm counts,
known exclusion or missing-provenance reason and policy-owned harm interval. Factor
the existing decisions once; legacy counters aggregate the same decisions with
unchanged defaults. The follow-up provider attaches this span eligibility;
legacy aggregate consumers do not acquire a new measurement gate. These source
owners avoid copying provenance, runaway, IOB or upstream-cause decisions into the
comparison consumer.

`outcomes_trend.behavior_observations` carries `measured` for behavior plus
`harm_measured` and separate measurement reasons, retaining its original `n`, known
`k` and known harm counts. The comparison reports measured/unmeasured opportunities
alongside original denominators. If any required behavior measurement is unknown,
the full-population rate/judgment is unavailable; do not renormalize to the readable
subset. Harm availability is independent, and missing harm cannot become observed
zero. Preserve readable values, mapped outcome availability and unclear inference
separately. The Store/API contracts need no new owner or source edits for this
proposal.

Public tests must distinguish missing, flat, internal-gap and partial-tail inputs;
known positive and record-excluded behavior; absent override components versus
intentional exclusion and the settled absent-flag fallback; readable no-high meals
versus candidate high runs with no fixed closure; and original-denominator
retention when only some measurements are readable. Exercise exact period ownership
with preserved context and nondefault existing configuration. Test legacy counter
and tally parity through their public interfaces, without mocking classifier
verdicts. Preserve all original available setting AND Focus acceptance, complete
repository/browser/package gates, and the completed Store task.

Comparison chunk2 additionally owns the existing
`ciq_autotune/analyzers/classifiers/correction_stacking.py`,
`ciq_autotune/analyzers/classifiers/user_override.py`,
`tests/test_classifier_correction_stacking.py`, and
`tests/test_classifier_user_override.py` solely for this shared observation read
and parity proof. Its existing scenario package/engine/test, comparison,
outcomes-trend and trial-evidence paths remain owned there. No recommendation or
classifier policy amendment is authorized. Keep one ticket and three serial chunks:
completed chunk1 Store and chunk2 comparison; remaining chunk3 lifecycle/API
integration. The verification-maintenance handoff below is the sole exception to
completed comparison test-path ownership; it does not reopen comparison policy.

### Existing verification maintenance (owner: lifecycle/API integration)

The completed Store and comparison tasks remain completed. During final integration,
`tests/test_outcomes_trend.py` transfers from the completed comparison owner to the
integration owner solely for test-double and synthetic lifecycle setup compatibility.
Supply the already-admitted Store frontier/read interface and establish lifecycle
state through the admitted setup/write boundary before exercising read-only trend
and API reads. Preserve the existing outcome, denominator, timing and legacy payload
assertions; where an assertion expects reconciliation/preemption as a read side
effect, perform the admitted lifecycle action first and assert the same transition
plus read-only projection. Use eligible synthetic Focus setup for successful pin
cases; retain rejection cases. Do not hand-set comparison/classifier verdicts or
change production to accommodate a fake Store. No completed production comparison
path transfers or reopens.

The integration owner also owns `tests/test_verify_block_ic.py` solely for existing
test/response compatibility: preserve the four rejected block cases' empty roster
while accepting the admitted additive metadata. Give the unannotated Revert-draft
success roundtrip eligible synthetic source/lifecycle setup; retain an explicit
empty/no-source rejection. Its old empty-store setup is not an active Trial and
creates no Revert or maturity policy exception. Preserve block membership, admission,
cohort, unannotated draft/history and all valid legacy behavior assertions. Do not
disable the source/admission guard or alter production policy.

The only additional artifact/setup paths owned by this integration maintenance are:

- `tests/test_verify_block_ic.py`
- `mockups/verify-660-story.synthetic/payload.json`
- `mockups/verify-660-story.synthetic/verify-trials.capture.json`
- `mockups/qa-e2e.synthetic/harmonic.sqlite`
- `mockups/harmonic-v2.exploration/generate.py`
- `mockups/harmonic-v2.exploration/setting.json`
- `mockups/harmonic-v2.exploration/focus.json`
- `mockups/harmonic-v2.exploration/journey.json`

Regenerate the two verify captures with the existing
`.claude/qa/gen_verify_payload.py --synthetic --out mockups/verify-660-story.synthetic`
generator and verify with `scripts/check_demo_fixtures.py`. Refresh the existing QA
showcase database with `scripts/gen_qa_e2e_db.py --out mockups/qa-e2e.synthetic/harmonic.sqlite`
and verify its existing `--check` gate and generator tests. These generator sources
are unchanged and gain no edit allowance.

Within the existing v2 generator, change only synthetic lifecycle setup to call the
admitted reconciliation/admission/ending boundary before read-only capture, including
the Focus and alternative setting-preemption branches. Retain the original synthetic
inputs, assertions and UI composition. Regenerate only its three listed JSON outputs
using that existing generator and run its complete `--check`. Generated provenance
text may reflect the now-admitted lifecycle instead of claiming it is absent;
this is not permission for a new scenario, outcome, presentation or hand-edited data.
Other generator outputs must remain byte-identical. If generator execution would
change another path, report the exact difference before extending this closed list.

The packaging smoke mount/`--db` placement correction is complete and its actual
`docker-pr` build, no-Node assertion and startup passed. The sole remaining CI
follow-up permits `.github/workflows/ci.yml` only to change
`jobs.backend.timeout-minutes` from **10 to 20**. The observed backend job passed
2358 tests (one existing real-database skip) in 475.47 seconds, then exhausted its
existing ten-minute limit during remaining generator checks. Cancellation is not
a demonstrated generator failure or a clinical/performance guarantee. This is the
only timeout exception; no other budget extension is authorized.

Keep all commands, assertions, job structure, runner, fixture provenance, nonroot
runtime, no-fetch, no-Node/built-shell checks, cleanup and fail-closed behavior
unchanged. No other job/workflow, Dockerfile, production/schema, dependency, fixture,
test, profiling framework, algorithm, UI or policy change is allowed. All completed
capabilities and prior maintenance remain history; active edits are the one scalar
in that CI file. Require all actual final-head CI gates to finish successfully,
including backend generator checks and packaging. Prior successful receipts for
identical code remain valid evidence, but cancelled or unexecuted checks are not
complete. Return a different provider defect to the coordinator rather than
broadening this correction.

No new fixture family, generator, workflow, browser relaxation, production interface,
algorithm, threshold or UI layout/component is authorized. Existing generator
provenance, contamination checks and QA budgets remain. All owned tests and complete
integration, browser, public-tree and packaging gates remain required; a maintenance
pass is not a substitute for those gates. No real data is involved.

### Lifecycle and integration interface (owner: lifecycle/API boundary)

Keep the single semantic owner in `watched_change.py`. Add
`reconcile_follow_up(store, *, now, recorded_at)` for an already reserved
`follow_up_transaction`; it derives candidates with the existing detection and
canonical-id owners, saves first-observed records/actual Plan matches, computes
needed ending comparisons, and updates the frontier and Focus statuses together.
It returns the common `admission` verdict, never commits or bumps cache itself.
Add `follow_up_admission(store, *, now)` as its read-only projection. Its result is
`{state, reason, active_kind, active_id, maturity, can_finish_trial, focus_pin,
ending}`, where `focus_pin` contains `available, reason`. A read whose captured
input has not been reconciled returns unavailable admission, never quiet or
permission. The Store frontier interface above retains the last reconciled input
revision, including an empty-candidate reconciliation.

The API owns authentication, backend guidance capture, durable request retry/error
translation and post-commit cache invalidation. It consumes the Store and
comparison interfaces above. `active_watched_change`, Verify, guidance and pin
adapt the same verdict; they do not make independent eligibility decisions.
The ingestion completion path and pre-mutation path invoke the same reconciliation
inside the Store transaction. Run only committed synthetic ingestion mocks in
tests; do not exercise a live pull. Cache invalidation follows the outer commit,
including a committed ingestion followed by failed reconciliation; failed ending
transactions publish no partial lifecycle state. Readers cannot serve an old
admission after input revision changes.

This owner alone integrates the HTTP routes, guidance precedence, legacy adapters,
fetch completion and history rosters. It runs the complete merged verification;
failures in provider-owned files return to that same provider worker. It does not
patch those files itself. Extend `scripts/check_guidance_plan_contract.mjs` to
check the backend deliverable and actual schedule comparison against `frontend/plan.js` using manufactured
split/merged boundaries, pump precision, whole-profile and captured-block cases.
This extends the existing executable parity check without a committed capture.

The coordinator owns only parent task checkbox bookkeeping and
collection/review/PR delivery, not missing integration code.

## #389 desktop build contracts

The four production chunks of the v2 desktop, their owned source, and the exact
interfaces they publish to each other. **Every chunk acquires this section
directly from the pinned commit; no chunk depends on another chunk's prose.**

Two kinds of statement appear below and are marked as such:

* **Fact** — verified in the current tree at base
  `5950bd378e15dfa968125d23e1924bec30b54860`.
* **Proposed** — an interface this ticket creates. Its name and shape are fixed
  here so consumers can be written against it, but nothing in the tree has it
  yet.

**Implementation may run concurrently; integration remains ordered.** On
2026-09-08 Connor requested parallel builds after chunk 1 published its desk
interfaces. Chunks 2 and 3 build their owned features in isolated worktrees from
that committed desk while chunk 1 completes its corrections. Each owns its
feature files and adds only its own client exports, QA recipes, tests and replay
stories to shared files. Integration takes corrected chunk 1, then chunk 2, then
chunk 3; combined QA output is regenerated from the combined recipes.

Chunk 3 owns the final Changes composition, calling chunk 2's exported
`mount(host, deps)` Plan entry and its own follow-up/history entries according to
backend state. Temporary Changes registrations in the isolated builds become one
registration before acceptance. The interfaces below remain the composition
contract; no extra registration machinery is required. Acceptance, review and the
human merge boundary are unchanged.

### Chunk 1 — the desk, its shared contracts, and delivery

Owns the shell, the persistent chrome, all four destinations **including Day**,
**all utilities**, the route and return state, the keyboard/focus/Escape
behavior, the authenticated client, and the delivery and packaging inputs.

**Fact — existing modules this chunk extends, never replaces.**

| Module | Existing public interface | This chunk's use |
|---|---|---|
| `frontend/data.js` | `makeDeps({fetch})` factory plus bound `fetch*`/`save*` exports; Bearer token read from `localStorage['ciq_token']` | add the guidance, preference, plan, focus and trial reads and writes as further exports in the same idiom. This is the ONE authenticated client; a second client is a duplicate implementation and a blocking finding |
| `frontend/tab-routing.js` | `TABS`, `resolveTab`, `parseRoute`, `serializeRoute`, `writeRoute`, `subscribeRoute` | the ONE routing owner. v2 route state extends these; no second router |
| `ciq_autotune/api.py` | `SPA_PAGES`, the `/` and per-page routes, the prefix-scoped `/assets` mount, and the cache-control middleware keyed on that page list | add the `/v2/` page route and the `/v2/assets/` mount, keeping the non-API route set closed |
| `frontend/built-shell.js` | `createBuiltShell({dist})` returning `{serve(pathname)}` over `PAGE_PATHS` and `/assets/` | extend to the v2 output so the disk-serving harness and the Python policy agree |

**Proposed — interfaces chunks 2 and 3 consume.** Names are fixed here; the
shapes are the minimum needed and no larger.

* `frontend-v2/routes.js` — `registerDestination({id, title, mount})` and
  `navigate(id, context)`. `context` carries `{date, subject, occurrence,
  window, lever, from, focus}` for a contextual entry and is empty for a direct
  one. Consumers: chunks 2 and 3 register their destination content and call
  `navigate('day', context)` for every contextual Day entry.
* `frontend-v2/day.js` — `openDay(context)` and `dayReturnTarget()`. Chunk 1
  owns the Day desk, its chronology, week ribbon, month, statistics and Episode
  Log, and owns restoring the caller's exact focus target on return. Chunks 2
  and 3 supply `context` and never re-implement Day.
* `frontend-v2/utilities.js` — `openUtility(kind, launcher)` and
  `seatUtility(destination)`, `kind` being one of the served utilities. Chunk 1
  owns every utility pane and the Escape/launcher-focus behavior. Chunk 2 places
  the Pump settings entry point inside Changes and calls `openUtility('pump', …)`.
* `frontend-v2/client.js` — a thin re-export of the `frontend/data.js` functions
  this surface uses, so a component imports one module and the client stays
  single-sourced. It adds no fetching of its own.

**Owns these paths.** `frontend-v2/` shell, routes, day, utilities and client;
`vite.config.mjs` and the second v2 build config; `package.json`;
`package-lock.json`; `tsconfig.json`; `ciq_autotune/api.py`;
`frontend/built-shell.js` and its test; `frontend/data.js` and its test;
`frontend/tab-routing.js` and its test; `tests/test_frontend_asset_routes.py`;
`tests/test_deploy_assets.py`; `Dockerfile`; `scripts/public_allowlist.txt`;
`AGENTS.md`.

### Chunk 2 — the selected concern, its evidence, and Plan

Owns Overview's guidance and set-aside, Explore's roster, comparison cohorts,
case file and all 48 basal slots, the three setting evidence families, and the
complete Plan lifecycle.

**Fact — existing modules this chunk reuses, never re-implements.**

| Module | Existing public interface | This chunk's use |
|---|---|---|
| `frontend/plan.js` | `buildDeliverable`, `collapseDeliverable`, `reconcileDeliverable`, `deliverableSegmentCount`, `effectivePlanItems`, `detectOnPump`, `formatStartMin`, `segmentAt`, `PLAN_PARAMS`, `PLAN_FAMILIES`, `PARAM_PRECISION`, `PARAM_LABEL` | the Plan owner. Schedule construction, collapsing, reconciliation, rounding and the single-family rule come from here |
| `frontend/diagnose-event-comparison.js` | `renderEventSurface(surface, caseFile, hosts)`, `eventComparisonChartOption`, `eventComparisonGlucoseValues`, `glucoseRange`, `caseFileSelectionCohort` | the event-comparison mount, its cohorts, support labels and cursor |
| `frontend/diagnose-evidence-charts.js` | `DIAGNOSE_EVIDENCE_CHARTS` | the evidence chart registry |
| `frontend/diagnose-findings-queue.js` | `TIER` | the ranking vocabulary, rendered verbatim |
| `frontend/diagnose-workstation-chart.js` | `GRID` | chart geometry |
| `frontend/day-hero-chart.js` | `buildHeroOption`, `HERO` | the day figure beside an occurrence |
| `frontend/scenario-chart.js` | `scnBuildEpisodeOption` | the episode figure |

**Fact — `deliverableSegmentCount` is the NUMERATOR only.** No capacity constant
is exported today. HV2-21 forbids a memorized capacity, so if a denominator is
needed it is added to `frontend/plan.js` as a shared representation used by v1
and v2 alike — never a private v2 fork.

**Proposed.** `frontend-v2/overview.js`, `frontend-v2/explore.js` and
`frontend-v2/plan-view.js`, each exporting `mount(host, deps)` and registered
through `registerDestination` from chunk 1. They call `navigate('day', context)`
for a contextual Day entry and `openUtility('pump', …)` for Pump settings; they
implement neither.

**Owns these paths.** `frontend-v2/overview.js`, `frontend-v2/explore.js`,
`frontend-v2/plan-view.js` and their tests; `frontend/plan.js` and its test.
Adds its own client functions to `frontend/data.js` in that module's idiom.

### Chunk 3 — follow-up, endings and history

Owns the setting Trial and the behavioral Focus, their readiness rendering,
endings, preemption and the history record.

**Fact — the backend interfaces this chunk reads, corrected and pinned.**

* Follow-up routes: `GET /api/verify/trials`,
  `POST /api/verify/trials/{trial_id}/finish`, `GET`/`POST /api/focus`,
  `POST /api/focus/{focus_id}/resolve`.
* Readiness is TWO fields. `selected.readiness` is watch-maturity copy —
  lifecycle metadata, never an evidence criterion. Type-specific evidence
  readiness lives only under
  `selected.reassessment.comparison.readiness.{before,after}` at
  `assessment=retained`.
* Pre-ready values need a SECOND request: an active Trial or Focus has no
  ending, so `selected.original.assessment` is
  `{state:"unavailable", reason:"not_recorded"}`, and `assessment=retained` is
  rejected with 422 unless `selected` is supplied.
* The arms differ. Setting arms carry `{unit, required, observed,
  contributing_dates, criterion_met, reason, available, elapsed_days}`. The Focus
  override OMITS `available` and `required` and carries `{unit, observed,
  measured, unmeasured, elapsed_days, required_elapsed_days: 14, criterion_met,
  contributing_dates, reason}`.
* `comparison.assessment.state` is only `concerning`, `unclear` or `context`;
  favourable exists per outcome row only.
* `admission.state: unavailable` has exactly one reason,
  `reconciliation_required`. An active Trial or Focus keeps `state: available`
  and moves that fact into `reason`.
* `pinnable` is the lever universe, not permission; permission is
  `admission.focus_pin.available` only. `availability.reason` is an open
  provider-owned field, rendered verbatim.
* Trial finish requires durable fields; Focus resolve keeps a legacy bodyless
  branch, so a v2 client sending durable fields gets idempotent retries on a
  closed Focus. That is legacy compatibility, not an asymmetry to design around.
* Watch 14-day maturity and 28-day expiry are retained lifecycle metadata, not a
  comparison cutoff.

**Fact — existing chart modules this chunk reuses.**
`frontend/verify-workstation-chart.js` exports `heroOption`, which draws the
Before → Trial comparison; the Focus progress figure uses the same module.

**Proposed.** `frontend-v2/follow-up.js` and `frontend-v2/history.js`, each
exporting `mount(host, deps)` and registered through `registerDestination`. They
call `navigate('day', context)` for a supporting night's Day entry.

**Owns these paths.** `frontend-v2/follow-up.js`, `frontend-v2/history.js` and
their tests. Adds its own client functions to `frontend/data.js` in that
module's idiom.

### Chunk 4 — generated evidence, the shared repair, and the close

Owns the synthetic generators this surface needs, the shared-renderer repair, the
built-app proof, the packaging proof, and the atomic close of the port.

**Fact — one generator is extended, the other is frozen evidence.**
`mockups/harmonic-v2.exploration/generate.py` produces the six retained v2
synthetic inputs and has a `--check` drift step at `ci.yml:47`. Those bytes are
the frozen evidence the behavior contract was proved against: **no chunk edits
them or their generator**, and that `--check` must keep passing untouched.
Scenario support for the built surface is added instead through
`scripts/qa_e2e_cases.py` and `scripts/gen_qa_e2e_db.py` — this repository's
existing manufactured-case path, with its own `--check` at `ci.yml:67` and its
recorded budgets. A new generator is added only where that path genuinely cannot
reach a scenario, and never one per scenario: the lock's twelve fixture
obligations are scenario obligations. Chunk 4 owns the final coverage pass and
the drift gates; the per-chunk extension rule is in the verification-ownership
section below.

**Fact — the shared repair and its coupled expectations.** HV2-32's
fractional-hour speech comes from the private `axisLabel` in
`frontend/diagnose-event-comparison.js`, which feeds both the chart axis and the
accessible readout. That module is shipped v1, so the repair changes v1 too:
`frontend/diagnose-event-comparison-behavior.replay.mjs` pins the current spoken
string, and `mockups/finding-evidence-routing.behavior.md` carries the Event S8
entry. Both are amended in this ticket with the actual changed presentation.

**The port close is atomic and is this chunk's, as a bounded exception.** Once
the app-opener replay leg is green and fidelity is recorded, and only then, this
chunk performs the minimal archival operation: move the locked prototype and its
companion modules under `mockups/harmonic-v2.archive/`, keeping the ★ LOCKED
header and every byte of the retained design and fixture evidence; delete the
prototype-only CI leg; and flip the `mockups/INDEX.md` row from `locked` to
`shipped` with the archive path recorded. A follow-up issue for any of the three
is forbidden — that is exactly how a surface ends up merged but still `locked`.
This exception covers the archival move only; it authorises no edit to the
prototype's content, no v1 retirement and no root-route cutover.

**Polish is an executable step inside this chunk's workflow, not a note.** After
the built surface is green and before the pull request opens, a Fable 5.1 /
medium pass runs over the BUILT surfaces with actual rendered evidence. It may
edit only presentation: `frontend-v2/**/*.css` and the class and copy attributes
of the v2 components. It may not change behavior, selectors used by the replay,
served values or any module under `frontend/`. Any defect it finds that needs a
behavioral fix is handed back to the owning Opus worker for that chunk; the
polish pass does not fix it. Every change it does make is re-verified by
re-running the replay at both sizes and re-recording the affected fidelity rows.

**Owns these paths.** `mockups/harmonic-v2.exploration/generate.py`;
`scripts/gen_qa_e2e_db.py`; `frontend/diagnose-event-comparison.js` and its test;
`frontend/diagnose-event-comparison-behavior.replay.mjs`;
`mockups/finding-evidence-routing.behavior.md`;
`mockups/harmonic-v2-desktop.behavior.md`;
`frontend/harmonic-v2-desktop-behavior.replay.mjs`;
`mockups/sweep/harmonic-v2-desktop/`; the archive path above;
`mockups/INDEX.md`; `.github/workflows/ci.yml`.

### #389 verification ownership: the app opener, the app stories, and test discovery

The frozen replay is one shared artifact that four chunks each extend and integrate in order.
Without the rules below a chunk is asked to prove behavior it does not own, and
new tests are written where no runner looks. Both were reproduced; this section
is the fix, and every chunk acquires it from the pinned commit rather than from
a sibling fence.

**The app opener is chunk 1's, and it is real.** `openApp()` in
`frontend/harmonic-v2-desktop-behavior.replay.mjs` currently takes no arguments
and throws unconditionally, so **every** `TARGET=app` invocation fails today
regardless of what is built. Chunk 1 replaces that stub with a working opener
against the packaged `/v2/`, matching the existing mock opener's contract: exact
external-request routing with no catch-all, loud failure on an unstubbed
request, an assertion that the rendered state equals the requested one, and
fail-closed behavior when the surface, an asset or a fixture is missing. Until
chunk 1 lands, no chunk can run an app-target story; after it lands, every chunk
can run its own.

**Each chunk converts its own app-opener-only stories, and only those.** The
eighteen stories that never passed on the prototype are owned as follows. A
chunk converts its own `deferred(...)` entries into shared story functions and
runs them with an explicit `ONLY=` selection; it never runs a later chunk's
journey stories to prove its own capability.

| Chunk | App-opener-only stories it converts and proves | Terms |
|---|---|---|
| 1 | `S86`, `S87`, `S73b`, `S80b` | HV2-01, HV2-02, HV2-32 (the two caller-supplied focus targets) |
| 2 | `S88`, `S89`, `S90`, `S97`, `S98`, `S99` | HV2-16, HV2-20, HV2-21, HV2-29, HV2-30, HV2-31 |
| 3 | `S53`, `S91`, `S92`, `S93`, `S94`, `S95`, `S96` | HV2-22 through HV2-28 |
| 4 | `S100` | HV2-32 (the shared fractional-hour repair) |

Four plus six plus seven plus one is eighteen: the set is covered exactly, with
no story owned twice and none left to the coordinator.

**Shared replay edits are integrated in order.** Chunks 1, 2, 3 and 4 each edit
`frontend/harmonic-v2-desktop-behavior.replay.mjs`; concurrent builders add only
their own bodies and registrations in isolated worktrees, and the coordinator
integrates those additions in chunk order. Each uses the
module's existing idiom, and changes no other chunk's story, selector, opener or
assertion. **No frozen story is weakened, renamed or deleted**: converting a
deferred entry into a real one fulfils it, and any other change to a story goes
through the ledger's sanctioned amendment path.

**The independent verifier records the final verdicts.** Every chunk returns
its complete raw run output and fidelity artifacts; chunk 4 assembles the final
whole-contract evidence for that review. Builders mark only `ported`. The
independent verifier records the final ledger pass/fail statuses and named eye
judgments under UI Craft build, and the coordinator includes that reviewed
evidence in the PR. Chunk 4 carries the HV2-32 presentation amendment and its
coupled v1 Event S8 expectation. Human release acceptance remains task 3.5.

**Scenario support is extended before it must be proved, in the QA generator.**
The retained prototype fixtures under `mockups/harmonic-v2.exploration/` are
frozen evidence: their bytes are **not** modified by any chunk, and their
`--check` drift step must keep passing untouched. Where a chunk needs a scenario
the existing offline database does not serve, it extends
`scripts/qa_e2e_cases.py` and `scripts/gen_qa_e2e_db.py` — the repository's
existing manufactured-case path, with its recorded budgets — **in the same chunk
that must prove that behavior, before it proves it**. That generator is a shared
contract integrated in chunk order: a chunk adds only the cases its own stories need,
never a case per assertion and never a second generator. Chunk 4 owns the final
scenario coverage pass and the drift gates. Where an existing case already
serves a scenario, it is used as-is. The generator-owned output
`mockups/qa-e2e.synthetic/harmonic.sqlite` is in each such chunk's allowed diff
and changes only by running its generator, never by hand.

**Test discovery covers both source roots.** The fast gate is
`node --test 'frontend/**/*.test.js'` in `AGENTS.md` and at `ci.yml:140`, and it
does not see `frontend-v2/`. Chunk 1 extends that command, in `AGENTS.md`, in
CI and in the whole-ticket verification, to
`node --test 'frontend/**/*.test.js' 'frontend-v2/**/*.test.js'`. Browser suites
are never discovered by a glob in this repository — they are hand-listed matrix
entries — so v2 browser tests are named `frontend-v2/**/*.browser.test.mjs` and
get their own explicit CI matrix step. Chunk 1 establishes that wiring with the
new source root; chunks 2, 3 and 4 extend it with their own suites. **A passing
pre-existing `frontend/` suite is not coverage for new v2 interfaces**, so each
chunk's own `Done when` names its own new tests, and the runners and
fail-closed pattern are the ones this repository already uses.

### One rule, one place

Where a rule already exists elsewhere in this document or in the lock, it is not
restated above. The 34 lock terms live in
`mockups/harmonic-v2-desktop.lock.md`; the frozen behavior stories and their 17
sanctions live in `mockups/harmonic-v2-desktop.behavior.md`; the backend
identity, admission, period and population rules live in the `#387
implementation interfaces` section of this document. This section adds only the
chunk ownership and the interfaces between them.
