## MODIFIED Requirements

### Requirement: A selected Occurrence reads as its facts and served reason

The selected Occurrence block SHALL print the anchor's served facts: carbs and
dose for a meal, dose for a correction, or the anchor glucose as today, at the
anchor label. Its facts list SHALL print the served outcome as a Peak or Nadir
reading with its minutes after the bolus, the served cause's title and its text
when not empty, each served habit's title with its verdict's existing band label
and the classifier's sentence when one is served, and each source correction as
today. Each served sentence SHALL print once: a claimant's sentence that is the
cause's text prints on the cause line only, because the server serves it there
alone. It SHALL NOT print a line that only counts glucose readings or event
markers, and SHALL NOT print the fixed sentence about what the canvas shows. The
browser SHALL derive no outcome, reason or verdict of its own. The case-file
validator SHALL require the dose and carbs keys on every anchor it checks, the
outcome on every roster row and the reason on every selected detail, and a case
file whose new fields are missing or malformed SHALL be refused as an inconsistent
projection.

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
  each served habit with its band label and, when served, its sentence

#### Scenario: A claimed Occurrence prints its sentence once

- **GIVEN** the `pattern-near-tie` case store served through the safe start
- **WHEN** the reader selects a claimed Occurrence in the Highs after meals case
  file
- **THEN** the claimant's sentence prints on the cause line
- **AND** no habit line repeats it, and the claimant's habit line reads its title
  and band label only
