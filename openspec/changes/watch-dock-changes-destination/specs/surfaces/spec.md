## ADDED Requirements

### Requirement: The watch dock names Changes for a watched Trial or Focus

When the watch dock at the foot of the Diagnose inspector reports a watched Trial
or a watched Focus, its link SHALL read "Open Changes ›", and no part of the dock
in any of its four states SHALL name Verify. A watched Focus's detail line SHALL
read "Pinned ‹MM-DD› · adherence and outcome are read in Changes", where
‹MM-DD› is the Focus's served pin date. The dock's four kind labels, its staged
Plan and idle states, a Trial's title and a Trial's maturity line SHALL be
unchanged.

#### Scenario: A watched Trial names Changes

- **GIVEN** a synthetic store whose server serves an active Trial
- **WHEN** Diagnose is seated at 1280×720 and at 1440×900
- **THEN** the dock reports the Trial and its link reads "Open Changes ›"
- **AND** no text in the dock names Verify

#### Scenario: A watched Focus names Changes

- **GIVEN** a synthetic store whose server serves an active Focus pinned on a
  served date
- **WHEN** Diagnose is seated at 1280×720 and at 1440×900
- **THEN** the dock's detail line reads "Pinned ‹MM-DD› · adherence and outcome
  are read in Changes" for that date and its link reads "Open Changes ›"
- **AND** no text in the dock names Verify

### Requirement: The watch dock opens Changes on the watched Trial or Focus

Activating the watch dock's link for a watched Trial or Focus SHALL open Changes
with an arrival that names the watch, and the address SHALL read
`/changes?subject=watch`. While the server serves an active change, that arrival
SHALL open the watched Trial's or Focus's own view in Changes. A Plan the reader
opened earlier in the same page session SHALL NOT take that seat, even when a
staged or saved Plan draft exists. When the server no longer serves an active
change, the arrival SHALL render what any other arrival to Changes renders.
Every other arrival to Changes SHALL keep its existing precedence.

#### Scenario: The link lands on the watched Trial

- **GIVEN** a synthetic store whose server serves an active Trial, with Diagnose
  seated
- **WHEN** the reader activates the dock's link
- **THEN** the desk is on Changes with the address `/changes?subject=watch`
- **AND** Changes shows that Trial's own view, titled for the served Trial

#### Scenario: The link lands on the watched Focus

- **GIVEN** a synthetic store whose server serves an active Focus, with Diagnose
  seated
- **WHEN** the reader activates the dock's link
- **THEN** the desk is on Changes with the address `/changes?subject=watch`
- **AND** Changes shows that Focus's own view

#### Scenario: A Plan opened earlier does not take the watched record's seat

- **GIVEN** earlier in the same page session the reader staged a concern and
  pressed Open Plan in Changes, and a staged Plan draft still exists
- **AND** the server now serves an active change
- **WHEN** Changes receives the dock's arrival
- **THEN** Changes opens the watched record's own view, not the Plan
- **AND** an explicit arrival to the Plan still opens the Plan

#### Scenario: A watch that has ended opens Changes as any arrival would

- **GIVEN** the reader pressed Open Plan earlier in the page session and a staged
  Plan draft exists
- **AND** the server serves no active change
- **WHEN** Changes receives the dock's arrival
- **THEN** Changes renders exactly what an arrival with no context renders
