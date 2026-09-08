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
| Plan intent withdrawal | Applied Plan key, withdrawn time and optional user reason; original intent remains readable | New authenticated Plan-history withdrawal operation through Store; route spelling belongs to the build brief |
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
statistical/population authority remains #340 at
`1ee53b341192b0943c83aae94b47dc6b33c571e3`.

Adherence carries lever, numerator, named opportunity denominator, rate and
availability; `n=0` yields a null rate with an unavailable reason. `k=0,n>0` is an
observed zero unwanted-behavior rate. Outcomes use their own named denominators
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
contracts and the rendered limiting states reviewed. The exact migration and
endpoint shapes belong in subsequent execution locks, after product approval.


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
