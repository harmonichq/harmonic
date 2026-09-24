## ADDED Requirements

### Requirement: Case-file Occurrences serve the facts their anchor has

Every anchor object a Finding case file serves, in single-habit and Pattern case
files alike, SHALL carry its anchor bolus's delivered dose and carbs beside its
anchor glucose: a meal serves its meal bolus's dose and carbs, a correction
cluster serves its second correction's dose, and a low, a high and a detected
rise-onset anchor serve neither, as explicit nulls. A meal Occurrence SHALL also
serve one outcome reading taken from the Post-meal arc of its anchor bolus: the
Arc peak when the case file judges a high outcome, the Arc nadir when it judges a
low outcome, each with the reading's time and its minutes after the bolus. The arc
SHALL be computed by the existing Outcomes trend arc implementation over the
readings the analyzer judged, truncated at the next meal, and SHALL serve no
outcome when that arc half has no reading or its nadir window does not qualify. No
meal or correction-cluster Occurrence SHALL serve an anchor glucose, and no
episode-level reading SHALL stand in for the arc. The exposure feed SHALL serve
each exposure Occurrence's anchor bolus dose and carbs, copied from the analyzer's
anchor, so a Pattern roster carries them without matching a bolus by time.
Verdicts, verdict counts, cohorts, denominators and claims SHALL be unchanged, and
eating-sequence case files SHALL be unchanged.

#### Scenario: Meal rows carry the meal and its peak

- **GIVEN** a synthetic store with N completed carb boluses and CGM after each,
  run through the real analyzer, exposure builder and case-file preparation
- **WHEN** a meal-family case file that judges a high outcome is read, from a
  single habit and from a Highs after meals Pattern
- **THEN** every row serves its bolus's dose and carbs and a null anchor glucose
- **AND** a row whose arc has a reading serves the Arc peak with its time and
  minutes after the bolus, equal to the Outcomes trend arc for that meal
- **AND** the verdict counts and claims equal those served before the change

#### Scenario: A low-outcome meal case file reads the nadir

- **GIVEN** the same store
- **WHEN** the Meal over-delivery case file is read
- **THEN** each row whose arc nadir qualifies serves the Arc nadir, never the
  peak, and a row whose nadir window does not qualify serves no outcome

#### Scenario: Correction clusters serve their dose

- **GIVEN** a synthetic store with adjacent user corrections
- **WHEN** the Correction stacking case file is read
- **THEN** every row serves its second correction's dose, null carbs, a null
  anchor glucose and no outcome

#### Scenario: A rise-onset anchor carries explicit nulls

- **GIVEN** a Missed / unannounced meal case file with an attributed High
- **WHEN** its event projection and that Occurrence's selection are read
- **THEN** the row's comparison anchor and the selected detail's anchor serve
  null dose and null carbs

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
sentence otherwise. A correction cluster SHALL be judged by its Correction
stacking verdict. The Missed / unannounced meal comparison's announced-meal detail
SHALL serve its bolus's dose and carbs, its Arc peak, and a reason with no cause
and no habit entries.

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
