## ADDED Requirements

### Requirement: A merged parameter finding stages every member the server published

A Diagnose findings row that names a span of several parameter slots SHALL stage
every member the projection published for that row, and only those members whose
own backend staging verdict is true. Membership SHALL be read from the row's
served member list; the surface SHALL derive it from no row id, title, or clock
arithmetic, and SHALL re-derive no floor, threshold, direction or safety verdict
for any member. Un-staging SHALL remove exactly the set staging added, and the
surface's staged tally, its staging control's state, the parameter lane's staged
marks, the watch dock's line and the Plan badge SHALL all describe that one set.
A finding whose published membership is a single slot SHALL stage exactly that
slot, unchanged.

A detail panel that shows one member of such a finding SHALL name the finding's
span and say that staging acts on the whole run, and SHALL keep printing that
member's own Current, Estimate and Recommended rather than a span figure. The
watch dock SHALL name the staged span in every case, and SHALL print a
current-to-recommended number pair only where every staged member carries the
same pair.

#### Scenario: A merged basal finding stages both its half hours

- **GIVEN** the findings queue publishes one basal row whose served members are
  two contiguous half-hour slots, each carrying a true staging verdict with its
  own current and recommended rate
- **WHEN** the reader opens that row and uses its staging control
- **THEN** the Plan draft holds one item per published member, each with that
  member's own current and recommended value
- **AND** the watch dock names the row's whole span
- **AND** the Plan badge counts every staged member

#### Scenario: Un-staging removes exactly what staging added

- **GIVEN** a merged basal finding is staged from its own panel
- **WHEN** the reader undoes it from that panel
- **THEN** every item that staging added leaves the Plan draft
- **AND** no member of the run remains staged in the surface's own tally, lane
  marks or dock line

#### Scenario: A member panel says which run it belongs to

- **WHEN** the reader opens a panel for one member of a multi-member finding
- **THEN** the panel names the finding's span and states that staging acts on the
  whole run
- **AND** the panel's Current, Estimate and Recommended remain that member's own
  served numbers

#### Scenario: A single-slot finding is unchanged

- **WHEN** the reader opens and stages a finding whose published membership is one
  slot
- **THEN** the Plan draft holds exactly that one item
- **AND** the panel carries no span statement beyond the slot's own clock span
