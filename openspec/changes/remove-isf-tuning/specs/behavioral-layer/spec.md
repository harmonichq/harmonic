## MODIFIED Requirements

### Requirement: Behavioral and settings levers rank on a single 0–100 Priority axis.

The system SHALL satisfy the following:

Both flavors compose Priority identically as `100 · √(impact · recurrence)`, a geometric mean where one weak factor drags the score low. Behavioral impact is the hypo-weighted effect size of the bad outcome (0–1 range); settings impact is insulin-unit currency — basal and I:C changes priced through a shared soft-saturation curve so a 0.3 U/day move reads the same impact whether it moves basal or the carb ratio. Recurrence is a Wilson lower bound that fuses "how often" and "how sure" into one unified confidence-adjusted rate, measured over each lever's own exposure denominator (meals for meal levers, lows for low levers, correction pairs for stacking, etc.). Because behavioral and settings impact live on the same axis without a hard ceiling, a strong recurring habit can outrank a thin setting change.

#### Scenario: Behavioral and settings levers rank on a single 0–100 Priority axis.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Carb undercount converts a meal's rise with that meal's dose-stamped ISF

The system SHALL satisfy the following:

The carb-undercount classifier turns a meal's rise into the insulin it implies
by dividing it by an ISF. That ISF SHALL be the one stamped on the meal's first
bolus; without a stamp, the programmed ISF segment in force at its time of day
in the latest settings snapshot captured at or before it; with neither, the
meal SHALL be left unjudged. Harmonic estimates no ISF (ADR 564), and no reader
of the scenario engine SHALL supply one.

#### Scenario: A carb undercount is judged with its own segment's ISF

- **GIVEN** a synthetic store whose ISF schedule has two segments, and a meal
  whose rise is a carb undercount at its own segment's stamped ISF but not at
  the other segment's
- **WHEN** the scenario engine attributes the meal
- **THEN** it is attributed to carb undercount

#### Scenario: Attribution does not move with the fasting ISF estimate

- **GIVEN** two synthetic stores that differ only in their fasting nights: in
  one the overnight corrections act, in the other glucose holds flat
- **WHEN** the scenario engine runs over each
- **THEN** both serve the same carb-undercount attribution
