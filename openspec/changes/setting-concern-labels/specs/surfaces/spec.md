## ADDED Requirements

### Requirement: A setting concern is served under its setting's user label

The guidance read SHALL serve every setting concern's `title` from guidance's
closed setting-label table: Basal, Carb ratio or Correction factor. That
includes a set-aside setting preference the read no longer carries. It SHALL
NOT serve the tuning lever's title ("Basal profile", "Carb ratio (I:C)", "ISF")
as a concern's title. The label SHALL be looked up by the whole subject, never
parsed from it.

The following SHALL be unchanged:

- the tuning lever's title;
- the concern's `priority_inputs`;
- its served `units`;
- its set-aside comparison state.

#### Scenario: Every served setting concern carries its label

- **GIVEN** the manufactured QA cases isf-strengthen, isf-held, ic-lower, ic-held and basal-lower
- **WHEN** the guidance read serves each case
- **THEN** its correction-factor concern is titled "Correction factor", its carb-ratio concern "Carb ratio" and its basal concern "Basal"
- **AND** no setting concern is titled "ISF", "Carb ratio (I:C)" or "Basal profile"
- **AND** each concern's served `units` are "mg/dL/U", "g/U" and "U/h" as before

#### Scenario: A set-aside setting preference the read no longer carries is named

- **GIVEN** a set-aside `setting:isf` preference and a read that serves no correction-factor concern
- **WHEN** the guidance read serves it as an absent row
- **THEN** the row is titled "Correction factor" and remains set aside

#### Scenario: Naming a concern does not move its set-aside baseline

- **WHEN** a setting concern's baseline is taken
- **THEN** it equals the baseline of the same concern with its `title` removed

### Requirement: A setting value in Changes prints in its user form

Every Changes line that prints a setting value SHALL print it through the
desk's one setting-value formatter, in its CONTEXT.md user form:

| Setting | User form |
|---|---|
| Correction factor | "1 U : <value> mg/dL" |
| Carb ratio | "<value> g/U" |
| Basal | "<value> U/h" |

The Action figure of a concern whose action carries setting instructions SHALL
print `<direction> to <value in its user form>`. This covers a setting concern
and a Pattern carrying its chosen setting member's instructions. The form SHALL
come from the instruction's own parameter, never from the concern's served
`units`.

The Plan's "What was known" SHALL print each recorded setting in its user form,
using the parameter of the recorded instruction it was captured from. It SHALL
print the recorded explanation as recorded.

No Changes line SHALL print "mg/dL/U". Served `units` SHALL be unchanged.

#### Scenario: A Pattern carrying a correction-factor instruction reads insulin first

- **GIVEN** a served Pattern concern whose action carries a correction-factor instruction to strengthen to 32 and whose `units` are null
- **WHEN** Changes renders it as the selected concern
- **THEN** its Action figure reads "strengthen to 1 U : 32 mg/dL"

#### Scenario: A Pattern carrying a carb-ratio instruction prints its unit

- **GIVEN** a served Pattern concern whose action carries a carb-ratio instruction to lower to 9 and whose `units` are null
- **WHEN** Changes renders it
- **THEN** its Action figure reads "lower to 9 g/U"

#### Scenario: A correction-factor concern reads in the wearer's words

- **GIVEN** a served correction-factor setting concern titled "Correction factor" with its instructions
- **WHEN** Changes renders its frame
- **THEN** the frame names it "Correction factor"
- **AND** the frame contains neither "ISF" nor "mg/dL/U"

#### Scenario: What was known prints a recorded correction factor insulin first

- **GIVEN** a recorded decision context whose setting was captured as 32 "mg/dL/U" from a correction-factor instruction
- **WHEN** the Plan shows what was known
- **THEN** the change reads "1 U : 32 mg/dL"
- **AND** the recorded explanation prints as recorded

### Requirement: Diagnose prints a correction-factor value insulin first

These Diagnose values SHALL print as "1 U : <value> mg/dL", each keeping the
rounding its line prints today:

- the findings queue's numbers for an asserting correction-factor row;
- the correction-factor inspector's current, estimate, recommended and interval
  values.

No Diagnose line SHALL print "mg/dL/U". Carb-ratio and basal values on Diagnose
keep their unit after the value.

#### Scenario: An asserting correction-factor queue row reads insulin first

- **GIVEN** an asserting correction-factor findings row whose backend verdict asserts a move from 30 to 32
- **WHEN** Diagnose's findings queue builds its numbers
- **THEN** they read "now 1 U : 30.0 mg/dL → " and "1 U : 32.0 mg/dL"

#### Scenario: The correction-factor inspector carries no engine unit

- **WHEN** the correction-factor inspector renders a served correction-factor row
- **THEN** its values read "1 U : <value> mg/dL"
- **AND** the rendered text contains no "mg/dL/U"

### Requirement: The watch dock names a setting change in the wearer's words

The watched-change dock's Trial title and Diagnose's staged title SHALL name
the setting as the desk names it everywhere else: Basal, Correction factor,
Carb ratio or Target, never "ISF" or "I:C". They SHALL print a
correction-factor value as "1 U : <value> mg/dL".

#### Scenario: A correction-factor Trial is titled in the wearer's words

- **GIVEN** a watched Trial of the correction factor from 30 to 32
- **WHEN** the dock reports it
- **THEN** its title reads "Correction factor · 1 U : 30.0 mg/dL → 1 U : 32.0 mg/dL"

#### Scenario: A carb-ratio Trial is named Carb ratio

- **GIVEN** a watched Trial of the carb ratio from 5 to 4.8
- **WHEN** the dock reports it
- **THEN** its title reads "Carb ratio · 5.0 → 4.8 g/U"
- **AND** it contains neither "I:C" nor "ISF"

#### Scenario: A staged correction factor names itself in the dock

- **GIVEN** the manufactured case isf-strengthen on Diagnose
- **WHEN** the reader stages the correction factor
- **THEN** the dock's staged title reads "Correction factor · 1 U : <current> mg/dL → 1 U : <recommended> mg/dL"
