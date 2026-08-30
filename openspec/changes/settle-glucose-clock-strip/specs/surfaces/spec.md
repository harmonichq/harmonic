## MODIFIED Requirements

### Requirement: Diagnose separates clock-window selection from basal verdict state and keeps chart evidence legible

The Diagnose glucose-by-time-of-day chart SHALL confine clock-window gate paint
and hit testing to the glucose plot. Its clock-aligned basal verdict strip SHALL
retain each backend verdict's paint independently of window selection. Held,
insufficient-evidence, and no-data states SHALL remain distinguishable through
theme-owned paint plus a non-color structural tell in Light and Dark. The plotted
glucose evidence and chart furniture SHALL remain readable with and without an
active clock window after every overlay is composited.

#### Scenario: Moving a clock window preserves basal verdict rendering and chart legibility

- **GIVEN** a populated Diagnose glucose-by-time-of-day chart in Light or Dark
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
