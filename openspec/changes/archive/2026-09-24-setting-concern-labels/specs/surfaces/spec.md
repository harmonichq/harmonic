## ADDED Requirements

### Requirement: The carb-ratio analyzer's sentences pass the user-copy register

Every sentence the carb-ratio analyzer serves SHALL pass every rule of
DESIGN.md's user-copy register. It SHALL name the setting "carb ratio", never
"I:C", and SHALL use no prose em dash. It SHALL say "identifiable meals", never
"clean-start". This covers:

- its recommendation annotations;
- its hold annotations and the start-high cross-reference;
- the block owner prefix;
- its block annotations;
- its history annotation;
- the summaries and occurrence details of its three Findings.

Meaning and every served number SHALL be unchanged. A test SHALL build every
served carb-ratio sentence branch and check it against the register's full rule
set, as the basal and correction-strength tests do. That rule set SHALL include
a rule against user-facing "I:C".

#### Scenario: A held carb-ratio block's annotation reads in register

- **GIVEN** a synthetic carb-ratio block held because too few identifiable meals can test a direction
- **WHEN** the carb-ratio analyzer annotates it
- **THEN** the annotation names the carb ratio and the identifiable meals
- **AND** it contains no "I:C", no "clean" and no prose em dash

#### Scenario: Every carb-ratio sentence branch passes every register rule

- **WHEN** the annotation-register test builds every served carb-ratio sentence branch
- **THEN** every sentence passes every rule the basal and correction-strength sentences are held to

### Requirement: Diagnose's setting findings are titled by their user labels

The findings projection SHALL title a correction-factor row "Correction factor"
and a carb-ratio block "Carb ratio <span>". Each carries the same direction
suffix as today (" · <direction>" or " · leaning <direction>"). A basal row
keeps "Basal <span>". The JS mirror, the regenerated fixtures and the QA
finding-title literals SHALL carry the same titles.

The projection's ordering is unchanged except for its final title tiebreak,
which now orders rows tied on every earlier key by their new titles.

#### Scenario: A correction-factor finding reads as Correction factor

- **GIVEN** the manufactured case isf-strengthen
- **WHEN** the findings projection publishes its correction-factor row
- **THEN** the row is titled "Correction factor · strengthen"
- **AND** no setting row's title contains "ISF" or "I:C"

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

### Requirement: Every set-aside subject guidance lists carries its served name

The guidance read SHALL serve a `title` on every set-aside subject it lists.
For a set-aside subject the read no longer carries, the name SHALL come from the
backend's own name source for that subject, looked up by the whole subject and
never parsed from it:

| Subject | Name source |
|---|---|
| setting | the setting-label table |
| habit | its Lever's title |
| the uncaused-highs investigation | its title |

Every Pattern is always served present with its roster title, so a set-aside
Pattern keeps that title.

A subject outside the closed subject set SHALL be served with no title. No name
SHALL enter the set-aside comparison state.

#### Scenario: Set-aside subjects the read no longer carries are named

- **GIVEN** set-aside preferences for a setting, a habit and the uncaused-highs investigation that the read serves no candidate for
- **WHEN** the guidance read serves them as absent rows
- **THEN** the setting row is titled by its setting label, the habit row by its Lever's title and the investigation row by its title
- **AND** each row remains set aside

#### Scenario: A set-aside Pattern is served present with its roster title

- **GIVEN** a set-aside Pattern preference
- **WHEN** the guidance read serves it
- **THEN** the Pattern is served present, not absent, with its roster title and remains set aside

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

- name each recorded subject by its served name, and print nothing for a
  subject without one;
- never print an identifier;
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

### Requirement: Changes lists every set-aside concern by a name

Changes' set-aside rows SHALL print each row's served name. A row served with no
name SHALL print the fixed phrase "A concern no longer in this read" and never
its identifier.

#### Scenario: An unnamed set-aside row prints the fixed phrase

- **GIVEN** a served set-aside row with no title for a subject outside the closed subject set
- **WHEN** Changes lists its set-aside concerns
- **THEN** the row reads "A concern no longer in this read"
- **AND** the list contains no subject identifier

### Requirement: Changes says why its concern leads in words

Changes SHALL print the served guidance disposition in words, never the code,
on its nameplate and its Action heading. The words SHALL say what the reader
can actually do. A change already staged in the Plan draft reads Staged, the
same staged state the pane shows. Otherwise, under `eligible_action` the words
depend on the served action's shape and, for an identified action, on the
served Focus offer and the served readiness verdict:

| Code, action | Words |
|---|---|
| any, with the change staged in the Plan draft | Staged |
| `eligible_action`, the action carries setting instructions | Ready to stage |
| `eligible_action`, an identified action with a served Focus offer | Ready to start a Focus |
| `eligible_action`, an identified action on a Pattern whose served readiness verdict is `withheld` | Focus withheld |
| `eligible_action`, any other identified action | Action identified |
| `guided_investigation` | Evidence to inspect |

Any other code SHALL print no words there. A set-aside concern on screen is not
the concern the read leads with, so its nameplate SHALL print no status words.

#### Scenario: A setting-led concern reads Ready to stage

- **GIVEN** a served `eligible_action` read whose selected concern carries setting instructions
- **WHEN** Changes renders it
- **THEN** the frame reads "Ready to stage" and contains no disposition code

#### Scenario: A concern with a served Focus offer reads Ready to start a Focus

- **GIVEN** a served `eligible_action` read whose selected concern's identified action has a served Focus offer
- **WHEN** Changes renders it
- **THEN** the frame reads "Ready to start a Focus" and offers Start Focus

#### Scenario: A withheld Pattern reads Focus withheld

- **GIVEN** a served `eligible_action` read whose selected Pattern carries an identified action, a served readiness verdict of `withheld`, and no Focus offer
- **WHEN** Changes renders it
- **THEN** the frame reads "Focus withheld" beside the served withheld reason, and neither "Ready to start a Focus" nor "Ready to stage"

#### Scenario: A legacy habit lead reads Action identified

- **GIVEN** a served `eligible_action` read whose selected concern is a habit with an identified action and no Focus offer
- **WHEN** Changes renders it
- **THEN** the frame reads "Action identified" and neither "Ready to start a Focus" nor "Ready to stage"

#### Scenario: An investigation reads Evidence to inspect

- **GIVEN** a served `guided_investigation` read
- **WHEN** Changes renders its selected concern
- **THEN** the frame reads "Evidence to inspect" and contains no disposition code

#### Scenario: A staged change reads Staged

- **GIVEN** a served `eligible_action` read whose selected concern carries setting instructions
- **WHEN** the wearer stages it
- **THEN** the nameplate and the Action heading read "Staged" beside the pane's Staged state, and not "Ready to stage"
- **AND** after Undo they read "Ready to stage" again

#### Scenario: A set-aside concern on screen carries no status words

- **GIVEN** the wearer set a concern aside and a re-read selects another concern
- **WHEN** Changes keeps the set-aside concern on screen
- **THEN** its nameplate reads "Set aside" and no status words for the concern that leads next

### Requirement: Diagnose names the correction factor and carb ratio in the wearer's words

These Diagnose values SHALL print as "1 U : <value> mg/dL", each keeping the
rounding its line prints today:

- the findings queue's numbers for an asserting correction-factor row;
- the correction-factor panel's current, estimate, recommended and interval
  values.

The correction-factor panel's heading, breadcrumb and scope sentence SHALL say
"Correction factor", and the peak-hour link SHALL name a "carb ratio" block. No
Diagnose line SHALL print "mg/dL/U", or "ISF" or "I:C" as a setting's name.
Carb-ratio and basal values on Diagnose keep their unit after the value.

#### Scenario: An asserting correction-factor queue row reads insulin first

- **GIVEN** an asserting correction-factor findings row whose backend verdict asserts a move from 30 to 32
- **WHEN** Diagnose's findings queue builds its numbers
- **THEN** they read "now 1 U : 30.0 mg/dL → " and "1 U : 32.0 mg/dL"

#### Scenario: The correction-factor panel carries no engine vocabulary

- **WHEN** the correction-factor panel renders a served correction-factor row
- **THEN** its heading says "Correction factor" and its values read "1 U : <value> mg/dL"
- **AND** the rendered text contains neither "ISF" nor "mg/dL/U"

### Requirement: The watch dock's title names the change and its values wrap below

The watch dock's one-line title, for a watched Trial and for Diagnose's staged
change, SHALL carry:

- the setting's user name (Basal, Correction factor, Carb ratio, Target; a
  whole profile keeps its own word), never "ISF" or "I:C";
- its slot or span where it has one;
- the direction the server serves for it, where it serves one. The dock derives
  no direction.

The from→to values SHALL move out of the title into the dock's wrapping detail
line, in their user form (a correction factor as "1 U : <value> mg/dL"). The
title SHALL NOT truncate at 1280x720 or 1440x900, and the values SHALL be fully
visible.

#### Scenario: A correction-factor Trial is titled by name, its values below

- **GIVEN** a watched Trial of the correction factor from 30 to 32
- **WHEN** the dock reports it
- **THEN** its title reads "Correction factor"
- **AND** its detail line carries "1 U : 30.0 mg/dL → 1 U : 32.0 mg/dL"
- **AND** neither contains "ISF" or "mg/dL/U"

#### Scenario: A carb-ratio Trial is named Carb ratio

- **GIVEN** a watched Trial of the carb ratio from 5 to 4.8
- **WHEN** the dock reports it
- **THEN** its title reads "Carb ratio" and its detail line carries "5.0 → 4.8 g/U"
- **AND** neither contains "I:C"

#### Scenario: A staged correction factor fits the dock and shows its values

- **GIVEN** the manufactured case isf-strengthen on Diagnose at 1280x720 and at 1440x900
- **WHEN** the reader stages the correction factor
- **THEN** the dock's title reads "Correction factor · <served direction>" and does not truncate
- **AND** its detail line shows "1 U : <current> mg/dL → 1 U : <recommended> mg/dL" in full

### Requirement: Desk copy joins no clauses with an em dash

User copy that reaches the desk SHALL join no clauses with an em dash, and SHALL
set off no parenthetical with one (DESIGN.md, Voice and user-copy register,
rule 1). This covers:

- every served sentence a desk module prints: an Occurrence's cause text, each
  judged classifier's detail, and each lever's Guide meaning and recommendation;
- the desk's own strings, including accessible labels and the Glossary's
  definitions;
- the Guide's articles.

A dash after a short label, followed by a value or a verbless fragment, is a
label separator and MAY remain. Examples are "Ready to judge — …", "Not met — …",
"INSUFFICIENT SAMPLE — …", "<weekday> — no data" and "Label — value" tooltips.
The "—" empty-value glyph MAY remain. Meaning, every served number and every
engine code SHALL be unchanged.

#### Scenario: A served Occurrence sentence reads without a prose em dash

- **GIVEN** a synthetic over-treated low whose rebound the context gate explains
- **WHEN** the exposure producer serves its Occurrences
- **THEN** every Occurrence sentence and every classifier detail it serves contains no em dash

#### Scenario: The Guide and the Glossary read without a prose em dash

- **WHEN** the Guide's catalog, its four articles and the Glossary's definitions are read
- **THEN** none contains an em dash

#### Scenario: The persistent advisory line is two short sentences

- **WHEN** any destination renders the persistent chrome
- **THEN** its advisory line reads "Advisory only. Review with your clinician before changing pump settings."
