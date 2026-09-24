## ADDED Requirements

### Requirement: The carb-ratio evidence tile opens on its meals and keeps its runs and its clock

The Diagnose carb-ratio evidence tile SHALL offer three views and open on By meal:
every meal dosed in the block's hours on its own five-hour clock from its bolus,
through the Pattern comparison chart's form, in served ran-high, ran-low and
in-range cohorts whose counts the key names. Its Runs view SHALL draw one strip per
served run, sorted by served ratio with pooled runs first and excluded runs dimmed
under their served reason in reader words; each strip the run's glucose from the
block-hours meal in hours, that meal filled and later chain meals open, served
lows and above-range points marked, correction ticks at their offsets, and the
run's served balance sheet and ratio against the programmed value at its edge.
Its By clock view SHALL draw the served programmed ratio as a rule, the served
estimate band, each run's ratio at its meal start with its served side, and
shared runs distinctly by ownership. Every key SHALL name only what its series
contain; no series SHALL be named directional-only unless every member is; every
axis SHALL be bounded to served evidence; every strip, point and marker SHALL
have a hover and keyboard readout naming its run. The tile SHALL derive no
reason, side, count, threshold or direction.

#### Scenario: The block opens on By meal

- **WHEN** the reader opens a carb-ratio block from its findings-queue row
- **THEN** the tile shows By meal with three named cohorts whose counts equal the
  served tally, and Runs and By clock are one toggle away

#### Scenario: An excluded run is never keyed directional-only

- **GIVEN** a served run whose pool reason is "no outcome read"
- **WHEN** the Runs view renders
- **THEN** that run's strip is dimmed under "no outcome read" and appears in no
  series named directional-only

### Requirement: The carb-ratio block panel explains its verdict

The Diagnose carb-ratio block panel SHALL render, beneath its numbers-and-staging
block, which renders exactly as shipped: a scope line stating that the ledger
closes at the end of each meal chain and how many whole runs and how much
carb-share credit from runs shared with the neighbouring block make the served
support; the served balance sheet with its pooled quotient labelled beside the
fitted estimate; the served outcome counts as a count sentence and the served
median minutes to the attributed low; the served reconciling sentence verbatim;
the harm arm's attributed lows as rows through the shared occurrence-roster
mechanism, headed by the served seriousness and gate or nudge, each opening Day at
its moment with it ringed; and a run roster through the same mechanism grouped
counted whole, counted by share, then one group per served exclusion reason, each
row printing the run's start, meals, carbs, effective insulin, ratio and, for a
shared run, its ownership, with selection shared with the Runs view and each
selected run opening Day at its first meal with it ringed. The Day hop SHALL work
when the block was opened from its queue row and when it was opened from a case
head's View segment. While the evidence is loading or unavailable the panel SHALL
print one empty-state line and render no roster, tally or lows from a payload not
received. The panel SHALL derive no count, reason, side, direction or floor, and
the support line SHALL link the glossary's Meal run entry.

#### Scenario: The panel reconciles the verdict with the meals

- **GIVEN** a served block asserting a raise whose tally counts more ran-high than
  ran-low meals and whose harm evidence lists attributed lows
- **WHEN** the reader opens its panel
- **THEN** the balance sheet, the count sentence, the served reconciling sentence,
  the seriousness word and one row per attributed low all render from the served
  payload, and the numbers-and-staging block is unchanged

#### Scenario: The Day hop works from View segment

- **WHEN** the reader opens a carb-ratio block from a case head's View segment and
  presses Open in Day on a selected run
- **THEN** Day opens at that run's first meal with the moment ringed

### Requirement: Meal run is defined where the reader meets it

The desk glossary's carb-ratio group SHALL define Meal run, Support, Directional-only
and Chain-end read, and CONTEXT.md SHALL carry a Meal run entry; the block panel's
support line SHALL link the glossary entry.

#### Scenario: The glossary names the term

- **WHEN** the glossary is rendered
- **THEN** the carb-ratio group contains Meal run, Support, Directional-only and
  Chain-end read
