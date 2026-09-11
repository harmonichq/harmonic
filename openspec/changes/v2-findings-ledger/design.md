# V2 findings ledger design

This change is in triage. No execution lock or implementation admission exists yet.

## ADR 404 — Retain expiry and record a late conclusion separately

### Decision

Keep the existing 28-day Trial expiry. Changes makes the expired Trial prominent and keeps its record reachable. Allow the reader to record a separately dated late conclusion. Preserve the original ending kind, effective time and saved ending assessment; a late conclusion is an addition to the record, not a replacement ending or a resumed watch. Existing admission of another watch remains governed by the recorded expiry.

### Authority

Connor Griffin, 2026-09-10 local time, answered triage Q1: “Keep the expiry; surface the record and allow a late conclusion (Recommended).” The question explicitly proposed a separately dated late conclusion and contrasted it with retaining an active watch beyond 28 days.

### Consequences

The reader can understand why a watch ended and record their conclusion later. The implementation must keep the original ending distinguishable from the later statement. This decision does not reopen already expired records as active, change the maturity rule, rewrite prior assessments, or operate the pump. The late-conclusion operation and placement in Changes remain to be specified and reviewed within this change.

## ADR 404 — Recalculate Patterns for the selected clock window

### Decision

Recalculate Pattern counts and membership in the backend for the selected named or custom clock window. Pattern rows must describe that selected scope. Keeping whole-day counts with a cropped chart is insufficient.

### Authority

Connor Griffin, 2026-09-10 local time, answered Q2: “Recalculate Pattern counts and membership for the selected window; this needs broader backend changes.”

### Consequences

The active Pattern roster, served counts, membership and chart evidence need one coherent selected-window contract. Keep existing producer ownership and explicit denominators; do not make the frontend recompute attribution or clinical policy. Pattern admission and Focus entry must use the same selected scope; the Focus retention decision below governs follow-up. Producer details still require grounding before the execution lock. This decision does not authorize rewriting saved historical contexts.

## Reassessment loading

Connor Griffin answered Q3: “Show named loading; compute reassessments when opened (Recommended).” Historical reassessments remain on demand. The surface immediately names the work being loaded and keeps retained/current identity clear. #404 adds no reassessment prewarming to the hourly fetch path.

## Footer and historical naming scope

Connor answered Q4: “Keep those values only in Pump settings.” Do not restore current programmed correction factor or carb ratio in the footer.

For Q5 Connor said to deal with historical Pattern naming when/if it happens. Defer Focus-title persistence and legacy title migration from this change; the report remains recorded on #404. The coordinator clarified that the current fallback can also result from a Pattern leaving current results.


## ADR 404 — Retain the selected outcome window in Focus

### Decision

A Focus started from a Pattern filtered to a named or drawn clock window retains that window for eligibility and follow-up comparisons. The clock window selects the outcomes being investigated. Preserve the full contributing episodes as evidence, including context before the window. Use the same retained scope in Before and After comparisons; subsequent navigation or a changed Diagnose window does not modify the saved Focus scope.

### Authority

Connor agreed to the retained-window option in Q6, then corrected his illustrative reference from morning to evening. This confirmed the coordinator's explanation that an Evening Focus concerns the contributing behavior associated with evening outcomes, including episodes that began earlier.

### Consequences

The backend must validate admission and save the selected window with the Focus context. The served Pattern population, selected occurrence evidence and follow-up comparison must agree on outcome membership and explicit denominators. Preserve existing episode ownership, attribution and safety predicates. Ground the relevant outcome timestamp in each producer; an exposure anchor is not automatically the outcome landing. Preserve older saved contexts without inventing a selected window. This decision changes the scope of new Focus records, not their classifier thresholds or immutable prior endings.

## ADR 404 — Amend active contracts without rewriting their history

### Decision

This ordinary change owns the new requirements in its OpenSpec deltas. It amends
the active behavioral-layer requirement that says scoped queries omit a Pattern,
the active durable-follow-up contract, and the v2 surface contract. Historical
text in `openspec/changes/harmonic-v2/design.md` and
`openspec/changes/diagnose-finding-case-files/design.md` remains historical; the
implementation record must point to this ADR where prior wording is superseded.

### Consequences

The backend, not the browser, owns selected-window membership, denominators,
Focus admission and comparison scope. This ADR does not authorize a new
classifier threshold, a Focus-title migration, legacy-window backfill, or a
rewrite of old contexts.

### Q6 producer grounding

`over_treated_low` has consequence `high` while remaining in the `lows`
exposure family. Its exposure identity remains the Low's `t`; when attributed,
`WindowQuery.outcome_minute()` derives membership from same-episode High anchors.
The selected half-open clock window therefore includes the Low identity when its
rebound High landing is in scope, while an unattributed Low remains a denominator
opportunity under its own outcome rule. Preserve the identity and full episode
context independently from outcome membership. `max(landings)` is a clock-minute
calculation, not a chronological-across-midnight ordering guarantee.

The saved recurring clock filter is separate from the calendar Before/After
boundaries. New Focus comparisons apply the saved filter within their existing
calendar arms. Old Focus records retain their existing computation semantics:
they receive neither a guessed/backfilled scope nor a new blanket unavailable
state solely because that field is absent.

## Candidate routing rationale

Three serial chunks are proposed: (1) scoped Pattern population/projection/API;
(2) durable Focus scope plus Trial history lifecycle; and (3) shipped UI,
synthetic generation and runtime integration. Chunk 2 consumes Chunk 1's scoped Pattern contract for Focus admission; it owns
the saved Focus context itself. Trial late conclusions share persistence/API
files with that work, so they remain in the same lifecycle chunk without an
invented domain dependency.
The routing traits are Multiple deliverable artifacts, Live run inside ticket,
and Lifecycle-gated surface revision. No nearby reviewer-memory slicing anchor was available. These are planning observations only; the
coordinator owns final routing and review depth.

`ciq_autotune/api.py` is a sequential file overlap: Chunk 1 owns scoped Pattern
reads and case-file serving; Chunk 2 owns Focus/history writes and reads. The
shared `frontend-v2/diagnose.js`, `frontend-v2/history.js`, and
`frontend-v2/frame.js` overlap sequentially between Chunk 2's lifecycle state
and Chunk 3's rendering integration. No chunks run concurrently across these
files.

### Candidate inventory and checks

Chunk 1 owns `ciq_autotune/analyzers/scenario/levers.py`,
`ciq_autotune/analyzers/scenario/outcome_patterns.py`,
`ciq_autotune/explore_exposures.py`, `ciq_autotune/window_membership.py`,
`ciq_autotune/findings_projection.py`, `ciq_autotune/finding_case_file.py`,
`ciq_autotune/api.py`, `tests/test_outcome_patterns.py`,
`tests/test_explore_exposures.py`, `tests/test_findings_projection.py`, and
`tests/test_finding_case_file_api.py`. Its checks cover public scoped named,
custom and circular windows, outcome/antecedent boundary pairs, zero/thin
denominators, and scoped Pattern case evidence.

Chunk 2 owns `ciq_autotune/follow_up_comparison.py`, `ciq_autotune/store.py`,
`ciq_autotune/watched_change.py`, `ciq_autotune/api.py`,
`ciq_autotune/result_cache.py`, `frontend-v2/focus-entry.js`,
`frontend-v2/diagnose.js`, `frontend-v2/diagnose-context.js`,
`frontend-v2/history.js`, `frontend-v2/follow-up.js`, `frontend-v2/frame.js`,
`tests/test_follow_up_comparison.py`, `tests/test_follow_up_store.py`,
`tests/test_durable_follow_up.py`, `frontend-v2/focus-entry.test.js`,
`frontend-v2/diagnose.test.js`, `frontend-v2/diagnose-context.test.js`,
`frontend-v2/history.test.js`, `frontend-v2/follow-up.test.js`, and
`frontend-v2/frame.test.js`. Its checks cover saved-scope arms, unchanged legacy
contexts, stale admission, expiry plus additive-conclusion conflict/retry/cache,
and named reassessment loading.

Chunk 3 owns `frontend/diagnose-workstation.js`,
`frontend/diagnose-evidence-charts.js`, `frontend/diagnose-event-comparison.js`,
`frontend/diagnose-workstation.css`, `frontend-v2/desk.css`,
`frontend-v2/day.js`, `frontend-v2/plan-view.js`, `frontend-v2/diagnose.js`,
`frontend-v2/history.js`, `frontend-v2/frame.js`, `frontend-v2/c4.replay.mjs`,
`frontend-v2/c4.replay.test.js`, `scripts/gen_findings_projection_fixtures.py`,
`scripts/qa_e2e_cases.py`, `scripts/gen_qa_e2e_db.py`,
`frontend/__fixtures__/findings-projection.json`,
`mockups/findings-projection.mirror.mjs`, and
`frontend/findings-projection-mirror.test.js`,
`frontend/diagnose-event-comparison.test.js`,
`frontend/diagnose-evidence-charts.test.js`,
`frontend/diagnose-workstation.test.js`, `frontend-v2/day.test.js`,
`frontend-v2/plan-view.test.js`, `frontend-v2/replay-cases.mjs`,
`frontend/harmonic-v2-desktop-behavior.replay.mjs`,
`mockups/harmonic-v2-desktop.behavior.md`, `mockups/INDEX.md`, and
`mockups/qa-e2e.synthetic/harmonic.sqlite`. Its checks include per-family
selected handoff, race rejection, S101–S105, S100/keyboard regression, both
desktop widths, generated drift checks, and the coordinator's final serial live
proof. No screenshot result is claimed by this draft.


### Coordinator authoring checks

The source-writer's first draft omitted positional checklist tasks and necessary
file owners. Its revision fixed those classes; coordinator verification then
found that listing regression names still did not normatively require all their
repairs, and that the facts table had abbreviated command output. The coordinator
made the navigation, history and selected-trace acceptance explicit, corrected
chunk ownership prose, added the existing replay/ledger and generated-output
paths to the candidate inventory, and regenerated the facts appendix directly
from commands. These are authoring corrections, not an independent plan-review
verdict. No source admission or behavior freeze is claimed.


### Rendered baseline qualification

The coordinator reproduced the selected Pattern trace/marker gap, rail-width
mismatch, action label order and meal-cohort collision at both supported sizes.
The actual focal header overrides the generic centering CSS and already anchors
its expansion control near the top; preserve that placement while verifying
other states and control density. The scope ledger owns the detailed receipts.
This draft does not convert a requested fix into a passing baseline story.
