## ADDED Requirements

### Requirement: A scoped window serves a Pattern when its outcomes land in it

For a named or drawn clock window, the scoped Pattern roster SHALL carry, and the
findings projection SHALL serve as a row, exactly the `remain_pattern` Patterns
whose outcomes land in that window. An Exposure-family Pattern lands there when
its outcome-anchored count in the window is above zero, whether or not it is
admitted. The harm-band Pattern, "Overnight lows with no insulin on board", lands
there when the window overlaps the Harm signal's 00:00–06:00 band and its band
count of source nights is above zero; it SHALL keep the k and n counted over the
whole band, and in a scoped window its count sentence SHALL name the band. Whether
a Pattern row carries a chart coordinate, and so a case file, SHALL remain the
chartability predicate's alone and SHALL NOT decide membership. The browser-gate
findings mirror SHALL serve the same rows from the server's frozen scoped roster.

#### Scenario: The Overnight window serves the overnight-lows Pattern

- **GIVEN** the manufactured case `basal-recurring-low-lower`
- **WHEN** the findings projection publishes the 00:00–06:00 window
- **THEN** `pattern:overnight_lows_no_iob` is served with the k, n, admission
  route and Priority of its whole-day row, `window_scope` "window" and no chart
- **AND** its count sentence reads "2 of 30 nights ran low between 00:00 and
  06:00"

#### Scenario: A window reaching part of the band serves the band counts

- **GIVEN** the same case
- **WHEN** the findings projection publishes 02:00–05:00
- **THEN** the overnight-lows Pattern is served with its whole-band k and n and
  the sentence naming the band

#### Scenario: A window clear of the band serves no overnight-lows Pattern

- **GIVEN** the same case
- **WHEN** the findings projection publishes 14:00–21:00
- **THEN** neither its rows nor its published roster carry the overnight-lows
  Pattern

#### Scenario: Setting-staged and unadmitted Patterns join a scoped window

- **GIVEN** the findings-fixture projection
- **WHEN** it publishes the explicit 00:00–24:00 scope
- **THEN** it serves every whole-day Pattern row whose n is above zero, Lows
  after meals and Lows after correcting highs among them
- **AND** every rate-lever cause row carries the same `claimed_by` as in the
  whole day, and every `claimed_by` names a served Pattern row

### Requirement: The findings queue serves one urgency ranking

The findings projection SHALL present the one urgency ranking without giving a
Priority two ranked positions. A Pattern served with admission route
`setting_staging` SHALL carry `anchored_by`, the id of the first served, priced,
asserting row of its setting's parameter in queue order (for the harm-band
Pattern, only such a row whose span lies inside the 00:00–06:00 band), and SHALL
sort directly after that row, its claimed causes directly after it. With no such
row served it SHALL carry no anchor. Its Priority SHALL remain the Pattern producer's.

The served tiers SHALL be bands of the ranking: the leading run of priced,
top-level asserting rows is `next_in_line`, every later priced top-level row is
`worth_a_look`, an anchored Pattern takes its anchor's tier, a claimed cause keeps
`worth_a_look` when priced, and every unpriced row is `noted`. Among unpriced
ranked rows, asserting rows SHALL sort before findings.

Each row SHALL carry `rank_note`: "Ranked with its setting" on an anchored
Pattern; "Ranked on all N days", N the analysis window, on a priced top-level
Pattern or Cause row in a scoped window; null otherwise. No Priority, Priority
input, Pattern price, support floor, staging predicate or cap SHALL change.

#### Scenario: A Pattern admitted through its setting shares its setting's position

- **GIVEN** the findings-fixture projection's whole day
- **WHEN** the queue is published
- **THEN** Highs after meals and Lows after meals carry `anchored_by` "ic:720" and
  follow it, and the overnight-lows Pattern carries `anchored_by` "basal:30-90"
  and follows it, each with `rank_note` "Ranked with its setting"
- **AND** every top-level `next_in_line` row precedes every top-level
  `worth_a_look` row

#### Scenario: A scoped window says the rank is taken from all 30 days

- **GIVEN** the findings-fixture projection's 14:00–21:00 window
- **WHEN** the queue is published
- **THEN** `finding:over_treated_low` carries `rank_note` "Ranked on all 30 days"
- **AND** no setting row carries a `rank_note`

#### Scenario: A setting-admitted Pattern whose setting is outside the window ranks alone

- **GIVEN** the findings-fixture projection's 06:00–11:00 window, which serves
  no asserting carb-ratio row
- **WHEN** the queue is published
- **THEN** Highs after meals carries no anchor and `rank_note` "Ranked on all 30
  days"

#### Scenario: The overnight Pattern never anchors beneath a daytime basal row

- **GIVEN** the findings-fixture inputs with 05:30 quiet and a supported 06:30
  basal raise
- **WHEN** the findings projection publishes 05:00–08:00
- **THEN** the overnight-lows Pattern carries no anchor and `rank_note` "Ranked
  on all 30 days"

#### Scenario: An asserting row that cannot stage sorts before the unranked findings

- **GIVEN** the findings-fixture inputs with the direction-only
  correction-factor weaken and no Pattern roster, so two unpriced causes with one
  episode each are top-level rows
- **WHEN** the whole-day queue is published
- **THEN** the correction-factor row, unpriced, sorts before both causes
