## ADDED Requirements

### Requirement: The Plan lifecycle replay certifies the decision it recorded

The desk ledger's Plan lifecycle story, S89, SHALL read the decision it records
as the first record the Plan history read serves, which is the newest. The same
check SHALL prove that record is the decision the story just recorded: the served
history SHALL hold exactly one more record than it held when the story read it
before recording, and the first record's `applied_at` SHALL name none of the
records in that earlier read. The story's check that a failed Withdraw leaves the
decision unchanged SHALL read that same first record. An older record already in
the Plan history SHALL NOT satisfy any of the story's decision or withdrawal
checks.

#### Scenario: An older Plan in history does not stand in for the new decision

- **GIVEN** a Plan history, served newest first, that already lists an older
  recorded Plan that was never withdrawn
- **WHEN** S89 records a decision, withdraws it after one failed Withdraw, and
  reloads
- **THEN** it certifies the first served record as the new decision
- **AND** its withdrawal checks pass against that record, and the story passes

#### Scenario: An older withdrawn Plan cannot satisfy the withdrawal check

- **GIVEN** a Plan history that already lists an older withdrawn Plan
- **AND** a server that does not persist the new decision's withdrawal
- **WHEN** S89 checks the withdrawal after reload
- **THEN** the story fails at that check, because the decision it certified
  carries no recorded withdrawal

#### Scenario: A new decision served after older records fails the story

- **GIVEN** a Plan history that lists the new decision after the records it
  held before recording
- **WHEN** S89 checks its durable decision
- **THEN** the story fails at that check, because the first served record was
  already served before recording

#### Scenario: A recording that adds more than one record fails the story

- **GIVEN** a Plan history with no earlier Plan
- **AND** a server that adds two records when the story records one decision
- **WHEN** S89 checks its durable decision
- **THEN** the story fails at that check, because the history grew by more than
  one record
