# V2 findings ledger design

This change is in triage. Its inherited revise contract is frozen in the behavior ledger; independent review precedes posting an execution lock.

## ADR 404 — Retain expiry and record a late conclusion separately

### Decision

Keep the existing 28-day Trial expiry. Changes makes the expired Trial prominent and keeps its record reachable. Allow the reader to record a separately dated late conclusion. Preserve the original ending kind, effective time and saved ending assessment; a late conclusion is an addition to the record, not a replacement ending or a resumed watch. Existing admission of another watch remains governed by the recorded expiry.

### Authority

Connor Griffin, 2026-09-10 local time, answered triage Q1: “Keep the expiry; surface the record and allow a late conclusion (Recommended).” The question explicitly proposed a separately dated late conclusion and contrasted it with retaining an active watch beyond 28 days.

### Consequences

The reader can understand why a watch ended and record their conclusion later. The implementation must keep the original ending distinguishable from the later statement. This decision does not reopen already expired records as active, change the maturity rule, rewrite prior assessments, or operate the pump. The durable-follow-up and surfaces deltas define the operation and placement; they require independent review before the execution lock.

## ADR 404 — Recalculate Patterns for the selected clock window

### Decision

Recalculate Pattern counts and membership in the backend for the selected named or custom clock window. Pattern rows must describe that selected scope. Keeping whole-day counts with a cropped chart is insufficient.

### Authority

Connor Griffin, 2026-09-10 local time, answered Q2: “Recalculate Pattern counts and membership for the selected window; this needs broader backend changes.”

### Consequences

The active Pattern roster, served counts, membership and chart evidence need one coherent selected-window contract. Keep existing producer ownership and explicit denominators; do not make the frontend recompute attribution or clinical policy. Pattern admission and Focus entry must use the same selected scope; the Focus retention decision below governs follow-up. The producer grounding below informs the selected-window contract. This decision does not authorize rewriting saved historical contexts.

## Reassessment loading

Connor Griffin answered Q3: “Show named loading; compute reassessments when opened (Recommended).” Historical reassessments remain on demand. The surface immediately names the work being loaded and keeps retained/current identity clear. #404 adds no reassessment prewarming to the hourly fetch path.

## Footer and historical naming scope

Connor answered Q4: “Keep those values only in Pump settings.” Do not restore current programmed correction factor or carb ratio in the footer.

For Q5 Connor said to deal with historical Pattern naming when/if it happens. Defer Focus-title persistence and legacy title migration from this change; the report remains recorded on #404. The coordinator clarified that the current fallback can also result from a Pattern leaving current results.

### Risk contract

- **Must prevent:** secret exposure; irreversible loss of authoritative data; silent incorrect success; real-data or vendor fetch in automated work; classifier-policy change; mutation of an original ending, expiry, or legacy computation semantics; and presenting stale scope or selection as current.
- **Must recover:** only the already-specified stale response rejection, cache invalidation, and read convergence; no new automatic recovery is introduced.
- **Accepted failure:** a rare local browser, server, network, or tool failure clearly stops for a manual rerun after owned cleanup; it never passes or silently skips.
- **Unsupported:** live vendor or pump writes, Focus-title migration or legacy-title backfill, legacy-window backfill, and excluded footer behavior.
- **Evidence owed:** public Focus/history and finding-case-file interfaces; preserved immutable-ending, expiry, legacy-scope, producer-owned-policy, and stale-response invariants; and the newly observed selected-evidence, geometry, loading, and retained regression assertions.
- **Why:** selected-window findings and durable follow-up are advisory, persisted, and rendered through a shipped surface, so bounded failures and existing safety/identity guarantees must remain explicit.
- **Disposition:** inline; copied unchanged to `openspec/changes/v2-findings-ledger/design.md` as the admitted implementation authority.

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

## Execution ownership

Three serial chunks carry the source: scoped Pattern population and projection;
durable Focus context and Trial history; then the shipped surface and synthetic
integration proof. The scoped population is one backend contract consumed by
Focus admission and chart evidence. The follow-up chunk owns saved scope and
additive conclusions. The surface chunk consumes those contracts without
recomputing membership or policy. Sequential overlaps in api.py and the v2
state/rendering files are intentional; none of these chunks runs concurrently.

The execution envelope supplies the closed file allowlists and selected task
and acceptance slices. The checklist's Document ownership section supplies the
contract amendment responsibilities; existing base specs fold from these deltas
only through the established archive workflow.

Chunk 1 exclusively owns the finding-case-file producer handoff: its existing
response carries `projection` (including cohorts), `summary`, `occurrences`, and
`selection.detail`, with served identity, glucose, markers, and labels. It owns
the scoped Pattern payload, any bounded generic short label, and the projection
fixture/mirror. Chunk 3 only consumes that response for rendering and state; it
does not derive membership or policy, redefine the response, or add a second
API. A producer defect found during serial surface integration returns through
the coordinator to chunk 1 after the serial state is preserved.

The slicing traits are multiple deliverable artifacts, a required live run,
and shipped-surface revision. Nearby slicing calibration was absent. Projected
worker context is approximately 145k, 160k and 170k respectively, including
fixed workflow overhead; these are estimates, not measured historical peaks.
The generated mirror is already compared with producer fixtures by one test,
so lockstep copies without a common check does not add a fourth slicing trait.

### Rendered baseline qualification

The coordinator reproduced the selected Pattern trace/marker gap, rail-width
mismatch, action label order and meal-cohort collision at both supported sizes.
The actual focal header overrides the generic centering CSS and already anchors
its expansion control near the top; preserve that placement while verifying
other states and control density. The scope ledger owns the detailed receipts.
This draft does not convert a requested fix into a passing baseline story.
