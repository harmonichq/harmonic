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

### Requirement: Manufactured browser-gate rows carry only shapes their producer can serve

Every exposure Occurrence the Diagnose workstation fixture generator manufactures
SHALL carry only what the real exposure feed can serve for its family: the anchor
kind and label the episode view serves for that family (low · Low, meal · Meal
bolus, high · High, correction · Correction); exactly the classifier verdicts the
attribution step judges at that anchor kind (a low: Over-treated low and Correction
on active insulin; a meal: Carb undercount, Late bolus and Meal over-delivery; a
high: Missed / unannounced meal and Meal bolus fell short; a correction: Correction
stacking, and only as its episode's stacking dose or last correction); each silence
reason from the closed silence-reason set; a claim only by a lever the attribution
step can drive from that anchor kind, so a correction row is claimed by Correction
stacking and never by Correction on active insulin, which only a low drives; on a
claimed row, its claiming lever's verdict matched, with that verdict's sentence as
the row's cause text, and every other judged classifier unmatched; on an unclaimed
row, every judged classifier unmatched and no cause text; and on a High, an anchor
glucose at or above the high-anchor threshold. A manufactured case-file member its
lever claims SHALL carry its recorded sentence as its cause text, as the producer's
attribution does. The event-comparison capture's comparison rows SHALL judge at each
anchor only the classifiers the attribution step judges at that anchor kind. Each
row's identity, time, date, dose, carbs, worst reading and state SHALL be
unchanged, and so SHALL the Pattern roster. The findings projection SHALL move only
as the unchanged projection reads these rows: the claimed rows' verdict bands, and
the rows, appearances, chips, counts and sentences the correction rows' Correction
stacking claim moves, each recorded in the change's design.

#### Scenario: Every manufactured row is a servable shape

- **GIVEN** the committed workstation payload
- **WHEN** each of its exposure Occurrences is read
- **THEN** its kind, label and judged classifier set are its family's
- **AND** no verdict names a classifier that is not a Lever or a silence reason
  outside the closed set
- **AND** a claimed row's claiming lever is one its anchor kind can drive, and that
  lever's verdict reads matched with its detail equal to the row's text
- **AND** a High's anchor glucose reaches the high-anchor threshold

#### Scenario: The projection moves only as the rows require

- **GIVEN** the workstation payload before and after its rows took these shapes
- **WHEN** the findings projection is served in the whole day and every browser
  window
- **THEN** the Pattern roster, and every row other than Late bolus, Missed /
  unannounced meal, Over-treated low, Correction on active insulin and Correction
  stacking, keep their membership, order, sentences and headline
- **AND** in the whole day Late bolus reads 2 fired where it read 2 outranked,
  Missed / unannounced meal 3 fired where it read 3 outranked, and Over-treated low
  15 fired and 3 outranked where it read 18 and 0
- **AND** in the whole day Correction on active insulin appears in lows only, with
  3 episodes, 3 fired and 15 outranked, and a Correction stacking row follows it,
  showing up in 2 of 2 correction clusters

#### Scenario: A claimed meal's cause reads as its own lever

- **GIVEN** the Highs after meals clock case the projection fixture freezes
- **WHEN** its claimed meal is selected
- **THEN** its anchor kind is meal and its cause text is the Late bolus sentence

## MODIFIED Requirements

### Requirement: A selected case-file Occurrence serves why it was judged

A selected Occurrence's case-file detail SHALL serve a reason built from the claim
account and verdict states its roster row was built from, and SHALL never disagree
with the row's served verdict. The reason's cause SHALL be present exactly when
the row is claimed in the case file's claim account and SHALL name the claimant:
the case lever for a claimed single-habit row, the served member habit for a
claimed Pattern row. It SHALL carry the claimant's title and the attributed
narrative text the analyzer published for that claim, or an empty text when the
claimant did not drive the Occurrence's episode. The reason SHALL carry one habit
entry per habit the roster judged for the row with exactly the verdict the roster
assigned: a single-habit row's one entry carries the row's verdict; a Pattern
row's entries carry each habit's row-relative state, mapped from fired to
outranked on an unclaimed row as the roster maps it, with the claimant's entry
fired on a claimed row. Each entry SHALL carry the classifier's recorded sentence
at that anchor only when that recorded verdict reads as the entry's verdict (or
as fired for an entry an unclaimed Pattern row maps to outranked), and a null
sentence otherwise. On a claimed row, the claimant's entry SHALL carry a null
sentence when its recorded sentence is the cause's text, so the reason serves that
sentence once, as the cause's text. A correction cluster SHALL be judged by its
Correction stacking verdict. The Missed / unannounced meal comparison's
announced-meal detail SHALL serve its bolus's dose and carbs, its Arc peak, and a
reason with no cause and no habit entries.

#### Scenario: A meal claimed by Meal bolus short inside a Pattern

- **GIVEN** analyzer output in which Meal bolus short claims a meal that belongs
  to a chartable Highs after meals Pattern roster
- **WHEN** that Occurrence is selected in the Pattern case file
- **THEN** its reason names the Meal bolus short cause, with the exposure text
  only when Meal bolus short drove that meal's episode and an empty text otherwise
- **AND** its habit entries carry the Pattern's per-habit states and no sentence
  that reads otherwise

#### Scenario: Every reason agrees with its row

- **GIVEN** single-habit and Pattern case files prepared from analyzer output
- **WHEN** every Occurrence of each is selected
- **THEN** a cause is present exactly on claimed rows and names the claimant
- **AND** a single-habit row's verdict equals its one entry's verdict, an
  unclaimed Pattern row's verdict is its highest-precedence entry or clean when it
  has none, and a claimed row is fired
- **AND** every served sentence's recorded verdict reads as its entry's verdict

#### Scenario: A claimed row serves its sentence once

- **GIVEN** analyzer output in which a claimant's recorded sentence at the claimed
  anchor is also its attributed narrative, as for Carb undercount, Over-treated
  low, Correction on active insulin, Correction stacking and Missed / unannounced
  meal
- **WHEN** a claimed Occurrence is selected in a single-habit case file and in a
  Pattern case file
- **THEN** the cause carries that sentence as its text
- **AND** the claimant's habit entry carries a null sentence, and no habit entry's
  sentence equals the cause's text
