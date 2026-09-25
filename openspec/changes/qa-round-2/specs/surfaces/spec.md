## ADDED Requirements

### Requirement: The watch dock reports the saved Plan draft

The Diagnose watch dock SHALL read the guidance read's served Plan draft. Its
precedence is unchanged: a watched Trial, then a watched Focus, then a recorded
Plan awaiting the pump, then a staged Plan, then idle. The staged Plan state
SHALL read "Plan · staged" whenever the served draft holds items and no stage
save the surface issued is in flight, even when the Diagnose surface marks
nothing as staged. When the surface's own staged marks name a change, the dock
SHALL name it as it does today, with the served direction and values. When they
name none, the dock SHALL name the draft from its own items: the setting in the
wearer's words and the span the items cover, with no direction. It SHALL print a
current-to-proposed pair only where every draft item carries the same pair.
While a stage save the surface issued is in flight, the dock SHALL NOT report
the served draft, which is the one read before the press. The dock SHALL derive
no direction, floor or eligibility from the draft.

#### Scenario: A saved draft with no marks on the surface reads staged

- **GIVEN** a served Plan draft holding basal rows at 03:00 and 03:30, no
  watched Trial or Focus, no recorded Plan awaiting the pump, no staged marks on
  the Diagnose surface and no stage save in flight
- **WHEN** the watch dock renders
- **THEN** it reads "Plan · staged" with the title "Basal 03:00 to 04:00"
- **AND** its title carries no direction
- **AND** it offers "Open Changes ›" to the Plan

#### Scenario: A draft the analysis no longer admits still reads staged

- **GIVEN** a served Plan draft holding a basal row whose slot the current
  analysis no longer lets stage, and no staged marks on the surface
- **WHEN** the watch dock renders
- **THEN** it reads "Plan · staged" and its title names Basal

#### Scenario: Values print only where every draft item carries the same pair

- **GIVEN** a served Plan draft whose items carry different current values, or
  carry none
- **WHEN** the watch dock names the draft from its own items
- **THEN** its detail line carries no current-to-proposed pair

#### Scenario: An Undo in flight does not read staged

- **GIVEN** a basal change staged from Diagnose and saved as the only change in
  the Plan draft
- **WHEN** the reader presses Undo on it and the save has not yet settled
- **THEN** the watch dock does not read "Plan · staged"

#### Scenario: A watched change and a recorded Plan still outrank the draft

- **GIVEN** a served Plan draft with items
- **WHEN** a Trial or a Focus is watched, or a recorded Plan awaits the pump
- **THEN** the watch dock reports that object, not the draft

### Requirement: Diagnose's staged marks follow the Plan draft

The Diagnose surface's staged marks (the lane marks, each stage control's
staged state and the watch dock's staged line) SHALL agree with the Plan draft
whichever of the Plan read and the Diagnose payload lands first, after a return
to Diagnose from another destination, and after a stage save settles. The
surface SHALL clear its marks and ask the staging verdict again whenever it
refreshes while no stage save it issued is in flight, and once an accepted
stage save settles, so a mark the draft no longer holds drops. A return to
Diagnose SHALL re-read the Plan draft and guidance, and SHALL refresh again once
that read lands if it moved the Plan draft the marks read or the draft or
pending Plan the watch dock reads, except while a stage save the surface issued
is pending, when it SHALL skip that re-read. A
refresh that lands while a save is in flight SHALL NOT undo the mark the press
painted. The verdict SHALL be the Plan surface's own, unchanged: the saved
draft, or a pick made in Changes and not yet saved. The surface SHALL derive no
staging eligibility of its own: a mark follows the draft only where the analysis
lets that item stage.

#### Scenario: A fresh seat whose Plan read lands last shows the saved draft

- **GIVEN** a saved basal draft for a slot the analysis lets stage
- **WHEN** Diagnose seats fresh and the Plan read lands after the Diagnose
  payload has settled
- **THEN** that slot's lane cell is marked staged, its stage control reads
  "Staged · Undo", and the watch dock reads "Plan · staged"

#### Scenario: A draft saved in Changes shows on return to Diagnose

- **GIVEN** Diagnose was opened, then the reader staged the leading concern's
  action in Changes and saved the draft
- **WHEN** the reader opens the change records and then presses Diagnose in the
  top nav
- **THEN** the watch dock reads "Plan · staged"
- **AND** "Open Changes ›" lands on the Plan

#### Scenario: A reload before returning keeps the draft on the dock

- **GIVEN** a basal change staged from Diagnose and saved
- **WHEN** the reader goes to Changes, opens the change records, reloads the
  page, and then presses Diagnose while the Plan read is held until the
  Diagnose payload has settled
- **THEN** the watch dock reads "Plan · staged"

#### Scenario: Undoing the only staged change leaves nothing staged

- **GIVEN** a basal slot staged from Diagnose and saved as the only change in
  the Plan draft
- **WHEN** the reader presses Undo on it and the save settles
- **THEN** its stage control reads "Stage change"
- **AND** the watch dock reads "Nothing being watched"

#### Scenario: A refresh during a stage save keeps the pressed mark

- **GIVEN** the reader has pressed Stage change on a basal slot and its draft
  save has not yet settled
- **WHEN** Diagnose refreshes, as on a return from another destination
- **THEN** the slot's lane cell stays marked staged and its stage control keeps
  "Staged · Undo"

#### Scenario: A draft changed elsewhere drops the stale mark on return

- **GIVEN** a basal run staged from Diagnose and saved
- **WHEN** the reader goes to Changes, the saved draft is replaced through the
  Plan route by one basal row at a slot the analysis does not let stage, and
  the reader presses Diagnose in the top nav
- **THEN** the run's lane cells are no longer marked staged and their stage
  control reads "Stage change"
- **AND** the watch dock reads "Plan · staged" named for the new row

#### Scenario: A draft changed before a visit to Changes drops the stale mark on return

- **GIVEN** a basal run staged from Diagnose and saved
- **WHEN** the saved draft is replaced through the Plan route by one basal row
  at a slot the analysis does not let stage, the reader then goes to Changes,
  whose arrival reads guidance, and presses Diagnose in the top nav
- **THEN** the run's lane cells are no longer marked staged and their stage
  control reads "Stage change"

#### Scenario: A return during a stage save keeps the saved change marked

- **GIVEN** the reader has pressed Stage change on a basal slot and its draft
  save has not yet settled
- **WHEN** the reader goes to Changes, presses Diagnose in the top nav, and the
  save then settles
- **THEN** the slot's lane cell stays marked staged, because the return did not
  re-read the Plan draft while the save was pending

### Requirement: An ended record whose saved ending serves no periods draws a requested reassessment

An ended change record SHALL open on its saved ending. When its saved ending's
assessment serves no periods and the reader chooses Retained context or Current
policy, the stage SHALL draw that reassessment's figure, periods and outcome
rows, and its instrument SHALL name the reassessment's mode with "recomputed
now". It SHALL NOT read "Ending snapshot" or "as saved at the ending" then, and
the stage SHALL NOT show the saved ending's comparison beside it. The reading
pane's saved-ending part SHALL be unchanged. An ended record whose saved ending
serves periods SHALL keep drawing that saved ending whichever mode is chosen.

#### Scenario: Current policy answers a record whose saved ending has no periods

- **GIVEN** an ended record whose saved assessment is unavailable with reason
  `context_after_ending` and serves no periods, and a Current policy
  reassessment served with both periods, clock bins and outcome rows
- **WHEN** the reader chooses Current policy
- **THEN** the stage draws a paired figure and the outcome rows under "Current
  policy reassessment" and "recomputed now"
- **AND** the stage does not read "as saved at the ending", and the saved-ending
  part still reads unavailable with its reason in words

#### Scenario: A saved ending with periods keeps the stage

- **GIVEN** an ended record whose saved assessment serves both periods
- **WHEN** the reader chooses Retained context and then Current policy
- **THEN** the stage keeps the saved ending's figure and rows under "as saved at
  the ending"

### Requirement: The Retained reassessment names its stored context in words

The Retained context reassessment's Context line SHALL name the stored context by
when it was recorded, "Stored context recorded" and the context's capture time,
or "No stored context was recorded" when it carries none. It SHALL print no part
of the context's id. The words for `unsupported_retained_execution` SHALL say
that Current policy is the read left.

#### Scenario: The Context line prints a time, never an id

- **GIVEN** a Retained context reassessment whose context carries an id and a
  capture time
- **WHEN** the reassessment renders
- **THEN** its Context line reads "Stored context recorded" with that time and
  contains no run of hex characters from the id

#### Scenario: An unsupported retained context points at Current policy

- **GIVEN** a Retained context reassessment unavailable with reason
  `unsupported_retained_execution`
- **WHEN** its Result line renders
- **THEN** its words name Current policy as the read left

### Requirement: A change record's differences and percent cells print at one decimal

A comparison outcome table SHALL print each served difference rounded to one
decimal, with "+" before a positive value and no sign on a value that rounds to
zero, and each percent cell with at most one decimal. The served values and
their assessments SHALL be unchanged.

#### Scenario: A binary tail prints as its row's precision

- **GIVEN** an outcome row served with a difference of -3.9000000000000057 and a
  Rest-windows row served with a Before of 33.333333333333336
- **WHEN** the outcome table renders
- **THEN** it prints "difference -3.9" and "33.3%"

### Requirement: A figure with no curve takes no chart space

An evidence figure SHALL render its chart seat and a `role="img"` chart only when
it draws a curve. When it draws none, the stage SHALL give the figure only its
legend's height, at every width, on a change record, the watched Trial and a
Focus alike.

#### Scenario: An older saved ending collapses its figure

- **GIVEN** an ended record whose saved assessment serves its periods and rows
  and no clock bins
- **WHEN** the reader opens it at 1280x720 or 1440x900
- **THEN** the figure is no taller than its legend line, and nothing on the stage
  carries `role="img"`

### Requirement: A saved ending with clock bins draws its saved curve

An ended record whose saved assessment serves clock bins SHALL draw its paired or
Before-only curve from those bins under "as saved at the ending".

#### Scenario: A finished record draws its saved curve

- **GIVEN** the `c3-history` case's finished record, saved with clock bins on both
  sides
- **WHEN** the reader opens it
- **THEN** its stage draws a paired figure with its chart under "as saved at the
  ending"

## MODIFIED Requirements

### Requirement: An empty record figure says why it is empty

The Before/Trial or Before/After figure SHALL classify from its clock bins
before its served availability. It SHALL draw paired readings, and Before-only
readings, whenever the comparison serves them, including a comparison the
backend marks unavailable while keeping its clock views, and a saved ending
that kept its clock bins.

When no curve can be drawn, the figure SHALL distinguish these states:

- no comparison read (not requested);
- a saved ending snapshot that kept its rows but no clock bins;
- a comparison served as unavailable with no clock envelope, naming the served
  reason in plain words rather than its code;
- a comparison whose periods have no Before readings, naming which period has
  none.

The figure SHALL draw a chart and print the half-hours-read count only when it
draws a curve. When it draws none it SHALL render no chart seat and nothing with
`role="img"`. It SHALL NOT label a missing comparison or a saved snapshot as
"no readings yet", "Before · unavailable" or "0 → 0 half-hours read". It SHALL
NOT say "no clock envelope is retained" for anything but a saved ending
snapshot with no clock bins.

With no comparison read, the periods note and the outcomes note SHALL say that
no comparison has been read for this record. The stage meta SHALL NOT say the
observations were recomputed. A record with no saved ending SHALL NOT be told
that a saved ending above is what it was decided on.

The desk SHALL keep one vocabulary for comparison availability reasons. The
figure, the readiness availability lines and the reassessment result line SHALL
name an unavailable comparison's reason in its words. A code the vocabulary does
not know SHALL print as served.

#### Scenario: A served-unavailable comparison names its reason

- **GIVEN** a record with no saved ending whose retained comparison the backend
  serves as unavailable with no clock envelope
- **WHEN** the reader opens it
- **THEN** the figure says the comparison is unavailable and names the reason in
  words, and the reassessment result line uses the same words
- **AND** no chart is drawn, and neither "no clock envelope is retained" nor
  "no readings yet" nor "0 → 0 half-hours read" appears

#### Scenario: An unavailable comparison that keeps its curve still draws it

- **GIVEN** a comparison the backend serves as unavailable, whether for
  unmeasured adherence or for a period with no readable evidence, that still
  serves Before clock bins, or paired ones
- **WHEN** its figure renders
- **THEN** the Before-only or paired curve is drawn with its existing legend

#### Scenario: Choosing Original on an open record reads as not requested

- **GIVEN** an open record showing its retained comparison
- **WHEN** the reader chooses Original
- **THEN** the figure, the periods note and the outcomes note say no comparison
  has been read, and the stage does not say its observations were recomputed

#### Scenario: A saved ending keeps its rows and says it kept no curve

- **GIVEN** an ended record whose saved assessment serves its periods and rows
  and no clock bins
- **WHEN** the reader opens it
- **THEN** the outcome rows show, the figure says the snapshot retains no clock
  envelope, and it renders no chart seat and nothing with `role="img"`
