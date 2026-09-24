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
