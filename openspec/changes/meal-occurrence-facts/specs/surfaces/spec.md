## ADDED Requirements

### Requirement: Case-file Occurrence rows name what the Occurrence is

Both case-file rosters, the verdict-band roster and the response-comparison
roster, SHALL describe each Occurrence from its served facts through one
description rule. A row whose anchor serves carbs SHALL read its carbs, its dose
and, when one is served, its outcome reading with the word peak or nadir, and
SHALL omit the constant anchor label that its heading already names. A row whose
anchor serves a dose and no carbs SHALL read that dose followed by its anchor
label. Every other row SHALL keep today's anchor glucose and label. The rule SHALL
choose its form from the served fields, never from a family or lever name, and no
row SHALL lead with a dash for a fact its family never has. Each description SHALL
stay fully readable in the rail at both desktop sizes, beside the case roster's
tier column.

#### Scenario: Meal rows differ from one another

- **GIVEN** the QA showcase served through the safe start
- **WHEN** the reader opens the Meal bolus short case file
- **THEN** every row in both rosters reads the served carbs, dose and outcome for
  its own meal, and no row description begins with a dash

#### Scenario: A correction cluster reads its dose

- **GIVEN** a served correction-cluster case file
- **WHEN** its roster renders
- **THEN** each row reads its second correction's dose and the Second correction
  label

### Requirement: A selected Occurrence reads as its facts and served reason

The selected Occurrence block SHALL print the anchor's served facts: carbs and
dose for a meal, dose for a correction, or the anchor glucose as today, at the
anchor label. Its facts list SHALL print the served outcome as a Peak or Nadir
reading with its minutes after the bolus, the served cause's title and its text
when not empty, each served habit's title with its verdict's existing band label
and the classifier's sentence, and each source correction as today. It SHALL NOT
print a line that only counts glucose readings or event markers, and SHALL NOT
print the fixed sentence about what the canvas shows. The browser SHALL derive no
outcome, reason or verdict of its own, and a case file whose new fields are
malformed SHALL be refused as an inconsistent projection.

#### Scenario: A selected meal shows its meal

- **GIVEN** the QA showcase served through the safe start
- **WHEN** the reader selects the matched Occurrence in the Meal bolus short case
  file
- **THEN** the block shows that meal's carbs and dose, a Peak line whose value and
  minutes equal the served outcome, and the served cause
- **AND** no line is only a count and no sentence describes the canvas

#### Scenario: A Pattern Occurrence shows its habits

- **GIVEN** the `pattern-near-tie` case store served through the safe start
- **WHEN** the reader selects an Occurrence in the Highs after meals case file
- **THEN** its rows read their served carbs, dose and peak, and the block lists
  each served habit with its band label and sentence
