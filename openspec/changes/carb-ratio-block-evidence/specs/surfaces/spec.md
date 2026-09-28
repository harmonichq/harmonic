## ADDED Requirements

### Requirement: The carb-ratio evidence tile draws its counted runs as a ratio strip over a run timeline

The Diagnose carb-ratio evidence tile SHALL offer one view and no view toggle, in
two lanes sharing one time axis. The ratio strip SHALL draw each counted meal run
as one dot at its served measured ratio, sized by its served fit weight, filled
when it counts whole and a ring when it counts by carb share, against the served
programmed, recommended and estimated ratios as three labelled rules and the
served estimate's range as a faint band; a block that serves no recommendation
SHALL draw no recommended rule. The run timeline SHALL draw each counted run as a
stem from its served glucose at the bolus to its served glucose where the run
ended, by date, between the served band edges, and every low the harm arm lists
as a triangle at its glucose, filled when the low is on a counted run and outlined
otherwise. The tile SHALL draw no per-meal mark. Hovering or keying to a run's dot
SHALL read out the run's served ledger terms and how it ended; hovering a low SHALL
read out its served minutes after its bolus. A click, or Enter after the arrow
keys, SHALL select a run, and the selected run SHALL be ringed on both lanes. Each
lane's key SHALL name only the marks drawn in it, filled or hollow as they are
drawn, and the tile's read-aloud text SHALL end with the block's served state. The
drawer thumbnail and the queue row's mini SHALL draw the ratio strip alone. The
tile SHALL derive no ratio, weight, side, end, group, band, count or direction.

#### Scenario: The block opens on its one view

- **WHEN** the reader opens a carb-ratio block from its findings-queue row
- **THEN** the tile shows the ratio strip over the run timeline, with one dot and
  one stem per served counted run and no view toggle

#### Scenario: A run's hover reads out the insulin behind it

- **GIVEN** a served counted run with its ledger terms and its end
- **WHEN** the reader hovers its dot, or keys to it with the arrow keys
- **THEN** the readout names that run's served ledger terms and how it ended, and
  pressing Enter rings the run on both lanes

#### Scenario: A low on an uncounted run is outlined

- **GIVEN** a listed low whose served group is a run not counted
- **WHEN** the run timeline renders
- **THEN** that low is an outlined triangle and the key names it as a low on a run
  not counted

### Requirement: The carb-ratio block panel explains its move

The Diagnose carb-ratio block panel SHALL render, beneath its numbers-and-staging
block, which renders exactly as shipped, three captioned sections of one-sentence
lines, each printed from served facts and left out when those facts are empty.
"Why this move" SHALL print how many counted runs measured looser or tighter than
the programmed ratio and that the estimate's range leaves it out; one fixed
sentence saying the ratio counts all the insulin a run used, with the glucose
change converted at the correction factor, judged where the run ended; how many
counted runs ended after a later meal past the block's end, and how many ended
lower, about flat or higher; and the served recommendation reason verbatim. "The
case against" SHALL print how many of the block's meals on counted runs peaked
above the served band before their next bolus, and how many counting later meals
within the post-meal window. The lows section SHALL print the served count and
range of minutes after the bolus with the served bearing sentence, then every low
the harm arm lists as a row through the shared Occurrence roster, grouped on
counted runs, on runs not counted, and after a bolus that is not one of these
meals, each group headed by its served count; each row SHALL open Day at the low's
own moment with it ringed, and hovering or focusing a row SHALL select its run on
the tile. The Day hop SHALL work when the block was opened from its queue row and
when it was opened from a case head's View segment. While the evidence is loading
the panel SHALL print "Loading run evidence…"; when it is unavailable, stale or
malformed the panel SHALL print "Run evidence unavailable." beneath an intact
numbers block and render no section from a payload not received. A block the
analyzer serves as collecting, below its floor or unmeasured alone SHALL keep its
numbers block and gain no section. The panel SHALL derive no count, side, end,
group, band, direction or sentence.

#### Scenario: The panel explains a raise

- **GIVEN** a served block asserting a raise, with counted runs, meals peaking above
  the band before their next bolus, and listed lows in more than one group
- **WHEN** the reader opens its panel
- **THEN** "Why this move", "The case against" and the lows section render from the
  served payload, one row per listed low under its served group, and the
  numbers-and-staging block is unchanged

#### Scenario: The Day hop works from View segment

- **WHEN** the reader opens a carb-ratio block from a case head's View segment and
  presses a listed low
- **THEN** Day opens at that low's moment with it ringed

#### Scenario: An unmeasured block gains no section

- **GIVEN** a served block whose state is collecting, below its floor or unmeasured
  alone
- **WHEN** the reader opens its panel
- **THEN** only the numbers-and-staging block renders

#### Scenario: A malformed payload keeps the numbers

- **GIVEN** a block-evidence response missing a fact the panel prints
- **WHEN** the reader opens the block's panel
- **THEN** the numbers-and-staging block renders intact with "Run evidence
  unavailable." beneath it, and no section renders

### Requirement: Meal run is defined where the reader meets it

The desk glossary's carb-ratio group SHALL define Meal run, Support, Directional-only
and Chain-end read, and CONTEXT.md SHALL carry a Meal run entry.

#### Scenario: The glossary names the term

- **WHEN** the glossary is rendered
- **THEN** the carb-ratio group contains Meal run, Support, Directional-only and
  Chain-end read
