## ADDED Requirements

### Requirement: The Focus read names the watched behavior

The selected Focus read SHALL serve `lever_title` beside `lever`: the Lever's
title from the one lever name source, the override's title for the override, or
null for a stored lever outside that set. The name SHALL be derived when the
record is read and SHALL NOT be stored. The Focus's `title`, its `lever` and the
Focus roster rows SHALL be unchanged.

#### Scenario: Every behavior a Focus can watch is served with its name

- **GIVEN** a synthetic Focus pinned on each lever a Focus may pin alone, and a
  Pattern Focus on Highs after meals watching High-carb sequence and another
  watching Repeat eating
- **WHEN** the selected Focus read serves each of them
- **THEN** each `lever_title` equals its Lever's title, and the override's is
  "Doses above pump calculation"
- **AND** no `lever_title` contains an underscore

#### Scenario: A Pattern Focus keeps its Pattern's title

- **GIVEN** a Pattern Focus on Highs after meals watching High-carb sequence
- **WHEN** the selected Focus read serves it
- **THEN** its `title` is "Highs after meals" and its `lever_title` is
  "High-carb sequence"

#### Scenario: A lever outside the set is served without a name

- **GIVEN** a stored Focus whose lever is no longer a Lever or the override
- **WHEN** the selected Focus read serves it
- **THEN** its `lever_title` is null and the read still answers

### Requirement: A Focus names its watched behavior by its served name

The Observed behavior row of the active Focus and of a Focus record, and the
"What this Focus watches" fallback used when the retained context carries no
explanation, SHALL print the Focus read's served `lever_title`. The desk SHALL
keep no lever name table. When the served name is null, the row SHALL read
"Watched behavior", the fallback paragraph SHALL be omitted, and the lever key
SHALL NOT print.

#### Scenario: A sequence habit reads as its name

- **GIVEN** an active Focus whose served lever is `high_carb_sequence` and whose
  served `lever_title` is "High-carb sequence"
- **WHEN** the Focus renders
- **THEN** its Observed behavior row names "High-carb sequence"
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

### Requirement: Every served reason on a watched-change line prints in words

On the active Trial and Focus and on the change records, these lines SHALL print
a served reason through the desk's one reason vocabulary: the saved ending's
assessment, the Observed behavior cells, the Attributed harm cells, every
readiness arm's "Not met" line, a setting arm's unavailable-evidence line, the
Pattern opportunity line, the unreconciled admission line and the original
context line. The vocabulary SHALL carry words with no underscore for every code
the backend can serve on those lines: the comparison availability codes,
`not_recorded`, `legacy_not_recorded`, `no_readable_outcome`, `collecting`,
`zero_opportunities`, `insufficient_measurement`,
`candidate_high_without_closed_attribution`,
`attribution_exceeds_owned_population`, `unassociated_recurrence_anchor`,
`missing_override_provenance`, `unreadable_harm_interval`,
`unmatchable_captured_membership` and `reconciliation_required`. A code the
vocabulary does not know SHALL print as served. Served codes SHALL be unchanged
in payloads and in data attributes.

#### Scenario: A saved Focus ending names its reason

- **GIVEN** a Focus record whose saved ending assessment is unavailable with
  reason `unavailable_adherence`
- **WHEN** the record renders
- **THEN** the ending assessment reads "Unavailable" followed by that reason's
  words
- **AND** `unavailable_adherence` does not appear in the reading pane

#### Scenario: Behavior and harm cells name their reasons

- **GIVEN** a Focus comparison whose Before behavior arm is unavailable with
  reason `insufficient_measurement`, 3 of 4 opportunities measured, and whose
  harm arm is unavailable with reason `zero_opportunities`
- **WHEN** its Observed behavior table renders
- **THEN** the behavior cell names the reason in words and keeps "3 of 4
  measured"
- **AND** the harm cell names its reason in words
- **AND** neither code appears in the table

#### Scenario: Readiness lines name their reasons

- **GIVEN** readiness arms served with reasons `collecting`,
  `zero_opportunities` and, on an unavailable setting arm,
  `unmatchable_captured_membership`
- **WHEN** each arm renders
- **THEN** each "Not met" line, the Pattern opportunity line and the
  unavailable-evidence line name the reason in words
- **AND** no line reads "Not met — <code>." with the served code

#### Scenario: An older record's missing context reads as words

- **GIVEN** a record whose original context is unavailable with reason
  `legacy_not_recorded`
- **WHEN** the record renders
- **THEN** the unavailable line names the reason in words and the code does not
  appear

#### Scenario: An unknown reason prints as served

- **GIVEN** a readiness arm served with a reason the vocabulary does not know
- **WHEN** it renders
- **THEN** its "Not met" line prints that reason as served

### Requirement: Served states, verdicts, modes and denominators on watched-change lines print as words

On the same lines, the saved ending's recorded state and the reassessment
result's state SHALL print as the desk's state words, the reassessment heading
SHALL name its mode by its segment's label, the Pattern opportunity verdict SHALL
print as a word, and the behavior denominator `correction_clusters` SHALL print
as "correction clusters". A value with no word SHALL print as served. The served
values SHALL be unchanged in data attributes.

#### Scenario: A current-policy reassessment reads as words

- **GIVEN** a record whose current-policy reassessment is available with
  assessment state `context`
- **WHEN** the reassessment renders
- **THEN** its heading names "Current policy" and its result reads "Context
  only"

#### Scenario: A saved ending's recorded state reads as a word

- **GIVEN** a saved ending whose assessment is available with state `concerning`
- **WHEN** the ending renders
- **THEN** it reads "Recorded · Concerning"

#### Scenario: A Pattern opportunity verdict reads as a word

- **GIVEN** Pattern readiness arms served with verdicts `ready` and `withheld`
- **WHEN** they render
- **THEN** their opportunity lines read "Ready" and "Withheld", and their
  `data-opportunity-verdict` attributes keep the served values

#### Scenario: A correction-stacking Focus names its denominator in words

- **GIVEN** a Focus comparison whose behavior denominator is
  `correction_clusters`
- **WHEN** its Observed behavior table and readiness arms render
- **THEN** they read "correction clusters" and `correction_clusters` does not
  appear

### Requirement: The Focus entry words why a Focus is not offered

When the Focus entry page cannot offer a Focus, it SHALL state the served
admission reason through the desk's existing Focus admission words, which SHALL
include a pending Plan. It SHALL NOT print the reason's code.

#### Scenario: A pending Plan withholds the Focus in words

- **GIVEN** the Focus entry for a Pattern while the served Focus admission is
  unavailable with reason `pending_plan`
- **WHEN** the entry renders
- **THEN** it says a recorded Plan is still pending
- **AND** `pending_plan` does not appear

#### Scenario: Unreconciled data withholds the Focus in words

- **GIVEN** the Focus entry while the served Focus admission reason is
  `reconciliation_required`
- **WHEN** the entry renders
- **THEN** it says the latest data has not been reconciled, and the code does
  not appear

### Requirement: A refused change write reads as a sentence on the desk

The Trial finish, Focus resolve and later-conclusion failure lines, the Plan
record and withdraw failure lines, and the Focus pin failure line SHALL print the
server's refusal message. They SHALL NOT print the refusal code, a status code
beside it, or "[object Object]".

#### Scenario: A stale Trial finish names why in a sentence

- **GIVEN** a Trial finish the server refuses with 409 code
  `stale_input_revision` and its message
- **WHEN** the failure renders
- **THEN** the line prints the served message
- **AND** neither `stale_input_revision` nor "(409)" appears

#### Scenario: A refused Plan write reads as a sentence

- **GIVEN** a Plan record the server refuses with a durable 409 and its message
- **WHEN** the failure renders
- **THEN** the line prints the served message and not "[object Object]"

## MODIFIED Requirements

### Requirement: Change records word their served facts

A Focus record's "What changed" SHALL name the intended behavior by the record's
served `lever_title`; the record's served title stays its nameplate. When the
served `lever_title` is null it SHALL say the behavior this Focus watched is no
longer an offered lever. A record whose original context is unavailable SHALL
state its served reason in words through the desk's word table for that reason,
the way the watch disposition is worded; a served reason with no entry SHALL be
printed verbatim rather than swallowed.

#### Scenario: A Focus record names its behavior

- **GIVEN** a Focus record whose served detail carries a Pattern title and a
  `lever_title`
- **WHEN** its "What changed" section renders
- **THEN** the section names the intended behavior by that `lever_title`
- **AND** it contains no underscore token

#### Scenario: A record whose behavior is no longer a lever says so

- **GIVEN** a Focus record whose served `lever_title` is null
- **WHEN** its "What changed" section renders
- **THEN** it says the behavior this Focus watched is no longer an offered lever
- **AND** neither the lever key nor "Focus" is named as the behavior

#### Scenario: A missing original context is stated in words

- **GIVEN** a record whose served original context is unavailable with reason `not_recorded`
- **WHEN** the record renders
- **THEN** the unavailable line reads "not recorded" in words
- **AND** the raw reason token does not appear
