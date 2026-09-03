## ADDED Requirements

### Requirement: The Diagnose stage holds the active finding's chart

The Diagnose evidence stage SHALL hold the active finding's chart: the
rank-1 finding's chart while the findings queue shows, the drilled finding's
chart while a drill is open, and the rank-1 chart again when the reader leaves
the drill. A chart picked from the explorer SHALL open that chart's finding
through the one chart-click route. The stage chart SHALL keep its drawer cell
as the marked current frame.

#### Scenario: Leaving a drill returns the rank-1 chart to the stage

- **GIVEN** a populated synthetic Diagnose window whose rank-1 finding differs from a lower-ranked one
- **WHEN** the reader drills the lower-ranked finding and then returns to the findings queue
- **THEN** the stage holds the rank-1 finding's chart
- **AND** the drilled chart's drawer cell is no longer the current frame

#### Scenario: An explorer pick opens the finding

- **WHEN** the reader picks a chart from the explorer
- **THEN** the explorer closes, that chart holds the stage, and its finding's drill is open

### Requirement: The charts drawer is a picker that opens minimized

The charts drawer SHALL open hidden and SHALL never return on its own; a field
shrinking past the dock floor MAY hide it, and a field growing back SHALL NOT
re-dock it. Picking a chart from the drawer — by cell click, by Enter on a
cell, from a Watching tail cell, or from the explorer — SHALL seat and drill
that chart and put the drawer away. The bring-up control, the show-every-chart
control and chart fullscreen SHALL remain.

#### Scenario: The drawer opens hidden and stays hidden across a resize

- **GIVEN** a fresh visit to a populated synthetic Diagnose window
- **THEN** the drawer is hidden and the stage holds the rank-1 chart
- **WHEN** the field shrinks below the dock floor and grows back above it
- **THEN** the drawer is still hidden

#### Scenario: A pick puts the drawer away

- **GIVEN** the reader has brought the drawer up
- **WHEN** the reader picks a chart from it
- **THEN** that chart holds the stage with its finding's drill open
- **AND** the drawer is hidden

### Requirement: Every findings row carries one served headline

Every row the findings projection publishes, in every register, SHALL carry a
`headline`: a factual sentence composed only from facts the row carries or the
analyzer output its evidence endpoint reads, never stating a count, direction
or verdict the analyzer did not publish, and identical across reruns of the
same window. The Diagnose stage card's title SHALL render that headline
verbatim and SHALL be its only home: the chart SHALL NOT draw it, drawer cells
SHALL keep the short nameplate, and no drill level SHALL repeat it.

#### Scenario: A held slot's headline names the withheld move

- **WHEN** the projection publishes a basal row in the `held` register
- **THEN** its headline states that no change is recommended for the slot and why, from the served hold reason

#### Scenario: The stage title is the headline's only home

- **GIVEN** a populated synthetic Diagnose window
- **WHEN** any family's chart holds the stage
- **THEN** the stage card's title equals that row's served headline
- **AND** the headline text appears nowhere else on the surface

### Requirement: Headlines are authored with the operator from the engine's facts

Before a headline template is served, the operator SHALL author example
sentences against a generated facts sheet covering every findings row the QA
showcase publishes, and each family's template for each register SHALL be
recorded as a dated operator sanction in the change's design record. A served
template without its sanction is a defect.

#### Scenario: Every served template has its sanction

- **WHEN** the projection serves a headline for a family and register
- **THEN** the change's design record carries a dated sanction naming that family, register and template

### Requirement: A revision of the Diagnose left column ships with its ledger amendments and evidence

A revision of the shipped Diagnose left column SHALL amend the frozen behavior
ledger and its app-only replay for every added, changed, moved or retired
behavior in the same change, with each retirement carrying its dated operator
sanction, and SHALL store before/after renders of every affected state from
the base and the revision served on the same synthetic database.

#### Scenario: The replay proves the revision

- **WHEN** the amended replay runs against the built revision on the declared no-fetch server
- **THEN** it reports its applicable story count, zero failures and no skipped story
- **AND** every retired story prints its sanction

## MODIFIED Requirements

### Requirement: The basal evidence tile states its finding and draws each night as an independent delta

The Diagnose basal evidence tile SHALL render one treatment: one cell per
steady night anchored on that night's own served programmed rate and extending
only its deviation (the drawn rule is the current programmed rate; direction
comes from the served per-night sign), the analyzer's interval and estimate
drawn on the same rate axis, and a verdict rail carrying the backend verdict
word with the direction counts and the excluded-night count. The finding's
headline is the row's served sentence in the stage card's title, not a mark on
the tile. No mark may span more than one night, no mode toggle is offered, and
every fact prints in exactly one place on the tile. The tile SHALL adapt by
measured width: full furniture, a compressed middle rank, and a silhouette-only
miniature.

#### Scenario: A slot with a held verdict renders without re-deriving it

- **WHEN** the basal night-evidence payload carries `asserts_move: false` with a held safety status
- **THEN** the tile prints the backend verdict word and the served counts
- **AND** draws each night's delta from the served programmed rate
- **AND** derives no direction, floor, or threshold of its own

#### Scenario: A payload without an estimate still renders

- **WHEN** the payload's estimate is absent or incomplete
- **THEN** the tile renders the nights and the programmed rule without interval or estimate marks
- **AND** the verdict rail says the estimate is unavailable rather than inventing one

#### Scenario: A night without a programmed rate on file stays distinct

- **WHEN** a night's `programmed_rate` is null
- **THEN** the tile counts it in its own rail row rather than as exactly-as-set
- **AND** marks it at its delivered rate in excluded ink at the foot of the stack

#### Scenario: A night beyond the axis ceiling stays disclosed

- **WHEN** a night's delivered rate exceeds the computed axis ceiling
- **THEN** its cell caps at the ceiling with an overflow mark
- **AND** the tile prints the true value

#### Scenario: The tile draws no headline

- **WHEN** the basal tile renders at full furniture
- **THEN** no headline sentence is drawn on the chart
- **AND** the stage card's title carries the row's served headline
