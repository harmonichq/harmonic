## ADDED Requirements

### Requirement: The basal lane stays reachable on short desktop windows

At every viewport where Diagnose forms its two-pane split, every entry of the
basal lane's head row (its key) and every one of its cells SHALL be fully
visible inside the canvas pane. Horizontally they SHALL lie inside the pane at
rest. Vertically they SHALL lie inside it at rest, or be reachable by scrolling
the canvas pane alone. When the pane is too narrow for the key on one line, the
key SHALL wrap between whole entries; an entry SHALL never be split or cut
off. The lane SHALL never be clipped out of reach. Reaching it SHALL never
scroll the document, and the pane SHALL never scroll sideways. At the two
supported desktop sizes, 1280×720 and 1440×900, the key SHALL stand on one
line, the lane SHALL stand wholly inside the canvas pane at rest, and the
canvas pane SHALL have no scroll range. At each split viewport, every slot the
key counts as raise or lower SHALL be selectable with the pointer without
resizing the window, and selecting it SHALL open its panel with its Stage
change control. The Spotlight, the glucose overview and its clock-window
gestures, All charts and fullscreen SHALL keep their behavior. No staging,
verdict or ranking decision moves.

#### Scenario: A short desktop window keeps the lane within reach

- **GIVEN** a synthetic store whose lane serves raise, lower, hold,
  insufficient and no-data slots
- **WHEN** Diagnose renders at 1200×736, 1200×560 and 832×560
- **THEN** every key entry and every cell lie horizontally inside the canvas
  pane's visible box at rest, and vertically inside it either at rest or after
  the reader scrolls the canvas pane
- **AND** the glucose chart above the lane lies horizontally inside the pane,
  in register with the cells
- **AND** the document does not scroll, the pane does not scroll sideways, and
  no other container moves
- **AND** at each of those sizes, each raise and lower cell, pointed at where
  the reader sees it, opens its panel with a Recommended value and a Stage
  change control

#### Scenario: The supported desktop sizes show the whole lane at rest

- **GIVEN** the same synthetic store
- **WHEN** Diagnose renders at 1280×720 and at 1440×900
- **THEN** the key stands on one line, and every key entry and every cell lie
  wholly inside the canvas pane without any scrolling
- **AND** the canvas pane has no scroll range

### Requirement: The basal lane key names a recurring-lows lower apart from a measured lower

A slot the backend serves as "lower (recurring lows)" SHALL count in the lane
key under its own entry, "lower · recurring lows", and not under "lower". That
entry SHALL keep the lower paint and glyph that its cells share, and each such
cell's name SHALL say that the lower comes from recurring lows. The entry SHALL
be read from the served status alone: the frontend SHALL count no nights, apply
no floor and decide no direction for it, and whether the slot stages SHALL stay
the backend's verdict. A lane with no such slot SHALL show its key unchanged.

#### Scenario: A thin recurring-lows lower has its own key word

- **GIVEN** a synthetic store whose only asserting slot is served as
  "lower (recurring lows)" with no steady nights
- **WHEN** the lane renders
- **THEN** the key reads "lower · recurring lows 1" and has no "lower" entry
- **AND** that cell paints the lower fill and downward glyph, and its name says
  the lower comes from recurring lows
- **AND** its panel reads "lower (recurring lows)" with a Recommended value and
  a Stage change control

#### Scenario: A measured lower keeps the plain word

- **GIVEN** a synthetic store whose lower slot is a measured lower
- **WHEN** the lane renders
- **THEN** the key reads "lower 1" and has no "lower · recurring lows" entry

### Requirement: Each basal key verdict agrees with its slot's panel

Every slot the key counts as raise or lower SHALL open a panel with a
Recommended value and a Stage change control. Every slot the key counts as
hold, insufficient or no data SHALL open a panel that says no direction is
asserted and offers no Stage change control. The key, the cell and the panel
SHALL read the same served staging verdict.

#### Scenario: Opening each counted slot

- **GIVEN** a synthetic store whose lane serves raise, lower, hold,
  insufficient and no-data slots
- **WHEN** the reader opens each slot at a supported desktop size
- **THEN** each raise and lower slot shows a Recommended value and a Stage
  change control
- **AND** each hold, insufficient and no-data slot says no direction is asserted
  and shows no Stage change control
