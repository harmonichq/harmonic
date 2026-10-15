## ADDED Requirements

### Requirement: A Plan holds one tuning variable at a time

The system SHALL satisfy the following:

A Plan may contain multiple segments only when they are all changes to the same tuning variable (basal rate, ISF, I:C, or target). A Plan that stages a basal change cannot simultaneously stage an ISF, I:C, or target change. Attempting to stage a different variable clears the Plan of the prior variable.

#### Scenario: A Plan holds exactly one tuning variable at a time

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

#### Scenario: The server refuses a recorded Plan that mixes settings

- **GIVEN** Plan items that name two different settings
- **WHEN** the store validates them
- **THEN** they are refused as mixing tuning families, and nothing is recorded

### Requirement: Done on a Setting card records a Plan from the card's served action

A Done SHALL be recorded through `POST /api/plan/apply` naming the Setting's
guidance subject, the analysis generation and input revision it was read from,
and a durable request identity; a request without all four SHALL be refused.
The server SHALL record the candidate's own served action as the Plan's items:
one item per action member start, or the action's start when it names none, at
the action's recommended value, an I:C item carrying its block. The client SHALL
send no values. The candidate SHALL be a Setting the guidance admits, not
snoozed and not already waiting for the pump; otherwise the write SHALL refuse
as `ineligible_source`, and a stale read as `stale_source`. The Plan SHALL
capture its decision context and its deliverable as a recorded Plan does, and
the write SHALL invalidate the result cache.

#### Scenario: Done waits for the pump and leaves the Queue

- **GIVEN** the manufactured case `basal-raise`, whose basal card the guidance
  admits
- **WHEN** the person presses Done on it
- **THEN** the Plan history holds one Plan whose items are the served action's
  start minutes at its recommended values, and its verdict reads `waiting`
- **AND** the guidance serves the basal candidate's acknowledgment as
  `waiting`, with the block, the value it was Done from and the suggestion
- **AND** a second Done on the same card is refused as `ineligible_source`

#### Scenario: A carb-ratio Done records its block

- **GIVEN** the manufactured case `ic-raise`
- **WHEN** the person presses Done on its I:C card
- **THEN** each recorded item carries the action's block bounds and member
  starts

### Requirement: One Done per Setting is open at a time

A recorded Plan SHALL be open while it is neither resolved nor withdrawn. Each
Setting SHALL have at most one open Plan, its newest, and several Settings MAY
each have one at once. An open Plan SHALL withhold neither a Focus nor a Done on
another Setting, and a Done SHALL be recorded whatever change is being watched.
Withdrawing (Undo) SHALL accept only an open Plan and refuse any other as
`nonpending_plan`.

#### Scenario: Each Setting card takes its own Done

- **GIVEN** the manufactured case `basal-and-carb-ratio-lower`
- **WHEN** the person presses Done on the basal card and on the I:C card
- **THEN** both candidates' acknowledgments read `waiting`

#### Scenario: A Done does not wait on the watched change

- **GIVEN** an active Trial of another basal slot
- **WHEN** the person presses Done on the basal card
- **THEN** the Done is recorded and waits for the pump

#### Scenario: Undo takes the Done back

- **GIVEN** a Done waiting for the pump
- **WHEN** it is withdrawn
- **THEN** its verdict reads `withdrawn`, the candidate serves no
  acknowledgment, and the card can be Done again

### Requirement: The first sync after a Done decides it

During reconciliation the server SHALL decide each open Plan from the latest
pump settings read captured after its decision, against the read at or before
the decision, comparing each item's setting at its start minute at pump
precision. When a setting moved, to the suggestion or to any other value, the
Plan SHALL close on the pump at once; the pump change SHALL be its Trial by the
ordinary rule, and no comparison of the new value with the suggestion SHALL be
made. When no setting moved, the Plan SHALL close not on the pump only once the
store holds pump data from after the decision. With no read after the decision,
or only one before such data, the Plan SHALL stay open. A Plan whose items name
no integer start minute SHALL stay open and leave only by withdrawal. The
decision SHALL be written once, in the Plan's receipt with its deciding read,
and no later read SHALL rewrite it. A Trial with no receipt SHALL link to a Plan
a read closed on the pump with no Trial when the Trial is of one of the Plan's
item slots or is whole-profile, its change time is within a day of the deciding
read, and the match is one to one both ways; a Trial whose transition carries
the Plan's whole captured schedule SHALL link through its own receipt.

#### Scenario: A later sync with the setting unchanged returns the card not on pump

- **GIVEN** a Done on the basal card, a delivery record after it, and a later
  read whose active profile is unchanged
- **WHEN** reconciliation runs
- **THEN** the Plan's verdict reads `not_on_pump` with that read's time, no
  Trial is recorded, and the candidate is queued again with its acknowledgment
  `not_on_pump`

#### Scenario: A read without pump data after the Done keeps it waiting

- **GIVEN** a Done and a later read whose active profile is unchanged, with no
  pump data after the Done
- **WHEN** reconciliation runs
- **THEN** the acknowledgment still reads `waiting`

#### Scenario: A different value on the pump is the Trial and closes the Done

- **GIVEN** a Done on the basal card and a later read whose block holds a value
  other than the suggestion
- **WHEN** reconciliation runs
- **THEN** one basal Trial is recorded at that value, its receipt names the
  Plan, the Plan's verdict reads `on_pump`, and the candidate serves no
  acknowledgment

#### Scenario: A read from before the decision never decides it

- **GIVEN** a Done whose only reads are captured before or at its decision
- **WHEN** reconciliation runs
- **THEN** the Plan stays waiting

#### Scenario: The first deciding sync names its read, and later reads change nothing

- **GIVEN** a Done, a read after it with no pump data after it, then a read
  holding the suggestion, then a read that reverts it
- **WHEN** reconciliation runs after each
- **THEN** the Plan stays waiting after the first, reads `on_pump` naming the
  second, and keeps that receipt after the third

### Requirement: A recorded Plan serves its Done verdict

Each recorded Plan the Plan history read serves SHALL carry one verdict read off
its record without writing: `withdrawn` when withdrawn; `waiting` while open;
`on_pump` when a read closed it on the pump or a Trial's receipt names it;
`not_on_pump` when a read closed it unchanged. `read_at` SHALL be the deciding
read's capture time, and null otherwise. A Plan an earlier build confirmed SHALL
read `on_pump`. The guidance read SHALL serve each Setting candidate's
`acknowledgment` from its subject's newest Plan not withdrawn: `waiting` while
it is open, `not_on_pump` after an unchanged sync until the next pump change of
that setting or a snooze of the subject decided after the deciding read, and
none otherwise. A waiting candidate SHALL NOT be selected. The Trial roster read
SHALL serve the same waiting acknowledgments as `waiting`, each with its subject
and setting, for Changes, which reads the roster and not the guidance.

#### Scenario: The history and guidance reads agree

- **GIVEN** a Done, then a later unchanged read with pump data after the Done
- **WHEN** the Plan history and the guidance are read before and after
  reconciliation
- **THEN** both read `waiting`, then both read `not_on_pump` with the same read
  time

#### Scenario: Not on pump clears on a snooze

- **GIVEN** a basal card served `not_on_pump`
- **WHEN** the person snoozes it
- **THEN** the candidate serves no acknowledgment

## REMOVED Requirements

### Requirement: A Plan holds exactly one tuning variable at a time

**Reason:** The swap to the five-tab app (#495, ADR 495) retired the desk scenarios this requirement carried; it is restated without them as "A Plan holds one tuning variable at a time".

**Migration:** None; the server behavior it states is unchanged.

### Requirement: Only the newest recorded Plan can be pending

**Reason:** A Done is one open Plan per Setting, and several Settings can wait at once (#518, ADR 518). It is replaced by "One Done per Setting is open at a time".

**Migration:** None. An older open Plan is decided by the next reconciliation like any open one.

### Requirement: A refused draft save leaves nothing staged

**Reason:** It specifies the desk's Diagnose stage control, watched-change dock and Plan step badge, which retired with the swap to the five-tab app (#495, ADR 495). The app stages no Plan; the server still refuses an invalid draft save and records nothing.

**Migration:** The desk is preserved as release v0.1.0. The five-tab app is specified in the surfaces capability.

### Requirement: A draft persists unsaved changes locally

**Reason:** The app keeps no Plan draft: a Done records the card's served action at once, and the draft routes are removed (#518, ADR 518).

**Migration:** None; nothing read a saved draft.

### Requirement: Applying a plan records the applied changes in history

**Reason:** Recording a Plan is now a Done on a Setting card, from the card's served action rather than a saved draft (#518, ADR 518). It is replaced by "Done on a Setting card records a Plan from the card's served action".

**Migration:** None; the Plan history read is unchanged.

### Requirement: Reconciliation compares the planned deliverable against the detected active pump profile

**Reason:** A Done is decided by whether its setting moved, not by a cell-by-cell match with the planned deliverable (#518, ADR 518). It is replaced by "The first sync after a Done decides it".

**Migration:** A Plan an earlier build confirmed reads `on_pump`.

### Requirement: The server confirms a pending Plan from a matching pump read

**Reason:** The pump-read confirmation and its unbroken run of holding reads are replaced by the Done rule: the first sync after it decides it, on the pump if the setting moved to any value (#518, ADR 518). It is replaced by "The first sync after a Done decides it", which keeps ADR 463 decision 7's one-to-one Trial link for a Plan a read closed on the pump.

**Migration:** None.

### Requirement: Every recorded Plan serves one verdict

**Reason:** The pending, mismatch, confirmed and superseded verdicts are replaced by the Done verdict, read off the record (#518, ADR 518). It is replaced by "A recorded Plan serves its Done verdict".

**Migration:** A Plan an earlier build confirmed reads `on_pump`.
