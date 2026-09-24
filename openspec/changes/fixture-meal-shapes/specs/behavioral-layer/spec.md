## ADDED Requirements

### Requirement: A Pattern case file judges only the habit members in its rate family

A Pattern case file SHALL judge each roster row, and each selected Occurrence's
reason, by exactly the Pattern's habit members whose lever's rate family is the
Pattern's own rate family, where a lever's rate family is its evidence-population
policy's closed recurrence account. A member outside that family — a Sequence
habit, which has no rate family, or Correction stacking, which is counted over
correction clusters, under Lows after correcting highs — SHALL contribute no state
to a row's verdict and no habit entry to a reason, while it MAY still claim a row as
one of the Pattern's rate levers and be named as that row's cause. The fixture-only
Pattern case-file mirror the browser gates read SHALL apply the same rule, reading
each lever's rate family from a table its fixture generator freezes from that same
policy, and SHALL be held to the Python case producer by that producer's frozen
answers for rosters that admit an out-of-family member.

#### Scenario: An out-of-family member is judged by neither side

- **GIVEN** the browser-gate inputs with one added scenario Pattern for Correction
  stacking, whose real roster then carries `habit:correction_stacking` under Lows
  after correcting highs, and likewise one for High-carb sequence under Highs after
  meals
- **WHEN** the Python case producer and the fixture-only mirror each serve that
  Pattern's clock case, whole and selected at its first Occurrence
- **THEN** both serve the same verdict counts and the same verdict and member for
  every row, in order
- **AND** both selected reasons carry habit entries for in-family levers only —
  Correction on active insulin; Carb undercount and Late bolus — and are equal

#### Scenario: The mirror's family table is the policy's

- **GIVEN** the committed event-comparison capture
- **WHEN** its lever rate-family table is regenerated from the evidence-population
  policy
- **THEN** it carries one entry per Lever, equal to that Lever's rate family or
  null, and its drift check fails when the committed table differs

### Requirement: Manufactured browser-gate exposure rows carry only shapes the exposure feed can serve

Every exposure Occurrence the Diagnose workstation fixture generator manufactures
SHALL carry only what the real exposure feed can serve for its family: the anchor
kind and label the episode view serves for that family (low · Low, meal · Meal
bolus, high · High, correction · Correction); exactly the classifier verdicts the
attribution step judges at that anchor kind (a low: Over-treated low and Correction
on active insulin; a meal: Carb undercount, Late bolus and Meal over-delivery; a
high: Missed / unannounced meal and Meal bolus fell short; a correction alone in its
episode: none), each silence reason from the closed silence-reason set; on a claimed
row whose claiming lever is judged at its anchor kind, that lever's verdict matched
with its sentence as the row's cause text and every other judged classifier
unmatched; on an unclaimed row, every judged classifier unmatched and no cause text;
a cause text in the claiming lever's own sentence form; and on a High, an anchor
glucose at or above the high-anchor threshold. Each row's identity, time, date,
dose, carbs, worst reading, state, claim and attributed levers SHALL be unchanged,
and so SHALL every family tally, the Pattern roster, and every findings-projection
row's membership, order, count sentences and headline. A Finding's verdict band
SHALL move only on claimed rows, as the unchanged row-relative verdict rule reads
their new verdicts.

#### Scenario: Every manufactured row is a servable shape

- **GIVEN** the committed workstation payload
- **WHEN** each of its exposure Occurrences is read
- **THEN** its kind, label and judged classifier set are its family's
- **AND** no verdict names a classifier that is not a Lever or a silence reason
  outside the closed set
- **AND** a claimed row's own judged lever reads matched with its detail equal to
  the row's text, and a High's anchor glucose reaches the high-anchor threshold

#### Scenario: Only claimed rows' verdict bands move

- **GIVEN** the workstation payload before and after its rows took these shapes
- **WHEN** the findings projection is served in the whole day and every browser
  window
- **THEN** the family tallies, the Pattern roster, and every row's membership,
  order, count sentences and headline are unchanged
- **AND** in the whole day Late bolus reads 2 fired where it read 2 outranked,
  Missed / unannounced meal 3 fired where it read 3 outranked, Correction on active
  insulin 3 fired and 17 outranked where it read 0 and 20, and Over-treated low 15
  fired and 3 outranked where it read 18 and 0

#### Scenario: A claimed meal's cause reads as its own lever

- **GIVEN** the Highs after meals clock case the projection fixture freezes
- **WHEN** its claimed meal is selected
- **THEN** its anchor kind is meal and its cause text is the Late bolus sentence
- **AND** each habit entry carries its recorded sentence where that verdict reads
  as the entry's verdict
