## ADDED Requirements

### Requirement: One backend-owned rule selects the leading priority

The backend SHALL decide the one leading priority under a single rule that is
recorded in this change and reproducible from the existing judgments, and SHALL
return that selection with its disposition and its reasons. The disposition SHALL
distinguish an eligible action, a guided investigation, a quiet result, and an
active change that leads. The rule SHALL be deterministic, including an explicit
tie-break, so two runs over the same window select the same subject.

The existing Lever verdicts, the existing Priority and the queue's existing order
are inputs to that rule. None of them is by itself the cross-parameter policy:
the highest existing Priority SHALL NOT be assumed to be the correct leading
subject, and the shared `next_in_line` tier SHALL NOT be read as naming a winner.
The rule that resolves across parameters is the one this spike settles and
records, not one already established by a score.

The browser SHALL NOT derive the selection from queue order, from the shared
`next_in_line` tier, or from a Priority it re-ranks itself. The rule SHALL NOT
treat Focus pin eligibility as a support verdict, SHALL NOT pool unrelated
occurrence counts into apparent support, and SHALL NOT claim preventable harm or
causation. Setting and habit populations SHALL retain their separate identities
and their overlapping evidence ownership. Clinical support floors, classifiers
and scores are unchanged inputs to this rule.

Admission stays parameter-specific. A setting Lever SHALL be offered as an
eligible setting change only where its analyzer stages it. A supported habit is
admitted for action under its own supported-action and Focus rules, so a setting
that does not stage SHALL NOT by itself prevent a supported habit from leading.

#### Scenario: A staged setting can lead under the recorded rule

- **GIVEN** a window in which the recorded rule selects a staged setting Lever
- **WHEN** guidance returns the leading priority
- **THEN** that Lever is the selected subject under an eligible-action disposition
- **AND** the stated reason cites that Lever's own evidence and the recorded rule rather than a pooled count or bare row order

#### Scenario: A supported habit can lead where no setting stages

- **GIVEN** a window carrying a supported habit Lever admitted for action and a setting Lever its analyzer does not stage
- **WHEN** guidance returns the leading priority
- **THEN** the habit is eligible to lead under the recorded rule
- **AND** the unstaged setting is not offered as an eligible setting change, and its staging verdict does not by itself withhold the habit

#### Scenario: No supported action yields a guided investigation

- **GIVEN** a window whose recurring problem is visible but whose Levers are held, thin or unstaged
- **WHEN** guidance selects the leading priority
- **THEN** the disposition is a guided investigation with explicit unknowns
- **AND** no held or thin Lever is offered as an eligible action

#### Scenario: An active change leads over a new finding

- **GIVEN** an active watched change in progress and a newly priced Lever
- **WHEN** guidance selects the leading priority
- **THEN** the active change leads with its current progress
- **AND** the new finding stays visible without starting a second change

#### Scenario: A tie resolves the same way twice

- **GIVEN** two Levers whose Priority values tie
- **WHEN** guidance selects the leading priority twice over the same window
- **THEN** both runs select the same subject under the recorded tie-break

### Requirement: A set-aside preference has a stable subject

A set-aside preference SHALL be recorded against a stable subject identity for a
supported setting, a supported habit or a guided investigation, together with the
time of the choice and an optional reason. That identity SHALL survive an
evidence-window move, an analysis generation change and an evidence fingerprint
change, so routine recomputation alone never erases the choice. An explicit
Restore SHALL clear the preference and return the subject to selection.

The preference SHALL remain a bounded stored choice. It SHALL NOT require an
event archive, a refresh snapshot history, or a second copy of the analysis.

#### Scenario: Routine recomputation keeps a subject aside

- **GIVEN** a subject the user set aside
- **WHEN** a later analysis run changes only its evidence window, generation or fingerprint
- **THEN** the subject remains aside
- **AND** its evidence stays inspectable

#### Scenario: Restore returns the subject to selection

- **GIVEN** a subject the user set aside
- **WHEN** the user restores it
- **THEN** the preference is cleared
- **AND** the subject is eligible to lead again under the selection rule

### Requirement: A set-aside subject returns only on a meaningful change

A set-aside subject SHALL return only when its recommended action or its
seriousness meaningfully changes, and that return SHALL carry an understandable
reason naming what changed. The comparison SHALL be defined over the recommended
action and the seriousness the engine already produces. It SHALL NOT introduce an
arbitrary numerical materiality threshold, and it SHALL NOT alter a support
floor, a classifier or a score to make the comparison convenient.

#### Scenario: A changed action returns the subject

- **GIVEN** a subject set aside under one recommended action
- **WHEN** a later run recommends a different action for that subject
- **THEN** the subject returns to selection
- **AND** the explanation names the change in the recommended action

#### Scenario: A fingerprint change alone does not return the subject

- **GIVEN** a subject the user set aside
- **WHEN** a later run leaves its action and seriousness unchanged but changes its evidence fingerprint
- **THEN** the subject stays aside

### Requirement: Guidance keeps cited evidence distinct from advice

The guidance result SHALL be assembled by the backend and SHALL keep cited
evidence distinct from advice. A low-confidence source step, an inferred
attribution and an observation-only finding SHALL remain readable as evidence and
SHALL NOT become a treatment recommendation or a staged setting move. Cohort
evidence SHALL reuse the retained comparison contract rather than establishing a
second statistical authority.

#### Scenario: An observation-only finding stays evidence

- **GIVEN** a finding whose advice is observation-only under its own analyzer rules
- **WHEN** guidance cites it in the selected priority's explanation
- **THEN** it appears as cited evidence with its uncertainty
- **AND** it is not offered as an eligible action or a dose change
