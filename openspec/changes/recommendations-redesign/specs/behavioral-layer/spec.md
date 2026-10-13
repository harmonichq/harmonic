## ADDED Requirements

### Requirement: An inconsistent Finding case is withheld by name, not served and not fatal

When one Finding's case-file projection cannot satisfy its own consistency checks,
case-file preparation SHALL withhold that Finding by name with the code
`inconsistent_projection` and SHALL still serve every other Finding's case. The
withheld Finding SHALL leave the rendered rows and the case headers, and no count
from the rejected projection SHALL be served. Requesting the withheld Finding's case
SHALL still answer the inconsistency error (ADR 488).

#### Scenario: One disagreeing case leaves the rest of the store inspectable

- **GIVEN** a prepared store whose high-carb sequence report and sequence evidence disagree
- **WHEN** the Finding case files are prepared
- **THEN** the preparation names `finding:high_carb_sequence` as withheld with `inconsistent_projection`
- **AND** every other rendered Finding is served as it would be without the disagreement
