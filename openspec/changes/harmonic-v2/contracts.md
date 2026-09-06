# V2 contract proposal

Planning under #348. These are the minimum additions implied by the agreed
journeys, for review before implementation. They do not change the existing API,
schema, clinical policy, or active-watch behavior in this branch. The ADRs in
[design.md](design.md) own the settled product decisions; this document proposes
the interfaces that would implement them. [evidence.md](evidence.md) records
verbatim command output and executed producer checks for the current facts.

## One next step

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

Active-watch precedence is Q6. The pending-Plan and draft ordering is proposed
for walkthrough validation. The returned selection needs its canonical subject,
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

Store one bounded context at a decision and one bounded assessment at an ending.
Retain existing Plan, Trial and Focus identities. This is not an event archive,
a full database snapshot, or a snapshot on every refresh.

| Record | Minimum addition | Existing authority and constraint |
| --- | --- | --- |
| Applied Plan | Decision explanation, evidence window/revision, selected action and relevant support/unknowns | Extend the existing applied Plan row. Draft save remains consideration; apply records intent and does not operate the pump |
| Plan to Trial relationship | The actual matched decision reference, when established | Expose the existing Plan row identity if needed. Do not treat temporal proximity, a deliberate flag, or matching parameter alone as a proven link; use the retained schedule reconciliation rules |
| Trial first observed without a Plan | Observation time and context available then | Keep detected change time separately. No fabricated earlier decision or retrospectively claimed snapshot |
| Finished Trial | Canonical Trial identity, ending kind/time, user conclusion when provided, final available assessment and its periods/limits | One backend finish/admission authority shared by active selection, review, and the Focus guard. A finished Trial stays finished after refresh |
| Started Focus | Original action/explanation, support/unknowns, evidence window/revision | Extend the existing Focus row. Its stored id and lever remain authoritative; the current title is derived at read time and is not a historical snapshot |
| Ended Focus | Ending kind/time, user conclusion for manual resolution, final available adherence and outcomes | Manual resolution and Trial preemption remain different endings. Preemption never supplies a user conclusion and does not imply a successful behavior change |

A bounded snapshot contains the displayed decision or assessment, its units,
periods, support counts, limitations, source identities and a representation
version. Raw glucose/insulin history stays in the existing store. Subsequent
recalculation is a separate read; it cannot overwrite what was known then.
Missing legacy context or ending times remain unavailable. An ending caused by
expiry or superseding pump data must not acquire a successful conclusion.

Current source facts: Plan storage exposes applied time and items but not its
SQLite row id (`store.py:1084–1106`). Focus persists id, lever, pinned time and
status, without end time (`store.py:1110–1152`). Verify's `_review_id`
(`watched_change.py:1047–1059`) derives identity from parameter, slot, change time,
and the captured end boundary for a block-bound carb-ratio Trial. Preserve that
specificity when reconciling the active singleton and review roster; an unrelated
frontend key would create a third watch authority.

The finish operation must check the current backend maturity/admission verdict,
record the ending, and release the watch together. Ordinary retry must return the
already recorded ending rather than reopening or duplicating it. A new detected
pump change can create a new Trial; an older historical candidate cannot move
forward merely because the latest Trial was finished. No Focus maturity gate is
added: Q9 governs Trial readiness, and existing Focus resolution is user-directed.
All new writes follow cache invalidation rules; the Plan-draft exception is not
extended by analogy.

## Follow-up periods

`summarize_trend` returns fixed-width periods ending at the selected data tail;
they are not automatically bounded by a Focus pin time. Each Focus chart must
show those actual periods. A view titled “since starting” needs a deliberately
implemented period contract first. Show attributed events and eligible
opportunities separately from glucose outcomes. A zero opportunity denominator
means unavailable adherence, even if the current serialized rate is zero.

A manufactured correction-on-active-insulin check also found that initial
Diagnosis and Focus attribution are not interchangeable today. On the unchanged
QA records, the scenario path reports two of five lows while the fixed-profile
trend reports zero of five. `build_scenarios` obtains an effective correction
factor from its analyzer/settings composition; `summarize_trend` deliberately
holds the programmed profile correction factor fixed. The fixture supplies 0 and
40 respectively. This is a demonstrated inference-context difference, not
observed adherence improvement. Before that habit journey ships, settle one
coherent comparison context and preserve ADR 131's reason for avoiding parameter
drift in behavioral follow-up. The over-treated-low walkthrough agrees at two
of six across the current paths; it does not discharge the correction-family gap.

Historical reads must not call the active resolver just to inspect past work:
that resolver can drop a Focus when a Trial preempts it. Reuse read-only evidence
production and the stored ending. Do not reconstruct an ending window from a
legacy status that never stored its date.

## Set aside and return

Persist the canonical priority subject, optional reason, decision time, and the
action/seriousness state the user set aside. Guidance consumes this preference;
the existing audit-dismissal table is not already consumed by the Findings queue.

Keep it aside through ordinary evidence refresh. A return needs a reviewed,
versioned determination that the recommended action or seriousness materially
changed, plus a plain explanation of that change. A raw evidence fingerprint,
small count fluctuation, or a new analysis generation alone is insufficient.
The numerical comparison policy is unresolved; settle it through representative
cases before the dependent feature ships. The user can explicitly revisit or
restore the concern at any time.

## Reuse and delivery boundaries

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
