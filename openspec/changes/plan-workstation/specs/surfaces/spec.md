## MODIFIED Requirements

### Requirement: Plan surface asks "what will I program into my pump?"

The system SHALL satisfy the following:

The Plan surface holds a unified ≤16-segment pump-ready schedule built from the user's currently-active profile plus any accepted Diagnose recommendations and hand-edits. It shows the active profile as a reference, lists the accepted changes with provenance, and renders the editable deliverable. Plan reconciliation compares the deliverable to the latest detected pump profile to confirm it matches or flag keying errors. Users cannot stage changes directly on Plan; they stage from Diagnose and edit the deliverable here.

The Plan surface SHALL render inside the workstation composition the Diagnose and Verify surfaces share: an instrument strip naming the active profile over a docked two-pane sheet whose left pane holds the schedule to key in and whose right pane holds the case file (accepted changes, reconcile verdict and actions, the active-profile reference, apply history). The surface SHALL realise the theme's pane-body, pane-header-rail and instrument-rail roles rather than a Plan-only material. Below the tablet breakpoint the case file SHALL stack under the schedule and the schedule table SHALL scroll horizontally within the surface rather than overflowing the page.

#### Scenario: Plan surface asks "what will I program into my pump?"

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

#### Scenario: Plan keeps every shipped behavior across the recomposition

- **GIVEN** the frozen Plan behavior ledger and its app-only replay
- **WHEN** the replay runs against the recomposed surface
- **THEN** every active story passes, no story is retired, and every container is found by its shipped heading

#### Scenario: Plan shares the workstation material

- **GIVEN** the synthetic QA showcase served through the declared no-fetch command
- **WHEN** the reader opens Plan beside Diagnose
- **THEN** the strip, pane headers and pane bodies carry the same theme roles as Diagnose and Verify
