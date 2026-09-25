## MODIFIED Requirements

### Requirement: A Plan holds exactly one tuning variable at a time

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

#### Scenario: Staging a second setting names the change it will replace, before the press

- **GIVEN** the manufactured case `basal-and-carb-ratio-lower` on Diagnose, with
  the carb-ratio row's change staged, either saved as the Plan draft or picked
  in Changes and not yet saved
- **WHEN** the reader opens the basal row, before pressing anything
- **THEN** its stage control reads "Replace staged change"
- **AND** the control's sub-line reads "replaces " followed by the staged
  carb-ratio change's name, the name the watch dock gives that change

#### Scenario: Pressing it replaces the staged setting

- **GIVEN** the state of the scenario above
- **WHEN** the reader presses the basal row's stage control
- **THEN** the served Plan draft holds only basal rows
- **AND** the watch dock names the basal change
- **AND** the carb-ratio row's stage control, opened again in the same visit,
  reports itself unstaged and reads "Replace staged change" naming the basal
  change, never "Staged · Undo"

#### Scenario: Staging the setting already staged replaces nothing

- **GIVEN** a basal change staged and saved as the Plan draft
- **WHEN** the reader opens another basal row that the analysis lets stage
- **THEN** its stage control reads "Stage change" with the sub-line
  "staged for Plan"
- **AND** pressing it keeps the staged basal rows and adds its own

#### Scenario: The warning names what Diagnose shows as staged

- **GIVEN** a carb-ratio change saved as the Plan draft and a basal change
  picked in Changes and not yet saved, so Diagnose marks the basal change as
  staged
- **WHEN** the reader opens the correction factor, which the analysis lets stage
- **THEN** its stage control reads "Replace staged change" and names the basal
  change

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
Trial in the Plan's receipt. A read captured at or before
the decision SHALL never confirm a Plan. A Plan any of whose recorded items
lacks an integer start minute or a numeric value, or whose items today's item
rules refuse (a row that mixes tuning families, or a carb-ratio block row whose
end minute is 0), SHALL be incomparable: no read
SHALL confirm it, and neither reconciliation nor its served verdict SHALL fail
on it; it leaves pending only by withdrawal. A confirmed Plan SHALL no longer
withhold a Focus or a new decision.

After the pump-read confirmation in the same pass, a Trial record with no
receipt and no captured carb-ratio block SHALL link to a Plan confirmed from a
pump read with no Trial when the Trial's setting is the Plan's setting (a basal
Trial's slot being one of the Plan's item start minutes) or the Trial is
whole-profile, when the Trial's change time is within one day of the confirming
read's capture time, and when exactly one such Plan qualifies for the Trial,
exactly one such Trial qualifies for the Plan, and no Trial record already names
that Plan. The link SHALL write only the Trial's receipt, naming the Plan, the
confirming read and the Plan's matched schedule. The Plan's receipt, its served
verdict and its confirmed time SHALL be unchanged. The link SHALL NOT compare a
Plan's recorded time with a change time.

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
  that holds the Plan's schedule, captured within a day of the Trial's change
  time
- **WHEN** ingestion reconciliation runs
- **THEN** the Plan is confirmed from the read, and its receipt names no Trial
- **AND** that Trial's receipt names the Plan, and the Trial serves the Plan's
  decision as its original context

#### Scenario: An ambiguous or distant Trial stays unlinked

- **GIVEN** a Plan confirmed from a pump read with no Trial
- **WHEN** two Trials of its setting qualify, or the only Trial's change time is
  more than a day from the confirming read, or the only Trial is of another
  setting
- **THEN** no Trial links to the Plan

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
