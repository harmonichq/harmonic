## ADDED Requirements

### Requirement: The app is five recommendation-first tabs composed from an approved component library

The app SHALL present exactly five tabs: Queue, Changes, Overview, Day and
Settings. Each tab owns only its own content: Queue owns the ranked
recommendations, Changes the active watched change and the last finished one,
Overview the standard metrics over 14, 30 and 90 days, Day one day together with
carb logging and prompts, and Settings the sync state, the pump profile and the
glossary. Screens SHALL be composed only from components of the approved
component library. No surface SHALL show explanatory prose, a prediction, or a
value the engine does not serve.

#### Scenario: Sync failure is shown only in Settings

- **WHEN** the last sync attempt failed
- **THEN** the Settings tab carries an alert badge, Settings shows the failure,
  and no other tab shows a banner, toast or strip about it

### Requirement: The Findings band counts distinct Findings, not rows

The Findings band lists the fired and claimed anchors, each belonging to an
episode attributed to a Lever; which anchors it holds SHALL be unchanged. The
Findings caption SHALL state the number of distinct Findings those anchors'
episodes belong to: one per distinct served Lever among the band's rows,
whether or not that Lever's episode has a fired row. Two episodes attributed to
the same Lever SHALL count once, as one Finding, in CONTEXT.md's terms and as
Diagnose counts it. When the band holds claimed rows, the caption SHALL name
their count separately and SHALL never add it into the Finding number. Rows
SHALL keep their chronological order.

#### Scenario: One Finding and one claimed anchor

- **GIVEN** a served day with one attributed episode holding one fired anchor
  and one claimed anchor
- **WHEN** the Episode Log renders
- **THEN** the caption reads `Findings · 1` and names 1 claimed anchor

#### Scenario: Two episodes of one Lever are one Finding

- **GIVEN** a served day with two episodes attributed to the same Lever, each
  holding one fired anchor
- **WHEN** the Episode Log renders
- **THEN** the caption reads `Findings · 1`

### Requirement: A Focus prints its watched behavior by its served name

The Observed behavior row of the active Focus and of a Focus record, and the
"What this Focus watches" fallback used when the retained context carries no
explanation, SHALL print the Focus read's served `lever_title`. The desk SHALL
keep no lever name table. When the served name is null, the row SHALL read
"Watched behavior", the fallback paragraph SHALL be omitted, and the lever key
SHALL NOT print.

#### Scenario: A watched habit reads as its name

- **GIVEN** an active Focus whose served lever is `carb_undercount` and whose
  served `lever_title` is "Carb undercount"
- **WHEN** the Focus renders
- **THEN** its Observed behavior row names "Carb undercount"
- **AND** the row contains no underscore token

#### Scenario: The behavior row agrees with the Focus's own name

- **GIVEN** a Focus pinned on Correction stacking alone, whose served title and
  served `lever_title` are both "Correction stacking"
- **WHEN** its Observed behavior table renders
- **THEN** the row names "Correction stacking"
- **AND** "Stacked corrections" does not appear

#### Scenario: An unnamed behavior prints no key

- **GIVEN** a Focus record whose served `lever_title` is null and whose saved
  comparison carries Observed behavior rows
- **WHEN** the record renders
- **THEN** the row reads "Watched behavior" and the lever key does not appear

### Requirement: A setting value in Changes prints in the wearer's user form

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

## MODIFIED Requirements

### Requirement: Episode Log rows name the attributed Lever by its served name

An Episode Log row whose episode carries a Lever SHALL end with that episode's
served `lever_title`, for every Lever in the closed set. A row whose episode
carries no Lever SHALL name none. The Day desk SHALL keep no Lever name table of
its own. Which Lever an episode carries SHALL be unchanged.

#### Scenario: Every attributed row reads as words

- **GIVEN** a served day with episodes attributed to a missed meal, a late bolus, an over-treated low and correction stacking
- **WHEN** the Episode Log renders
- **THEN** each of those rows ends with its episode's served `lever_title`
- **AND** no row contains an underscore token

#### Scenario: An unattributed row names no Lever

- **GIVEN** a served day with an episode that carries no Lever
- **WHEN** the Episode Log renders
- **THEN** that episode's rows end without a Lever name

### Requirement: The server serves a name beside every identifier the desk prints

The per-day model read SHALL serve `lever_title` on every episode: the
attributed Lever's title from the one lever name source, or null when the
episode carries no Lever. The guidance read SHALL serve, on every Pattern
candidate, a `title` on each member, an `action_title` on each member whose
action is non-null, and a `title` on the Pattern's action when that action is an
identified action rather than span rows. A habit member's names SHALL be its
Lever's title from the one lever name source, and a setting member's names
SHALL be the setting's user-facing label from guidance's closed setting-label
table: Basal, Correction factor or Carb ratio. The Pattern action's title SHALL
be the title of the member it came from. Names SHALL travel beside identifiers and SHALL NOT
replace, rename or be parsed from any identifier. Names SHALL NOT enter the
set-aside comparison state.

#### Scenario: Every episode is served with its Lever's name

- **GIVEN** a synthetic day with one attributed episode and one unattributed episode
- **WHEN** the per-day model read serves that day
- **THEN** the attributed episode's `lever_title` equals its Lever's title
- **AND** the unattributed episode's `lever_title` is null
- **AND** every Lever in the closed set has a non-empty title with no underscore

#### Scenario: Pattern members and their action are served with names

- **GIVEN** synthetic analyzer output whose Pattern roster carries habit and setting members
- **WHEN** the guidance read serves its Pattern candidates
- **THEN** every member carries a non-empty `title` with no `habit:`, `setting:` or underscore token
- **AND** a carb-ratio setting member is named "Carb ratio"
- **AND** every member with an action carries its `action_title`
- **AND** a Pattern whose action is identified carries that action's `title`
- **AND** each Pattern's set-aside baseline equals the baseline of the same candidate with its names removed

### Requirement: Every ranked rail row draws one mini instrument

Every ranked row's mini in the rail SHALL be the same instrument: the
matched cohort's label with its count at the left, `TYPICAL` with the
denominator at the right, the event named on the anchor line, the target band
dashed, and the rail's cohort palette. No mini SHALL draw in the comparison blue.
A row whose evidence cannot supply a cohort response SHALL keep its existing
honest unavailable state rather than a second instrument.

#### Scenario: A Cause mini matches a Pattern mini

- **GIVEN** a synthetic window holding a ranked Pattern and a ranked event-comparison
  Cause
- **WHEN** their minis render
- **THEN** each carries the cohort label and count, the typical denominator, the
  named anchor and the dashed target band
- **AND** every series colour resolves to a rail cohort token

### Requirement: The Focus read names the watched behavior

The selected Focus read SHALL serve `lever_title` beside `lever`: the Lever's
title from the one lever name source, the override's title for the override, or
null for a stored lever outside that set. The name SHALL be derived when the
record is read and SHALL NOT be stored. The Focus's `title`, its `lever` and the
Focus roster rows SHALL be unchanged.

#### Scenario: Every behavior a Focus can watch is served with its name

- **GIVEN** a synthetic Focus pinned on each lever a Focus may pin alone, and a
  Pattern Focus on Highs after meals watching Carb undercount
- **WHEN** the selected Focus read serves each of them
- **THEN** each `lever_title` equals its Lever's title, and the override's is
  "Doses above pump calculation"
- **AND** no `lever_title` contains an underscore

#### Scenario: A Pattern Focus keeps its Pattern's title

- **GIVEN** a Pattern Focus on Highs after meals watching Carb undercount
- **WHEN** the selected Focus read serves it
- **THEN** its `title` is "Highs after meals" and its `lever_title` is
  "Carb undercount"

#### Scenario: A lever outside the set is served without a name

- **GIVEN** a stored Focus whose lever is no longer a Lever or the override
- **WHEN** the selected Focus read serves it
- **THEN** its `lever_title` is null and the read still answers

### Requirement: Every set-aside subject guidance lists carries its served name

The guidance read SHALL serve a `title` on every set-aside subject it lists.
For a set-aside subject the read no longer carries, the name SHALL come from the
backend's own name source for that subject, looked up by the whole subject and
never parsed from it:

| Subject | Name source |
|---|---|
| setting | the setting-label table |
| habit | its Lever's title |

Every Pattern is always served present with its roster title, so a set-aside
Pattern keeps that title.

A subject outside the closed subject set, such as a retired investigation
subject (ADR 499), SHALL be served with no title. No name
SHALL enter the set-aside comparison state.

#### Scenario: Set-aside subjects the read no longer carries are named

- **GIVEN** set-aside preferences for a setting and a habit that the read serves no candidate for
- **WHEN** the guidance read serves them as absent rows
- **THEN** the setting row is titled by its setting label and the habit row by its Lever's title
- **AND** each row remains set aside

#### Scenario: A set-aside Pattern is served present with its roster title

- **GIVEN** a set-aside Pattern preference
- **WHEN** the guidance read serves it
- **THEN** the Pattern is served present, not absent, with its roster title and remains set aside

### Requirement: The v2 desk preserves readable cross-destination evidence chrome

The v2 desk SHALL keep the Diagnose reference rail width in Changes and Day,
including loading and settings-table states. At both supported desktop widths,
expanded rosters and full labels SHALL not collide. All charts and Close SHALL put their labels to the left of their icons. Those
icons and chart expansion controls SHALL stay top-right, including in tall
headers; a taller title SHALL NOT vertically center the control. Clock and
chart controls SHALL use the existing compact density tokens while retaining
accessible interaction. The desk SHALL retain the carried basal legend, verdict
paint and stage-change accent; a thin basal slot SHALL open its own graph. A
count-free skeleton SHALL appear while a destination loads, and a retained
reassessment SHALL name its on-demand loading work.

#### Scenario: Desk geometry survives dense evidence

- **GIVEN** synthetic long-label expanded Pattern members, a tall chart header,
  thin basal evidence and loading Changes/Day/settings-table states
- **WHEN** the desk is rendered at each supported desktop width
- **THEN** labels do not collide, the rail remains at the Diagnose reference,
  header label precedes a top-right action icon, and compact controls remain
  operable
- **AND** basal legend/verdict/accent and named loading remain visible

#### Scenario: Selected detail reaches the chart

- **GIVEN** an ordinary event-comparison or Pattern case file
  with served selected glucose and evidence markers
- **WHEN** the reader selects its occurrence through the roster
- **THEN** that chart displays the selected trace and supported served markers
- **AND** changing occurrence replaces the selected evidence rather than leaving
  the old trace or only changing the row highlight
- **AND** a missing anchor glucose does not suppress other available detail or
  imply that served CGM is missing

## REMOVED Requirements

### Requirement: Eating-sequence charts reuse the shipped tile and served cohort values

**Reason:** ADR 499 cuts this from the engine at the operator's direction ("Drop these from the engine."). The eating-sequence findings, their case evidence and charts are gone.

**Migration:** Issue #501 tracks a future Overview report card comparing carbs with the post-meal response.

### Requirement: Sequence drill reuses the shared clear control and frozen behavior

**Reason:** ADR 499 cuts this from the engine at the operator's direction ("Drop these from the engine."). The eating-sequence findings, their case evidence and charts are gone.

**Migration:** Issue #501 tracks a future Overview report card comparing carbs with the post-meal response.

### Requirement: Diagnose draws eating-sequence evidence from the finding case file

**Reason:** ADR 499 cuts this from the engine at the operator's direction ("Drop these from the engine."). The eating-sequence findings, their case evidence and charts are gone.

**Migration:** Issue #501 tracks a future Overview report card comparing carbs with the post-meal response.

### Requirement: High-carb response evidence is coherent with its selected population

**Reason:** ADR 499 cuts this from the engine at the operator's direction ("Drop these from the engine."). The eating-sequence findings, their case evidence and charts are gone.

**Migration:** Issue #501 tracks a future Overview report card comparing carbs with the post-meal response.

### Requirement: Sequence response curves use an explicit observed end anchor

**Reason:** ADR 499 cuts this from the engine at the operator's direction ("Drop these from the engine."). The eating-sequence findings, their case evidence and charts are gone.

**Migration:** Issue #501 tracks a future Overview report card comparing carbs with the post-meal response.

### Requirement: High-carb sequence reuses the Pattern response presentation

**Reason:** ADR 499 cuts this from the engine at the operator's direction ("Drop these from the engine."). The eating-sequence findings, their case evidence and charts are gone.

**Migration:** Issue #501 tracks a future Overview report card comparing carbs with the post-meal response.

### Requirement: High-carb response retains the shipped interaction and evidence boundary

**Reason:** ADR 499 cuts this from the engine at the operator's direction ("Drop these from the engine."). The eating-sequence findings, their case evidence and charts are gone.

**Migration:** Issue #501 tracks a future Overview report card comparing carbs with the post-meal response.

### Requirement: The Findings band counts Findings, not rows

**Reason:** ADR 499 cuts behavior that some of this requirement's scenarios describe ("Drop these from the engine."). Its surviving behavior is unchanged and is restated without those scenarios as "The Findings band counts distinct Findings, not rows": a MODIFIED block cannot drop a scenario, so the requirement takes a new header.

**Migration:** Read "The Findings band counts distinct Findings, not rows", ADDED in this change.

### Requirement: A Focus names its watched behavior by its served name

**Reason:** ADR 499 cuts behavior that some of this requirement's scenarios describe ("Drop these from the engine."). Its surviving behavior is unchanged and is restated without those scenarios as "A Focus prints its watched behavior by its served name": a MODIFIED block cannot drop a scenario, so the requirement takes a new header.

**Migration:** Read "A Focus prints its watched behavior by its served name", ADDED in this change.

### Requirement: A setting value in Changes prints in its user form

**Reason:** ADR 499 cuts behavior that some of this requirement's scenarios describe ("Drop these from the engine."). Its surviving behavior is unchanged and is restated without those scenarios as "A setting value in Changes prints in the wearer's user form": a MODIFIED block cannot drop a scenario, so the requirement takes a new header.

**Migration:** Read "A setting value in Changes prints in the wearer's user form", ADDED in this change.
