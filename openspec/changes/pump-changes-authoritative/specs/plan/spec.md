## MODIFIED Requirements

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
  later settings read whose active profile, edited in place, holds the Plan's
  schedule
- **WHEN** ingestion reconciliation runs
- **THEN** the edit is a Trial dated at that read, and the Plan is confirmed with
  a receipt naming that Trial
- **AND** the guidance read serves the active watched change, not the pending
  Plan disposition

#### Scenario: A change the dose stream detects still confirms from the read

- **GIVEN** a recorded Plan, a delivery feed that carries its basal edit for two
  days, and the later read that first shows the edit and holds the Plan's
  schedule
- **WHEN** ingestion reconciliation runs
- **THEN** there is one Trial, dated at that read, and the Plan is confirmed from
  that read with a receipt naming it

#### Scenario: A Trial read before the decision links to the Plan its later read confirms

- **GIVEN** a read whose in-place edit moves the Plan's slot, a Plan recorded
  without a captured schedule an hour later, and a later read that holds it
- **WHEN** ingestion reconciliation runs
- **THEN** the Plan is confirmed from the later read, and its receipt names no
  Trial
- **AND** when the later read is within a day of the edit's read, that Trial's
  receipt names the Plan

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
