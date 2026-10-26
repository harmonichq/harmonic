## ADDED Requirements

### Requirement: The insulin cards print only the served insulin answer

The component library's Insulin summary card SHALL print, for one window of
the served insulin answer, the average daily insulin with its basal and bolus
parts, the average daily boluses with their manual and Control-IQ parts, and
the average daily carbs; its Bolus review card SHALL print bolus units and
share by type and by delivery method. Every number either card prints SHALL be
a field of that answer, and a card SHALL print no share where the answer serves
none. A window with no delivery SHALL show "No data". Neither card SHALL carry a
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
