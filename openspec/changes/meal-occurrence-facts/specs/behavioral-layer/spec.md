## ADDED Requirements

### Requirement: Case-file Occurrences serve the facts their anchor has

Every Finding case-file roster Occurrence, in single-habit and Pattern case files
alike, SHALL serve its anchor bolus's delivered dose and carbs beside its anchor
glucose: a meal serves its meal bolus's dose and carbs, a correction cluster
serves its second correction's dose, and a low or high serves neither. A meal
Occurrence SHALL also serve one outcome reading taken from the Post-meal arc of
its anchor bolus: the Arc peak when the case file judges a high outcome, the Arc
nadir when it judges a low outcome, each with the reading's time and its minutes
after the bolus. The arc SHALL be computed by the existing Outcomes trend arc
implementation over the readings the analyzer judged, truncated at the next meal,
and SHALL serve no outcome when that arc half has no reading or its nadir window
does not qualify. No meal or correction-cluster Occurrence SHALL serve an anchor
glucose, and no episode-level reading SHALL stand in for the arc. The exposure
feed SHALL serve each exposure Occurrence's anchor bolus dose and carbs, copied
from the analyzer's anchor, so a Pattern roster carries them without matching a
bolus by time. Verdicts, verdict counts, cohorts, denominators and claims SHALL
be unchanged.

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

### Requirement: A selected case-file Occurrence serves why it was judged

A selected Occurrence's case-file detail SHALL serve a reason made of the cause
that drove its episode, when one did, and one entry per habit the case file
judges for which the analyzer recorded a classifier verdict at that anchor. The
cause SHALL name the attributed lever, its title and the episode's attributed
narrative text as the analyzer published it. Each habit entry SHALL name the
habit, its title, its row-relative Finding verdict computed by the same function
the case-file rosters use, and the classifier's own detail sentence. A single-habit
case file SHALL judge its lever, a Pattern case file its habit members in its rate
family, and a correction cluster its Correction stacking verdict. A habit with no
recorded verdict at the anchor SHALL serve no entry. The Missed / unannounced meal
comparison's announced-meal detail SHALL serve its bolus's dose and carbs, its Arc
peak, and a reason with no cause and no habit entries.

#### Scenario: A matched meal names its cause

- **GIVEN** a synthetic store where one meal's rise is attributed to Meal bolus
  short
- **WHEN** that Occurrence is selected in the Meal bolus short case file
- **THEN** its detail serves the Meal bolus short cause with the analyzer's
  narrative text and no habit entry, because that habit is judged at the rise

#### Scenario: A Pattern Occurrence explains each habit

- **GIVEN** a Highs after meals Pattern case file over analyzer output
- **WHEN** an Occurrence is selected
- **THEN** its detail serves one entry for each of the Pattern's habits that
  recorded a verdict at that meal, each carrying the verdict the roster's
  row-relative rule gives and the classifier's detail sentence
