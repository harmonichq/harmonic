## ADDED Requirements

### Requirement: Dark Diagnose material hierarchy keeps advisory evidence distinct

The Dark Diagnose workstation SHALL derive its desk, chart well, field, pane
sheet, rail, rule, edge, and ink roles from one ordered warm tonal ladder. Chart
wells SHALL sit below pane sheets; chart-vessel edges SHALL remain distinct from
interior gridlines; the spotlight SHALL differ from peer vessels by shadow rather
than a brighter plate; and the glucose chart, basal strip, Findings boundary, and
chart dock SHALL read as one coherent instrument without doubled seams.

The named Diagnose evidence charts and desktop Day chart SHALL render the 70 and
180 mg/dL target bounds as dashed rails rather than a filled target slab. The
carb-ratio evidence chart SHALL keep overlapping support and directional-only
runs individually readable. These presentation changes SHALL leave Light,
published chart data, window and dock interactions, advisory verdicts, and
staging behavior unchanged.

#### Scenario: Dark renders the same evidence through distinct material roles

- **GIVEN** a populated synthetic Diagnose workstation in Dark
- **WHEN** the reader views the focal chart, basal strip, Findings pane, chart
  dock, fullscreen chart, explorer, and carb-ratio evidence
- **THEN** wells remain darker than sheets and every chart vessel has one visible
  edge distinct from its gridlines
- **AND** spotlight emphasis is shadow-only, the glucose/basal vessel shares one
  boundary, and the Findings divider is a single seam
- **AND** glucose targets appear as dashed 70 and 180 rails without a filled slab
- **AND** overlapping meal runs remain distinguishable by their existing
  membership line style and the re-settled opacity
- **AND** the same interactions, evidence values, and advisory states replay
  unchanged
- **AND** the Light theme remains unchanged
