## ADDED Requirements

### Requirement: An open change record opens on its retained-context reassessment

When the desk opens a change record — by a roster press, by the record's address
or on reload — it SHALL make the record read first. When the served record's
saved ending carries no kind, the desk SHALL then request the retained-context
reassessment for that record without any further reader action. It SHALL render
that reassessment's comparison on the stage and in the reading pane, with
Retained context shown as the selected assessment. The decision SHALL read the
served selected record's ending, not the roster row.

The reassessment SHALL stay labelled as a reassessment, with its mode, computed
time and context. It SHALL NOT replace the original context or the saved-ending
part. The saved-ending part SHALL still say the change is still open. Original and
Current policy SHALL remain choosable, and a reader's choice SHALL hold until
another record is opened.

A record whose saved ending carries a kind SHALL open on that saved ending and
request no reassessment. The loading frame SHALL read "Reading change records"
while the record read is pending and "Computing reassessment" while the
retained read is pending. No other read SHALL prewarm the reassessment.

#### Scenario: An open record shows its comparison without a press

- **GIVEN** a synthetic store with a retained setting change that has no saved
  ending and whose retained comparison is available
- **WHEN** the reader opens that record from the Changes roster
- **THEN** the record read and then one retained-context read are made, with no
  assessment control pressed
- **AND** the stage shows both evidence periods and a paired Before/Trial figure
- **AND** Retained context reads as selected, and the saved-ending part still
  says the change is still open

#### Scenario: An ended record keeps its saved ending as its read

- **GIVEN** a record whose saved ending carries a kind
- **WHEN** the reader opens it
- **THEN** no reassessment is requested, and the stage shows the saved ending's
  comparison

#### Scenario: Each read names itself while it is pending

- **GIVEN** a record with no saved ending
- **WHEN** the record read is held, and then the retained read is held
- **THEN** the loading frame reads "Reading change records" and then
  "Computing reassessment"

### Requirement: An empty record figure says why it is empty

The Before/Trial or Before/After figure SHALL distinguish these states:

- no comparison read (not requested);
- a comparison the backend served as unavailable, naming the served reason in
  plain words rather than its code;
- a saved ending snapshot, which keeps its rows but not its curve;
- an available comparison with no readings in either period;
- Before readings only;
- paired readings.

The figure SHALL draw a chart and print the half-hours-read count only when a
clock envelope exists. It SHALL NOT label a missing comparison or a saved
snapshot as "no readings yet", "Before · unavailable" or "0 → 0 half-hours
read". It SHALL NOT say "no clock envelope is retained" for anything but a saved
ending snapshot.

With no comparison read, the periods note and the outcomes note SHALL say that
no comparison has been read for this record. The stage meta SHALL NOT say the
observations were recomputed. A record with no saved ending SHALL NOT be told
that a saved ending above is what it was decided on. The readiness availability
lines SHALL name an unavailable comparison's reason in the same words as the
figure.

#### Scenario: A served-unavailable comparison names its reason

- **GIVEN** a record with no saved ending whose retained comparison the backend
  serves as unavailable
- **WHEN** the reader opens it
- **THEN** the figure says the comparison is unavailable and names the reason in
  words
- **AND** no chart is drawn, and neither "no clock envelope is retained" nor
  "no readings yet" nor "0 → 0 half-hours read" appears

#### Scenario: Choosing Original on an open record reads as not requested

- **GIVEN** an open record showing its retained comparison
- **WHEN** the reader chooses Original
- **THEN** the figure, the periods note and the outcomes note say no comparison
  has been read, and the stage does not say its observations were recomputed

#### Scenario: A saved ending keeps its rows and says it kept no curve

- **GIVEN** an ended record whose saved assessment is available
- **WHEN** the reader opens it
- **THEN** the outcome rows show, the figure says the snapshot retains no clock
  envelope, and no empty chart is drawn

### Requirement: A change record names when Harmonic recorded it

The original-context part SHALL label the capture time of the original or
first-observed context as the time Harmonic recorded the change ("Recorded by
Harmonic"). It SHALL NOT use a label that can be read as the pump's own change
time, which the stage names as Detected.

#### Scenario: A first-observed record distinguishes recorded from detected

- **GIVEN** a record whose original context was first observed by reconciliation
- **WHEN** the reader opens it
- **THEN** the original-context part shows "Recorded by Harmonic" with that
  capture time, and no "First seen" label
