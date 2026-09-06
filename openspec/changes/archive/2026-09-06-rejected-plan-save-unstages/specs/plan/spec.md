## ADDED Requirements

### Requirement: A refused draft save leaves nothing staged

A change staged from Diagnose SHALL be presented as staged only once the draft
save the staging action issued has been accepted by the server. When that save
is refused, the surface SHALL restore the state it held before the staging
action — the stage control reads its unstaged label, the watched-change dock
shows no staged Plan, and the Plan step badge and Plan draft hold exactly what
they held before — and SHALL report the failure to the reader. The surface SHALL
NOT re-derive the refusal's meaning: it reports the server's own failure detail
unchanged, and it derives no staging eligibility, floor, threshold or direction
of its own. A staging path with no draft save attached to it — a mount that
supplies no staging callback, or one whose callback reports no refusal — SHALL
continue to stage.

#### Scenario: A refused draft save unstages the surface

- **WHEN** the reader stages an asserting Diagnose finding and the draft save is
  refused by the server
- **THEN** the stage control reads its unstaged label and reports itself
  unstaged
- **AND** the watched-change dock shows no staged Plan
- **AND** the Plan step badge and the Plan draft hold what they held before the
  staging action
- **AND** the reader is shown a failure message carrying the server's own detail
  unchanged

#### Scenario: An accepted draft save stages as before

- **WHEN** the reader stages an asserting Diagnose finding and the draft save is
  accepted
- **THEN** the stage control, the watched-change dock, the Plan step badge and
  the Plan draft all report the change as staged, exactly as they do today
