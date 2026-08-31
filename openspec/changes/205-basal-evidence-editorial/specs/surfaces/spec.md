## ADDED Requirements

### Requirement: The basal evidence tile states its finding and draws each night as an independent delta

The Diagnose basal evidence tile SHALL render one treatment: a factual headline
stating the finding, one cell per steady night anchored on the programmed rate
and extending only that night's deviation, the analyzer's interval and estimate
drawn on the same rate axis, and a verdict rail carrying the backend verdict
word with the direction counts and the excluded-night count. No mark may span
more than one night, no mode toggle is offered, and every fact prints in
exactly one place on the tile. The tile SHALL adapt by measured width: full
furniture, a compressed middle rank, and a silhouette-only miniature.

#### Scenario: A slot with a held verdict renders without re-deriving it

- **WHEN** the basal night-evidence payload carries `asserts_move: false` with a held safety status
- **THEN** the tile prints the backend verdict word and the served counts
- **AND** draws each night's delta from the served programmed rate
- **AND** derives no direction, floor, or threshold of its own

#### Scenario: A payload without an estimate still renders

- **WHEN** the payload's estimate is absent or incomplete
- **THEN** the tile renders the nights and the programmed rule without interval or estimate marks
- **AND** the verdict rail says the estimate is unavailable rather than inventing one

#### Scenario: A night beyond the axis ceiling stays disclosed

- **WHEN** a night's delivered rate exceeds the computed axis ceiling
- **THEN** its cell caps at the ceiling with an overflow mark
- **AND** the tile prints the true value
