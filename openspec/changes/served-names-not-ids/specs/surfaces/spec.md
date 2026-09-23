## ADDED Requirements

### Requirement: The server serves a name beside every identifier the desk prints

The per-day model read SHALL serve `lever_title` on every episode: the
attributed Lever's title from the one lever name source, or null when the
episode carries no Lever. The guidance read SHALL serve, on every Pattern
candidate, a `title` on each member, an `action_title` on each member whose
action is non-null, and a `title` on the Pattern's action when that action is an
identified action rather than span rows. A habit member's names SHALL be its
Lever's served title and a setting member's names SHALL be the served tuning
lever title for its parameter; the Pattern action's title SHALL be the title of
the member it came from. Names SHALL travel beside identifiers and SHALL NOT
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
- **AND** every member with an action carries its `action_title`
- **AND** a Pattern whose action is identified carries that action's `title`
- **AND** each Pattern's set-aside baseline equals the baseline of the same candidate with its names removed

### Requirement: Day names the subject it was opened from by its served name

Every contextual Day entry SHALL carry a display `title` beside its routing
subject: the served finding title for a Diagnose occurrence, the setting name
and start clock time for a basal slot, the title the record's own nameplate
shows for a Changes record or the active change, and the utility's existing
label for a utility moment. The title SHALL ride the address with the other
entry fields, so a reload or Back keeps it. Day's "Opened from" SHALL print the
title and SHALL NOT print the routing subject. An entry whose address carries no
title SHALL name the destination it returns to instead. The subject, occurrence,
window, lever, focus and return SHALL be unchanged.

#### Scenario: A Diagnose occurrence names its finding

- **GIVEN** a Diagnose case whose served case file names its finding
- **WHEN** the reader opens Day from one of its occurrences
- **THEN** "Opened from" shows that served finding title
- **AND** no `pattern:`, `finding:` or `basal:` text appears in the Day desk
- **AND** the return restores the same occurrence and focus target as before

#### Scenario: A basal slot names its setting and time

- **GIVEN** a basal slot selected in Diagnose with no case drilled
- **WHEN** the reader opens Day from it
- **THEN** "Opened from" names the basal setting and the slot's start time in words

#### Scenario: The name survives the address

- **GIVEN** a contextual Day entry that carries a title
- **WHEN** the address is serialized and parsed again
- **THEN** the parsed entry carries the same title and the same subject

#### Scenario: An address without a name names the way back

- **GIVEN** a contextual Day address that carries a subject but no title
- **WHEN** Day renders it
- **THEN** "Opened from" names the destination the entry returns to
- **AND** the subject is not printed

### Requirement: Episode Log rows name the attributed Lever by its served name

An Episode Log row whose episode carries a Lever SHALL end with that episode's
served `lever_title`, for every Lever in the closed set. A row whose episode
carries no Lever SHALL name none. The Day desk SHALL keep no Lever name table of
its own. Which Lever an episode carries SHALL be unchanged.

#### Scenario: Every attributed row reads as words

- **GIVEN** a served day with episodes attributed to a missed meal, a meal bolus that fell short, a high-carb sequence and repeat eating
- **WHEN** the Episode Log renders
- **THEN** each of those rows ends with its episode's served `lever_title`
- **AND** no row contains an underscore token

#### Scenario: An unattributed row names no Lever

- **GIVEN** a served day with an episode that carries no Lever
- **WHEN** the Episode Log renders
- **THEN** that episode's rows end without a Lever name

### Requirement: Change records word their served facts

A Focus record's "What changed" SHALL name the intended behavior by the record's
served title. A record whose original context is unavailable SHALL state its
served reason in words through the desk's word table for that reason, the way
the watch disposition is worded; a served reason with no entry SHALL be printed
verbatim rather than swallowed.

#### Scenario: A Focus record names its behavior

- **GIVEN** a Focus record whose served detail carries a title
- **WHEN** its "What changed" section renders
- **THEN** the section names the intended behavior by that title
- **AND** it contains no underscore token

#### Scenario: A missing original context is stated in words

- **GIVEN** a record whose served original context is unavailable with reason `not_recorded`
- **WHEN** the record renders
- **THEN** the unavailable line reads "not recorded" in words
- **AND** the raw reason token does not appear

### Requirement: A Pattern concern in Changes names its members and action

A Pattern concern in Changes SHALL print each member by its served `title`, each
member's action by its served `action_title` or "No action" when the member has
none, and the Pattern's identified action by its served `title` as the Action
figure. Identifiers SHALL remain in data attributes and routing and SHALL NOT
appear in reader-facing text.

#### Scenario: A Pattern concern built from served candidates reads as words

- **GIVEN** a Pattern candidate from the committed fixture's served guidance Patterns
- **WHEN** Changes renders it as the selected concern
- **THEN** every member's served title appears in the member table
- **AND** the markup contains no `habit:` or `setting:` text
