## ADDED Requirements

### Requirement: The Overview shows an Insulin summary and a Bolus review for its window

The Overview SHALL show the Insulin summary and the Bolus review for the window it
is switched to, below Meal size, reading the served insulin answer for that window.
On desktop the two SHALL share one row sized to its own content, and the rows of
the basal estimate and Meal size SHALL keep their one height; on the phone they
SHALL stack after Meal size, Insulin summary first. A window not yet read SHALL
show the cards' skeletons, and a store with no delivery their "No data". The app
SHALL read the answer again after a write as it reads the Overview's other cards.

#### Scenario: The cards follow the window switch

- **GIVEN** the Overview on the showcase at 14 days
- **WHEN** the person switches to 90 days
- **THEN** the cards print the served 90-day figures

#### Scenario: The insulin row does not stretch the rows above it

- **GIVEN** the Overview on desktop with the wearer's answers
- **WHEN** it renders
- **THEN** the basal estimate and Meal size rows are one height, and the insulin
  row is as tall as its taller card's content

#### Scenario: No delivery

- **GIVEN** a store with no delivery
- **WHEN** the Overview renders
- **THEN** both cards show "No data"
