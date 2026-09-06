# Plan

## Purpose

A Plan is the user's staging area to review and edit one proposed pump-setting change before deciding whether to apply it. The Plan is advisory: Harmonic recommends changes but never enacts them on the pump. Users review a proposed profile, may hand-edit it, and choose to apply it — which records their decision in apply history but does not send anything to the pump. After the user keys the settings into their pump manually, Harmonic reads the next fetch to confirm the pump matches what was planned.

## Requirements

### Requirement: A Plan holds exactly one tuning variable at a time

The system SHALL satisfy the following:

A Plan may contain multiple segments only when they are all changes to the same tuning variable (basal rate, ISF, I:C, or target). A Plan that stages a basal change cannot simultaneously stage an ISF, I:C, or target change. Attempting to stage a different variable clears the Plan of the prior variable.

#### Scenario: A Plan holds exactly one tuning variable at a time

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Only recommendations with asserts_move true may be staged

The system SHALL satisfy the following:

The analysis layer marks each tuning recommendation with an `asserts_move` predicate. Only recommendations with the exact boolean `asserts_move = true` may be staged into the Plan; a missing legacy field fails closed. The analysis layer, not the Plan UI, owns the decision about what holds and what stages — the Plan does not re-derive this gate from a recommendation, direction, interval, or evidence count.

#### Scenario: Only recommendations with asserts_move true may be staged

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: A draft persists unsaved changes locally

The system SHALL satisfy the following:

Saving a draft records the user's current accepted changes (staged recommendations and hand-edits) in the local database, preserving them across page reloads. Saving a draft does NOT invalidate any cached analysis results — it is a UX-only convenience. Draft saves never trigger a re-analysis.

#### Scenario: A draft persists unsaved changes locally

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Applying a plan records the applied changes in history

The system SHALL satisfy the following:

Applying a plan records the effective changes (the user's accepted picks plus any hand-edits) in a time-stamped apply-history entry. Applying does not send anything to the pump; it only records that the user committed to these changes. Applying does invalidate cached analysis because the history entry is now part of the user's data.

#### Scenario: Applying a plan records the applied changes in history

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Apply history holds a record of every applied plan

The system SHALL satisfy the following:

Apply history is a time-ordered log of every plan the user has applied. Each entry carries an applied timestamp and the list of items that were in effect. History is read-only and serves as a reference for what changes have been decided.

#### Scenario: Apply history holds a record of every applied plan

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: The deliverable is a unified 4-parameter schedule built from the active profile plus accepted changes

The system SHALL satisfy the following:

The pump-ready deliverable is constructed by starting with the pump's currently-active profile, applying each accepted recommendation as a change, merging hand-edits, and collapsing adjacent rows that carry the same values. The deliverable represents exactly what the user would need to key into their pump. Hand-edits override accepted recommendations; accepted recommendations override the active profile.

#### Scenario: The deliverable is a unified 4-parameter schedule built from the active profile plus accepted changes

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Reconciliation compares the planned deliverable against the detected active pump profile

The system SHALL satisfy the following:

After the user keys settings into their pump and a new data fetch arrives, Harmonic compares the pump's active profile to the planned deliverable. If they match (cell-by-cell after per-parameter rounding), reconciliation marks the plan as "confirmed on pump." If any cell diverges, reconciliation reports a mismatch showing the planned versus actual values so the user can identify and correct any keying errors.

#### Scenario: Reconciliation compares the planned deliverable against the detected active pump profile

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Direction-only ISF recommendations cannot be staged

The system SHALL satisfy the following:

An ISF recommendation that carries only a direction (no `recommended` value) may not be staged into the Plan because the Plan requires a concrete value to program. A harm-owned ISF weakening is direction-only and remains advisory only, never reaching the Plan. A row with no programmed value, a rounded recommendation equal to current, an explicit false verdict, or no verdict also cannot stage, even if it carries a stale-looking recommendation or an asserted direction.

#### Scenario: Direction-only ISF recommendations cannot be staged

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: A stageable fasting ISF applies to every programmed ISF segment

The system SHALL satisfy the following:

ISF analysis produces one fasting recommendation while the pump stores a segmented
ISF schedule. When that analyzer row carries `asserts_move = true`,
staging applies the unchanged capped recommendation to every currently programmed
ISF segment. Plan does not recalculate, distribute, or otherwise alter the value.

#### Scenario: A stageable fasting ISF applies to every programmed ISF segment

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: A staged I:C block's captured bounds carry an inclusive start and an exclusive end

The system SHALL satisfy the following:

An I:C plan row may carry an `ic_block_provenance` claim naming the programmed block it belongs to: `block_start_min`, `block_end_min` and `block_member_start_mins`. Those bounds describe the wrap-aware arc `[block_start_min, block_end_min)`. The start is inclusive and SHALL be an integer minute of day in `[0, 1440)`, as SHALL every listed member start. The end is exclusive and SHALL be an integer in `(0, 1440]`, so a block whose arc closes at midnight is expressed as `1440` and is valid on both draft save and apply. The arc SHALL NOT be empty: an end equal to the start is rejected. A block whose end is below its start wraps past midnight, which remains valid.

These bounds are the same domain the I:C history identity enforces, and the I:C analyzer publishes blocks inside it: a profile carrying one carb ratio all day is published as the single block `start_min` 0, `end_min` 1440, and it is stageable on those bounds like any other block.

#### Scenario: An all-day I:C block is staged on its exclusive end

- **GIVEN** an I:C block the analyzer publishes with `start_min` 0 and `end_min` 1440, whose members are every programmed segment start
- **WHEN** one row per member is saved to the plan draft, each carrying that block's provenance and one shared proposed value
- **THEN** the draft is accepted, applies, and reads back from apply history with its provenance unchanged

#### Scenario: A block bound outside its own domain is rejected

- **GIVEN** an I:C row carrying an `ic_block_provenance` claim
- **WHEN** its `block_end_min` is not an integer in `(0, 1440]`, or its `block_start_min` or any member start is not an integer in `[0, 1440)`
- **THEN** the save is rejected and no draft is recorded

### Requirement: A refused draft save leaves nothing staged

A change staged from Diagnose SHALL be presented as staged only once the draft
save the staging action issued has been accepted by the server. When that save
is refused, the surface SHALL restore the state it held before the staging
action — the stage control reads its unstaged label, the watched-change dock
shows no staged Plan, and the Plan step badge and Plan draft hold exactly what
they held before — and SHALL report the failure to the reader. The surface SHALL
NOT re-derive the refusal's meaning: it reports the server's own failure detail
unchanged, and it derives no staging eligibility, floor, threshold or direction
of its own. A staging path with no draft save attached to it — a mount that
supplies no staging callback, or one whose callback reports no refusal — SHALL
continue to stage.

#### Scenario: A refused draft save unstages the surface

- **WHEN** the reader stages an asserting Diagnose finding and the draft save is
  refused by the server
- **THEN** the stage control reads its unstaged label and reports itself
  unstaged
- **AND** the watched-change dock shows no staged Plan
- **AND** the Plan step badge and the Plan draft hold what they held before the
  staging action
- **AND** the reader is shown a failure message carrying the server's own detail
  unchanged

#### Scenario: An accepted draft save stages as before

- **WHEN** the reader stages an asserting Diagnose finding and the draft save is
  accepted
- **THEN** the stage control, the watched-change dock, the Plan step badge and
  the Plan draft all report the change as staged, exactly as they do today
