# Plan

## Purpose

A Plan is the user's staging area to review and edit one proposed pump-setting change before deciding whether to apply it. The Plan is advisory: Harmonic recommends changes but never enacts them on the pump. Users review a proposed profile, may hand-edit it, and choose to apply it — which records their decision in apply history but does not send anything to the pump. After the user keys the settings into their pump manually, Harmonic reads the next fetch to confirm the pump matches what was planned.

## Requirements

### Requirement: A Plan holds exactly one tuning variable at a time

A Plan may contain multiple segments only when they are all changes to the same tuning variable (basal rate, ISF, I:C, or target). A Plan that stages a basal change cannot simultaneously stage an ISF, I:C, or target change. Attempting to stage a different variable clears the Plan of the prior variable.

### Requirement: Only recommendations with asserts_move true may be staged

The analysis layer marks each tuning recommendation with an `asserts_move` predicate. Only recommendations with the exact boolean `asserts_move = true` may be staged into the Plan; a missing legacy field fails closed. The analysis layer, not the Plan UI, owns the decision about what holds and what stages — the Plan does not re-derive this gate from a recommendation, direction, interval, or evidence count.

### Requirement: A draft persists unsaved changes locally

Saving a draft records the user's current accepted changes (staged recommendations and hand-edits) in the local database, preserving them across page reloads. Saving a draft does NOT invalidate any cached analysis results — it is a UX-only convenience. Draft saves never trigger a re-analysis.

### Requirement: Applying a plan records the applied changes in history

Applying a plan records the effective changes (the user's accepted picks plus any hand-edits) in a time-stamped apply-history entry. Applying does not send anything to the pump; it only records that the user committed to these changes. Applying does invalidate cached analysis because the history entry is now part of the user's data.

### Requirement: Apply history holds a record of every applied plan

Apply history is a time-ordered log of every plan the user has applied. Each entry carries an applied timestamp and the list of items that were in effect. History is read-only and serves as a reference for what changes have been decided.

### Requirement: The deliverable is a unified 4-parameter schedule built from the active profile plus accepted changes

The pump-ready deliverable is constructed by starting with the pump's currently-active profile, applying each accepted recommendation as a change, merging hand-edits, and collapsing adjacent rows that carry the same values. The deliverable represents exactly what the user would need to key into their pump. Hand-edits override accepted recommendations; accepted recommendations override the active profile.

### Requirement: Reconciliation compares the planned deliverable against the detected active pump profile

After the user keys settings into their pump and a new data fetch arrives, Harmonic compares the pump's active profile to the planned deliverable. If they match (cell-by-cell after per-parameter rounding), reconciliation marks the plan as "confirmed on pump." If any cell diverges, reconciliation reports a mismatch showing the planned versus actual values so the user can identify and correct any keying errors.

### Requirement: Direction-only ISF recommendations cannot be staged

An ISF recommendation that carries only a direction (no `recommended` value) may not be staged into the Plan because the Plan requires a concrete value to program. A harm-owned ISF weakening is direction-only and remains advisory only, never reaching the Plan. A row with no programmed value, a rounded recommendation equal to current, an explicit false verdict, or no verdict also cannot stage, even if it carries a stale-looking recommendation or an asserted direction.

### Requirement: A stageable fasting ISF applies to every programmed ISF segment

ISF analysis produces one fasting recommendation while the pump stores a segmented
ISF schedule. When that analyzer row carries `asserts_move = true`,
staging applies the unchanged capped recommendation to every currently programmed
ISF segment. Plan does not recalculate, distribute, or otherwise alter the value.
