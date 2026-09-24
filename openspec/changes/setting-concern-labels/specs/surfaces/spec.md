## ADDED Requirements

### Requirement: A setting concern is served under its setting's user label

The guidance read SHALL serve every setting concern's `title` from guidance's
closed setting-label table: Basal, Carb ratio or Correction factor. It SHALL
NOT serve the tuning lever's title ("Basal profile", "Carb ratio (I:C)", "ISF")
as a concern's title.

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

#### Scenario: Naming a concern does not move its set-aside baseline

- **WHEN** a setting concern's baseline is taken
- **THEN** it equals the baseline of the same concern with its `title` removed

### Requirement: Every set-aside subject is served with its name

The guidance read SHALL serve a `title` on every set-aside subject it lists,
including one the read no longer carries. The name SHALL come from the backend's
own name source for that subject, looked up by the whole subject and never
parsed from it:

| Subject | Name source |
|---|---|
| setting | the setting-label table |
| habit | its Lever's title |
| Pattern | the outcome roster's name |
| the uncaused-highs investigation | its title |

A subject outside the closed subject set SHALL be served with no title. No name
SHALL enter the set-aside comparison state.

#### Scenario: Set-aside subjects the read no longer carries are named

- **GIVEN** set-aside preferences for a setting, a habit and a Pattern that the read serves no candidate for
- **WHEN** the guidance read serves them as absent rows
- **THEN** the setting row is titled by its setting label, the habit row by its Lever's title and the Pattern row by its roster name
- **AND** each row remains set aside

### Requirement: A recorded Plan's subjects are served with their names

The Plan history read SHALL serve `subject_titles` beside `subjects` in each
record's `decision_context`. It is a list parallel to `subjects`, holding each
subject's name from the same subject-name lookup, computed at read time and
never stored.

#### Scenario: A recorded correction-factor Plan names its subject

- **GIVEN** a Plan recorded from a correction-factor concern
- **WHEN** the Plan history read serves it
- **THEN** its `decision_context` serves `subjects` ["setting:isf"] and `subject_titles` ["Correction factor"]
- **AND** its recorded explanation is "Correction factor"

### Requirement: Diagnose's setting findings are titled by their user labels

The findings projection SHALL title a correction-factor row "Correction factor"
and a carb-ratio block "Carb ratio <span>". Each carries the same direction
suffix as today (" · <direction>" or " · leaning <direction>"). A basal row
keeps "Basal <span>". The JS mirror, the regenerated fixtures and the QA
finding-title literals SHALL carry the same titles.

#### Scenario: A correction-factor finding reads as Correction factor

- **GIVEN** the manufactured case isf-strengthen
- **WHEN** the findings projection publishes its correction-factor row
- **THEN** the row is titled "Correction factor · strengthen"
- **AND** no setting row's title contains "ISF" or "I:C"

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

The Plan's "What was known" SHALL:

- name each recorded subject by its served name and never print an identifier;
- print each recorded setting in its user form, using the parameter of the
  recorded instruction it was captured from;
- print the recorded explanation as recorded.

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

#### Scenario: What was known names the subject and prints the value insulin first

- **GIVEN** a recorded decision context with subject "setting:isf" served as "Correction factor", and a setting captured as 32 "mg/dL/U" from a correction-factor instruction
- **WHEN** the Plan shows what was known
- **THEN** it names "Correction factor" and the change reads "1 U : 32 mg/dL"
- **AND** it contains no "setting:" text
- **AND** the recorded explanation prints as recorded

### Requirement: Changes names the served disposition in words

Changes SHALL print the served guidance disposition in words, never the code,
on its nameplate and its Action heading:

| Code | Words |
|---|---|
| `eligible_action` | Ready to stage |
| `guided_investigation` | Evidence to inspect |
| `active_change` | A change is being watched |
| `quiet` | No priority needs action |
| `unavailable` | No action from this read |
| `draft` | Plan draft saved |
| `pending_plan` | Plan awaiting the pump |

A code outside that set SHALL print no words there.

#### Scenario: A lead concern's disposition reads as words

- **GIVEN** a served read whose disposition is `eligible_action`, and another whose disposition is `guided_investigation`
- **WHEN** Changes renders each selected concern
- **THEN** the frames read "Ready to stage" and "Evidence to inspect"
- **AND** neither frame's text contains a disposition code

### Requirement: Diagnose prints the correction factor in the wearer's words

These Diagnose values SHALL print as "1 U : <value> mg/dL", each keeping the
rounding its line prints today:

- the findings queue's numbers for an asserting correction-factor row;
- the correction-factor panel's current, estimate, recommended and interval
  values.

The correction-factor panel's heading, breadcrumb and scope sentence SHALL say
"Correction factor". No Diagnose line SHALL print "mg/dL/U", or "ISF" or "I:C"
as a setting's name. Carb-ratio and basal values on Diagnose keep their unit
after the value.

#### Scenario: An asserting correction-factor queue row reads insulin first

- **GIVEN** an asserting correction-factor findings row whose backend verdict asserts a move from 30 to 32
- **WHEN** Diagnose's findings queue builds its numbers
- **THEN** they read "now 1 U : 30.0 mg/dL → " and "1 U : 32.0 mg/dL"

#### Scenario: The correction-factor panel carries no engine vocabulary

- **WHEN** the correction-factor panel renders a served correction-factor row
- **THEN** its heading says "Correction factor" and its values read "1 U : <value> mg/dL"
- **AND** the rendered text contains neither "ISF" nor "mg/dL/U"

### Requirement: The watch dock names a setting change in the wearer's words

The watch dock's Trial title and Diagnose's staged title SHALL name the setting
as the desk names it everywhere else: Basal, Correction factor, Carb ratio or
Target, never "ISF" or "I:C". They SHALL print a correction-factor value as
"1 U : <value> mg/dL".

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
