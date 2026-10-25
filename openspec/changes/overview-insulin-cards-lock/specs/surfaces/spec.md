## ADDED Requirements

### Requirement: The Overview shows an Insulin summary and a Bolus review for its window

The Overview SHALL show two cards for the window it is switched to: an Insulin
summary (the average daily dose with its basal and bolus parts, the average
daily boluses with their manual and Control-IQ parts, the average daily carbs)
and a Bolus review (bolus units and share by type and by delivery method, as a
daily average). Every number a card prints SHALL be a field the engine served
for that window, and a card SHALL print no share where the engine served none.
A window with no delivery SHALL show "No data". Neither card SHALL carry a
control.

#### Scenario: A populated window

- **GIVEN** the served insulin answer for the wearer at 30 days
- **WHEN** the Insulin summary and the Bolus review render
- **THEN** each printed value equals its served field in its format, and the
  type rows and method rows each print a share and units

#### Scenario: A window with no boluses

- **GIVEN** a window whose served bolus units are 0
- **WHEN** the Bolus review renders
- **THEN** every row prints 0.0 U and no share

#### Scenario: No data

- **GIVEN** a store whose served window is null
- **WHEN** either card renders
- **THEN** it shows "No data" under its title and no number
