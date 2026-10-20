## MODIFIED Requirements

### Requirement: A setting concern is served under its setting's user label

The guidance read SHALL serve every setting concern's `title` from guidance's
closed setting-label table: Basal, Carb ratio or Correction factor. Guidance
serves no live correction-factor concern (ADR 564); the label names a retained
`setting:isf` subject, a set-aside preference or a recorded Plan. It SHALL
NOT serve the tuning lever's title ("Basal profile", "Carb ratio (I:C)", "ISF")
as a concern's title.

The following SHALL be unchanged:

- the tuning lever's title;
- the concern's `priority_inputs`;
- its served `units`;
- its set-aside comparison state.

#### Scenario: Every served setting concern carries its label

- **GIVEN** the manufactured QA cases ic-lower, ic-held and basal-lower
- **WHEN** the guidance read serves each case
- **THEN** its carb-ratio concern is titled "Carb ratio" and its basal concern "Basal"
- **AND** no setting concern is titled "ISF", "Carb ratio (I:C)" or "Basal profile"
- **AND** each concern's served `units` are "g/U" and "U/h" as before
- **AND** no case serves a `setting:isf` concern

#### Scenario: A set-aside correction factor keeps its name

- **GIVEN** a stored `setting:isf` preference set aside before ADR 564
- **WHEN** the guidance read serves
- **THEN** the subject is served as an absent row titled "Correction factor"
- **AND** the read neither raises nor reads unavailable

#### Scenario: Naming a concern does not move its set-aside baseline

- **WHEN** a setting concern's baseline is taken
- **THEN** it equals the baseline of the same concern with its `title` removed
