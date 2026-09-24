## ADDED Requirements

### Requirement: The glucose overview's window caption stays whole inside the chart

The glucose overview's window caption SHALL lie wholly inside the chart at
every size the chart is shown at, whether it was drawn at that size or the
window was resized to it. Where the caption fits on one line inside its window,
or on one line beside the window in the margin on the roomier side, it SHALL
stand on that one line, placed as before. Where it fits on one line in neither
place, it SHALL wrap inside whichever of those two regions is wider: the
window's name on its own line and, when the window is thin, the
insufficient-sample notice on the next, each line breaking only between whole
words. Every word the caption prints SHALL be whole, never split and never cut
off. The window's name and, on a thin window, the whole insufficient-sample
notice SHALL always print. No text the chart draws SHALL overprint other text
the chart draws. At 1280×720 and 1440×900, every Window preset's caption SHALL
stand on one line. No verdict, floor or thinness decision moves: the notice
prints exactly when the chart already judges the window thin.

#### Scenario: The narrowest split keeps every preset's caption whole

- **GIVEN** a synthetic store whose 24 h window is thin
- **WHEN** Diagnose renders at 832×720 and at 832×560, and the reader presses
  each Window preset in turn
- **THEN** each preset's caption lies wholly inside the chart
- **AND** every word of it is whole, and the window's name and, on a thin
  window, the whole insufficient-sample notice print
- **AND** no text the chart draws overprints other text it draws

#### Scenario: Narrowing the window re-lays out the caption

- **GIVEN** the same store, with the Evening preset pressed at a supported
  desktop size
- **WHEN** the reader narrows the window to 832×720 and presses nothing
- **THEN** the Evening caption lies wholly inside the chart, with every word
  whole

#### Scenario: The supported desktop sizes keep the one-line caption

- **GIVEN** the same synthetic store
- **WHEN** Diagnose renders at 1280×720 and at 1440×900, and the reader
  presses each Window preset in turn
- **THEN** each preset's caption stands on one line, wholly inside the chart,
  with every word printed
- **AND** no text the chart draws overprints other text it draws

### Requirement: The Spotlight's middle-rank verdict line keeps every fact inside the chart

When the Spotlight's basal chart takes its middle rank, the two compressed
lines it draws in a seat narrower than its full layout, its verdict line (the
verdict word, the estimate, the estimate's range and the programmed rate)
SHALL lie wholly inside the chart and clear of the Keep control. This holds
whether the chart was drawn at that size or the window was resized to it.
Where those facts do not fit on one line, the line SHALL break between facts,
never inside one, and the tally line and the figure SHALL move down so that no
line overprints another. Where they fit on one line, the verdict line, the
tally line and the figure SHALL stand where they stood before. Every fact SHALL
print; none is shortened or dropped for room.

#### Scenario: The narrowest split keeps the programmed rate

- **GIVEN** a synthetic store whose next-in-line finding opens a basal slot
  with a programmed rate
- **WHEN** the window is narrowed to 832×720, and then to 832×560, with
  Diagnose at rest
- **THEN** the Spotlight's verdict line prints the verdict word, the estimate,
  its range and the programmed rate, each whole
- **AND** every line of it lies inside the chart and clear of the Keep control
- **AND** the tally line stands below the verdict line's last line

#### Scenario: A seat wide enough keeps one verdict line

- **GIVEN** the same synthetic store
- **WHEN** the window is set to 1200×736 with Diagnose at rest
- **THEN** the Spotlight's verdict line stands on one line

### Requirement: The glucose overview's header keeps its title at the narrowest split

The glucose overview's header SHALL stay one line at every width the two-pane
split forms at, truncating and never wrapping, and its provenance SHALL always
print whole. Between 832 and 1023 px wide, the All charts control SHALL show
its icon only, keeping the accessible name and tooltip "All charts", so that
the title "Glucose by time of day" draws, truncated with an ellipsis if it
must, and never collapses to nothing. From 1024 px wide the control SHALL show
its word, and at 1280×720 and 1440×900 the header SHALL be unchanged.

#### Scenario: The narrowest split draws the title

- **GIVEN** a synthetic store
- **WHEN** Diagnose renders at rest at 832×720 and at 832×560
- **THEN** the title draws at least its first letter and an ellipsis, inside
  the header
- **AND** the All charts control shows its icon, is named "All charts" and has
  the tooltip "All charts"
- **AND** the provenance prints whole, and the header stays one line

#### Scenario: Wider windows keep the header as it was

- **GIVEN** the same store
- **WHEN** Diagnose renders at rest at 1024×768, 1280×720 and 1440×900
- **THEN** the All charts control shows its word, and the title and the
  provenance print whole on one line

### Requirement: Chart furniture never strikes an axis label

No line, rule or numeral pad a Diagnose chart draws SHALL cross or cover one of
its axis labels. Where a glucose overview y-axis label would sit under a target
numeral, the label SHALL NOT print, and the numeral, which names the target
line there, SHALL print. The Spotlight's programmed-rate rule SHALL end at its
axis tick, above the tick labels. These hold at every size.

#### Scenario: The target numerals and the y-axis labels do not overprint

- **GIVEN** a synthetic store whose glucose axis starts 10 mg/dL below the
  target's lower bound
- **WHEN** Diagnose renders at 1280×720, 1440×900 and 832×720
- **THEN** no y-axis label overlaps a target numeral
- **AND** every target numeral prints

#### Scenario: The programmed rule stops above the tick labels

- **GIVEN** a basal slot whose programmed rate falls on an axis tick
- **WHEN** the Spotlight draws it, at either rank
- **THEN** the programmed rule ends at the axis tick, above that tick's label
