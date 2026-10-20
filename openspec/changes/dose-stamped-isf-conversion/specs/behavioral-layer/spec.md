## ADDED Requirements

### Requirement: Carb undercount converts a meal's rise with that meal's dose-stamped ISF

The system SHALL satisfy the following:

The carb-undercount classifier turns a meal's rise into the insulin it implies
by dividing it by an ISF. That ISF SHALL be the one stamped on the meal's first
bolus; without a stamp, the programmed ISF segment in force at its time of day
in the latest settings snapshot captured at or before it; with neither, the
meal SHALL be left unjudged. The classifier SHALL NOT read the ISF analyzer's
fasting estimate, and no reader of the scenario engine SHALL supply one.

#### Scenario: A carb undercount is judged with its own segment's ISF

- **GIVEN** a synthetic store whose ISF schedule has two segments, and a meal
  whose rise is a carb undercount at its own segment's stamped ISF but not at
  the other segment's
- **WHEN** the scenario engine attributes the meal
- **THEN** it is attributed to carb undercount

#### Scenario: Attribution does not move with the fasting ISF estimate

- **GIVEN** two synthetic stores that differ only in their fasting nights, so
  that the ISF analyzer serves a different estimate for each
- **WHEN** the scenario engine runs over each
- **THEN** both serve the same carb-undercount attribution
