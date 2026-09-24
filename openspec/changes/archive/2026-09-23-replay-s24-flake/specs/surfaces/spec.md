## ADDED Requirements

### Requirement: A render keeps focus inside a seated Diagnose case file

The desk SHALL NOT detach the Diagnose case file when it renders while that
case file is already seated and not parked. A render the reader did not ask
for SHALL leave the seated case file attached, so keyboard focus held inside
it, its selection and its reading scroll stay where they are. Examples of such
a render are a background Focus options read, guidance read or Plan state read
landing. A cold seat, a return that re-seats a parked desk, the loading frame
shown during Diagnose's own read, and the failed-read frames SHALL behave as
before.

#### Scenario: A late background read leaves the stepped Occurrence focused

- **GIVEN** a Diagnose case file whose selected Occurrence row holds keyboard
  focus after ↓ and ↑ steps
- **WHEN** a background guidance or Focus options read lands and the desk
  renders
- **THEN** the case file is not removed and re-inserted
- **AND** the selected Occurrence row still holds keyboard focus

#### Scenario: A return still re-seats the parked desk

- **GIVEN** the reader left Diagnose for Changes, so its case file is parked
- **WHEN** the reader returns and the status read answers unchanged
- **THEN** the parked case file is seated back in the desk as before
