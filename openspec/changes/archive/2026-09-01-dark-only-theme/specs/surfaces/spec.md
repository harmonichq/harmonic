## ADDED Requirements

### Requirement: The app ships one dark theme

The app SHALL render every surface in its one dark theme with no theme
selection: no boot-time class gate, no stored theme preference, no Theme control,
and no rule scoped to a theme class. Rendered Dark values SHALL be the values
that shipped before Light retired until a later locked revision changes them.

#### Scenario: A fresh visit renders dark with nothing stored

- **GIVEN** a browser with no stored preference for the app's origin
- **WHEN** the reader opens any surface
- **THEN** the surface renders in the dark theme
- **AND** the footer offers no Theme control
- **AND** no `theme` value is written to storage

## MODIFIED Requirements

### Requirement: Diagnose separates clock-window selection from basal verdict state and keeps chart evidence legible

The Diagnose glucose-by-time-of-day chart SHALL confine clock-window gate paint
and hit testing to the glucose plot. Its clock-aligned basal verdict strip SHALL
retain each backend verdict's paint independently of window selection. Held,
insufficient-evidence, and no-data states SHALL remain distinguishable through
theme-owned paint plus a non-color structural tell. The plotted glucose evidence
and chart furniture SHALL remain readable with and without an active clock
window after every overlay is composited.

#### Scenario: Moving a clock window preserves basal verdict rendering and chart legibility

- **GIVEN** a populated Diagnose glucose-by-time-of-day chart
- **AND** the basal strip contains held, insufficient-evidence, and no-data slots
- **WHEN** the wearer chooses, draws, resizes, slides, or wraps a clock window
- **THEN** the gate paint and hit zones remain inside the glucose plot
- **AND** each basal slot keeps the same verdict paint and opacity it had before
  the window moved
- **AND** the three passive basal states remain distinguishable by paint and
  structure
- **AND** the glucose bands, median, target treatment, axes, labels, endpoint
  values, and basal strip remain readable in their final composited state, with
  the chart root naming the band and median marks accessibly in place of a
  rendered legend

### Requirement: Dark Diagnose material hierarchy keeps advisory evidence distinct

The Diagnose workstation SHALL derive its desk, chart well, field, pane sheet,
rail, rule, edge, and ink roles from one ordered warm tonal ladder. Chart wells
SHALL sit below pane sheets; chart-vessel edges SHALL remain distinct from
interior gridlines; the spotlight SHALL differ from peer vessels by shadow rather
than a brighter plate; and the glucose chart, basal strip, Findings boundary, and
chart dock SHALL read as one coherent instrument without doubled seams.

The named Diagnose evidence charts and desktop Day chart SHALL render the 70 and
180 mg/dL target bounds as dashed rails rather than a filled target slab. The
carb-ratio evidence chart SHALL keep overlapping support and directional-only
runs individually readable. These presentation rules SHALL leave published chart
data, window and dock interactions, advisory verdicts, and staging behavior
unchanged.

#### Scenario: Dark renders the same evidence through distinct material roles

- **GIVEN** a populated synthetic Diagnose workstation
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
