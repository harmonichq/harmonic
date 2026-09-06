## ADDED Requirements

### Requirement: Diagnose evidence charts seat their axis names inside the chart

Every axis name a Diagnose evidence chart draws at full rank SHALL render
entirely inside that chart's own box, on every mode the chart publishes. No part
of a name SHALL be painted outside the chart's bounds, whichever grid inset the
axis sits against.

The names themselves SHALL be unchanged: this is a rule about where a name is
seated, not about what it says. The evidence canvas's grid geometry — the
canvas-wide spine inset a tile shares with the glucose strip, and the right inset
reserved for the last axis label — SHALL NOT be widened to seat a name, and the
on-chart legend SHALL keep the seat its own configuration gives it. A chart whose
axis name already renders inside its box SHALL keep the seating it has. The mini
rank SHALL continue to carry no axis name at all.

#### Scenario: The correction-factor rest-windows chart states both its units

- **GIVEN** the Diagnose evidence canvas showing the correction factor's rest
  windows at full rank
- **WHEN** the reader looks at the chart's axis names in each alignment the tile
  publishes
- **THEN** the y-axis name reads `glucose change (mg/dL)` in full, with no part of
  it painted outside the chart, under both event and clock alignment
- **AND** the x-axis name reads `insulin acted (U)` in full, with no part of it
  painted outside the chart

#### Scenario: The carb-ratio meal-runs chart states its elapsed-time unit

- **GIVEN** a carb ratio finding's meal runs drawn at full rank
- **WHEN** the reader looks at the chart's axis names in each alignment the tile
  publishes
- **THEN** the name reads `minutes from first meal` in full, with no part of it
  painted outside the chart
- **AND** the clock alignment's `meal start` and `Carb ratio (g/U)` are seated by
  the same rule, from the same shared helper, rather than by a second one

#### Scenario: Seating a name moves nothing that already rendered

- **WHEN** every finding row in the queue is opened in turn, in every alignment
  its tiles publish, and each drawn axis name is measured against its own chart's
  bounds
- **THEN** no axis name overhangs any edge of its chart
- **AND** the basal chart's axis name keeps the seat it had, unmoved
- **AND** each chart's grid insets and legend seat are the ones it had before
- **AND** a chart rendered at mini rank carries no axis name
