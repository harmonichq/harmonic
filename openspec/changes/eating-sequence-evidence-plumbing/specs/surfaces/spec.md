## ADDED Requirements

### Requirement: Diagnose hosts a non-advisory aggregate-evidence section outside Audit and Watching

Diagnose SHALL host a distinct non-advisory aggregate-evidence section outside Audit
and Watching, fed by the fixed-window eating-sequence report. Nothing in it SHALL
stage a Plan change, rank in Audit, or enter Watching. Its adapter SHALL reshape
served aggregates without deriving a verdict, median, difference, or status. An
insufficient cell SHALL remain visible as insufficient rather than numeric. #278's
visual lock SHALL settle rendered name, placement, wording, and charts.

#### Scenario: An insufficient served aggregate remains insufficient in the adapter

- **GIVEN** an eating-sequence report cell with insufficient status and null metric
- **WHEN** Diagnose adapts it for aggregate evidence
- **THEN** the chart-ready cell retains that status and null value
- **AND** it is neither dropped nor zero-filled

#### Scenario: The adapter does not re-derive an eating-sequence judgment

- **GIVEN** served aggregates, comparisons, statuses, findings, and exclusions
- **WHEN** Diagnose adapts the report
- **THEN** its outputs use those values field-for-field
- **AND** no frontend threshold, median, difference, or verdict is calculated

#### Scenario: The section consumes the server-owned fixed window

- **GIVEN** Diagnose requests eating-sequence evidence
- **WHEN** its data helper loads the report
- **THEN** it requests `/api/diagnose/eating-sequences` without a window parameter
- **AND** the server-owned fixed Diagnose source window determines the report

#### Scenario: A fresh report response does not invent an input-data age

- **GIVEN** a fresh eating-sequence report response without `input_data_age`
- **WHEN** Diagnose records its response age
- **THEN** the report passes through unchanged
- **AND** only that report shape's recorded age is cleared
