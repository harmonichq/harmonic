## ADDED Requirements

### Requirement: The glucose overview's window caption stays whole inside the chart

The glucose overview's window caption SHALL lie wholly inside the chart at
every size the chart is drawn at. Where the caption fits on one line inside its
window, or on one line beside the window in the margin on the roomier side, it
SHALL stand on that one line, placed as before. Where it fits on one line in
neither place, it SHALL wrap inside whichever of those two regions is wider:
the window's name on its own line and, when the window is thin, the
insufficient-sample notice on the next, each line breaking only between whole
words. Every word the caption prints SHALL be whole, never split and never cut
off. The window's name and, on a thin window, the whole insufficient-sample
notice SHALL always print. A wrapped caption SHALL overprint no other text the
chart draws, the target caption included. At 1280×720 and 1440×900, every
Window preset's caption SHALL stand on one line. No verdict, floor or
thinness decision moves: the notice prints exactly when the chart already
judges the window thin.

#### Scenario: The narrowest split keeps every preset's caption whole

- **GIVEN** a synthetic store whose 24 h window is thin
- **WHEN** Diagnose renders at 832×720 and at 832×560, and the reader presses
  each Window preset in turn
- **THEN** each preset's caption lies wholly inside the chart
- **AND** every word of it is whole, and the window's name and, on a thin
  window, the whole insufficient-sample notice print
- **AND** it overprints no other text the chart draws

#### Scenario: The supported desktop sizes keep the one-line caption

- **GIVEN** the same synthetic store
- **WHEN** Diagnose renders at 1280×720 and at 1440×900, and the reader
  presses each Window preset in turn
- **THEN** each preset's caption stands on one line, wholly inside the chart,
  with every word printed

### Requirement: The Spotlight's middle-rank verdict line keeps every fact inside the chart

When the Spotlight's basal chart takes its middle rank, the two compressed
lines it draws in a seat narrower than its full layout, its verdict line (the
verdict word, the estimate, the estimate's range and the programmed rate)
SHALL lie wholly inside the chart and clear of the Keep control. Where those
facts do not fit on one line, the line SHALL break between facts, never inside
one, and the tally line and the figure SHALL move down so that no line
overprints another. Where they fit on one line, the verdict line, the tally
line and the figure SHALL stand where they stood before. Every fact SHALL
print; none is shortened or dropped for room.

#### Scenario: The narrowest split keeps the programmed rate

- **GIVEN** a synthetic store whose next-in-line finding opens a basal slot
  with a programmed rate
- **WHEN** Diagnose renders at rest at 832×720 and at 832×560
- **THEN** the Spotlight's verdict line prints the verdict word, the estimate,
  its range and the programmed rate, each whole
- **AND** every line of it lies inside the chart and clear of the Keep control
- **AND** the tally line stands below the verdict line's last line

#### Scenario: A seat wide enough keeps one verdict line

- **GIVEN** the same synthetic store
- **WHEN** Diagnose renders at rest at 1200×736
- **THEN** the Spotlight's verdict line stands on one line
