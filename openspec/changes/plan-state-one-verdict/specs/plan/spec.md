## ADDED Requirements

### Requirement: The server confirms a pending Plan from a matching pump read

During reconciliation the server SHALL confirm the pending Plan when the latest
pump settings read captured after the Plan's decision holds the Plan's schedule
under the existing pump-precision schedule comparison. The schedule SHALL be the
Plan's captured deliverable; a Plan recorded without a captured deliverable SHALL
be compared as its recorded values applied over that read's active profile. The
confirmation SHALL name the first read of the unbroken run of reads after the
decision, ending at the latest, that each hold the schedule. It SHALL run after
the Trial-matched reconciliation in the same pass, so a Trial-matched
confirmation wins when both are available. A pump-read confirmation SHALL name no
Trial and SHALL create no Plan–Trial relationship. A read captured at or before
the decision SHALL never confirm a Plan. A Plan any of whose recorded items
lacks an integer start minute or a numeric value SHALL be incomparable: no read
SHALL confirm it, and neither reconciliation nor its served verdict SHALL fail
on it; it leaves pending only by withdrawal. A confirmed Plan SHALL no longer
withhold a Focus or a new decision.

#### Scenario: An in-place edit after the decision confirms the Plan

- **GIVEN** a synthetic store with a Plan recorded through the Plan routes and a
  later settings read whose unchanged active profile holds the Plan's schedule,
  with no Trial detected
- **WHEN** ingestion reconciliation runs
- **THEN** the Plan is confirmed, naming that read and no Trial
- **AND** the guidance read no longer serves the pending Plan disposition
- **AND** Focus admission no longer names a pending Plan

#### Scenario: A change the dose stream detects still confirms from the read

- **GIVEN** a recorded Plan, an in-place edit the dose stream detects as a
  basal-rate Trial whose change time no settings read shares, and a later read
  that holds the Plan's schedule
- **WHEN** ingestion reconciliation runs
- **THEN** the Plan is confirmed from the read
- **AND** that Trial records no relationship to the Plan

#### Scenario: A read from before the decision never confirms

- **GIVEN** a recorded Plan whose schedule was held only by a read captured
  before the decision
- **WHEN** ingestion reconciliation runs
- **THEN** the Plan stays pending

#### Scenario: A latest read that differs keeps the Plan pending

- **GIVEN** a recorded Plan whose latest read after the decision does not hold
  its schedule
- **WHEN** ingestion reconciliation runs
- **THEN** the Plan stays pending

#### Scenario: The confirmed time is the first read of the matching run

- **GIVEN** a recorded Plan, a read after the decision that differs, then two
  reads that each hold the schedule, reconciled only after the second
- **WHEN** ingestion reconciliation runs
- **THEN** the confirmation names the first of the two matching reads
- **AND** a further matching read and reconciliation leave it unchanged

#### Scenario: An incomparable recorded Plan fails nothing and leaves by withdrawal

- **GIVEN** a synthetic store whose newest Plan was recorded through
  `Store.save_plan_draft` and `Store.apply_plan` with an item that carries no
  start minute, and a later settings read
- **WHEN** ingestion reconciliation runs and the Plan history and guidance are
  read
- **THEN** reconciliation completes, both reads answer, and the Plan's verdict
  reads `pending` with `on_pump` false
- **AND** the withdraw route withdraws it and Focus admission then names no
  pending Plan

#### Scenario: A Plan recorded without a captured schedule confirms from its values

- **GIVEN** a Plan recorded before schedules were captured and a later read whose
  active profile holds each recorded value
- **WHEN** ingestion reconciliation runs
- **THEN** the Plan is confirmed from that read

### Requirement: Only the newest recorded Plan can be pending

The pending Plan SHALL be the newest recorded Plan when it is neither confirmed
nor withdrawn, and otherwise there SHALL be none. An older Plan that is neither
confirmed nor withdrawn SHALL be superseded: it SHALL withhold nothing, SHALL
never be confirmed by a pump read, and SHALL NOT be reported as confirmed or
withdrawn. Recording a decision and withdrawing SHALL keep their existing rules
against this pending Plan.

#### Scenario: Superseded history does not block the desk

- **GIVEN** a synthetic store holding two recorded Plans, neither confirmed nor
  withdrawn
- **WHEN** the newest is confirmed from a pump read, or withdrawn
- **THEN** no Plan is pending and Focus admission names no pending Plan
- **AND** the older Plan's served verdict reads superseded

### Requirement: Every recorded Plan serves one verdict

Each recorded Plan that the Plan history read serves, and the guidance read's
pending Plan, SHALL carry one verdict the server computes at read time without
writing. Its `state` SHALL be `pending` when the Plan is the newest, is not
confirmed, and the latest read after its decision holds its schedule, or there
is no such read, or the Plan is incomparable; `mismatch` when the Plan is the
newest, is not confirmed, is comparable, and the latest read after its decision
does not hold its schedule; otherwise `confirmed`, `withdrawn` or
`superseded`. `confirmed_at` SHALL be the
confirming read's capture time for a confirmed Plan and null otherwise. `on_pump`
SHALL say whether the latest read after the decision holds the Plan's schedule,
and SHALL be false for an incomparable Plan.
`checked_at` SHALL be the latest read's capture time, or null with no read. Both
reads SHALL compute the verdict through one server function, so one Plan at one
input revision carries the same verdict in both. The Plan history read SHALL
keep serving records newest first.

#### Scenario: The history and guidance reads agree

- **GIVEN** a pending Plan in a synthetic store
- **WHEN** the Plan history and the guidance are read at one input revision
- **THEN** the history row's verdict equals the guidance pending Plan's verdict

#### Scenario: A holding read not yet reconciled serves pending

- **GIVEN** a recorded Plan and a later settings read that holds its schedule,
  with no reconciliation run since that read
- **WHEN** the Plan history is read
- **THEN** its verdict reads `pending` with `on_pump` true and no
  `confirmed_at`, never `confirmed`

#### Scenario: A confirmed Plan the pump stops holding stays confirmed

- **GIVEN** a Plan confirmed from a pump read, then a later read whose schedule
  differs
- **WHEN** the Plan history is read
- **THEN** its verdict reads `confirmed` with the original `confirmed_at`
- **AND** `on_pump` is false and `checked_at` names the later read

#### Scenario: A differing read after the decision serves a mismatch

- **GIVEN** a recorded Plan whose latest read after the decision differs from
  its schedule
- **WHEN** the Plan history is read
- **THEN** its verdict reads `mismatch` with `on_pump` false and no
  `confirmed_at`
