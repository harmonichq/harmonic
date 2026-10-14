## ADDED Requirements

### Requirement: A Plan holds one tuning variable at a time

The system SHALL satisfy the following:

A Plan may contain multiple segments only when they are all changes to the same tuning variable (basal rate, ISF, I:C, or target). A Plan that stages a basal change cannot simultaneously stage an ISF, I:C, or target change. Attempting to stage a different variable clears the Plan of the prior variable.

#### Scenario: A Plan holds exactly one tuning variable at a time

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

#### Scenario: The server refuses a draft that mixes settings

- **GIVEN** a draft save whose items name two different settings
- **WHEN** the server validates it
- **THEN** the save is refused as a draft that mixes tuning families, and no
  draft is recorded

### Requirement: Only the newest recorded Plan is pending

The pending Plan SHALL be the newest recorded Plan when it is neither confirmed
nor withdrawn, and otherwise there SHALL be none. An older Plan that is neither
confirmed nor withdrawn SHALL be superseded: it SHALL withhold nothing, SHALL
never be confirmed by a pump read, and SHALL NOT be reported as confirmed or
withdrawn. Recording a decision and withdrawing SHALL keep their existing rules
against this pending Plan.

#### Scenario: Superseded history leaves no Plan pending

- **GIVEN** a synthetic store holding two recorded Plans, neither confirmed nor
  withdrawn
- **WHEN** the newest is confirmed from a pump read, or withdrawn
- **THEN** no Plan is pending and Focus admission names no pending Plan
- **AND** the older Plan's served verdict reads superseded

## REMOVED Requirements

### Requirement: A Plan holds exactly one tuning variable at a time

**Reason:** The swap to the five-tab app (#495, ADR 495) retired the desk scenarios this requirement carried; it is restated without them as "A Plan holds one tuning variable at a time".

**Migration:** None; the server behavior it states is unchanged.

### Requirement: Only the newest recorded Plan can be pending

**Reason:** The swap to the five-tab app (#495, ADR 495) retired the desk scenarios this requirement carried; it is restated without them as "Only the newest recorded Plan is pending".

**Migration:** None; the server behavior it states is unchanged.

### Requirement: A refused draft save leaves nothing staged

**Reason:** It specifies the desk's Diagnose stage control, watched-change dock and Plan step badge, which retired with the swap to the five-tab app (#495, ADR 495). The app stages no Plan; the server still refuses an invalid draft save and records nothing.

**Migration:** The desk is preserved as release v0.1.0. The five-tab app is specified in the surfaces capability.
