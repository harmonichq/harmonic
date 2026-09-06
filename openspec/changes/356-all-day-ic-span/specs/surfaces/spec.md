## ADDED Requirements

### Requirement: A carb-ratio block names its interval the way the server labels it

A Diagnose carb-ratio block SHALL name its interval with the day's far edge
spelled `24:00`, matching the span label the server publishes for that same
block, wherever the surface prints that interval — the parameter panel head, the
watch dock's staged title, the peak-hour block link, the selected-window chip and
the through-midnight sentence. A block covering the whole day SHALL NOT print a
zero-length interval.

The surface SHALL derive this name from one formatter, not a second copy of the
rule. A block's geometry — whether it runs through midnight, and the minute
ranges the canvas brackets — SHALL be unchanged by how its interval is named.

#### Scenario: The all-day block reads as a whole day

- **GIVEN** the server publishes a carb-ratio block starting at minute 0 and ending at its exclusive minute 1440
- **WHEN** the reader opens that block's panel from its findings-queue row
- **THEN** the panel head names the interval `00:00–24:00`
- **AND** the queue row's own served label for the same block still reads `00:00 to 24:00`
- **AND** staging the block prints that same interval in the watch dock

#### Scenario: A block that runs through midnight is unaffected

- **GIVEN** the server publishes a carb-ratio block whose end minute is at or before its start minute
- **WHEN** the reader opens that block's panel
- **THEN** the interval is named from its own start and end, as it is today
- **AND** the block is still marked as running through midnight
- **AND** the minute ranges the canvas brackets for it are unchanged
