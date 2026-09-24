## MODIFIED Requirements

### Requirement: A draft persists unsaved changes locally

The system SHALL satisfy the following:

Saving a draft records the user's current accepted changes (the staged recommendations, at the value in effect on each deliverable cell) in the local database, preserving them across page reloads. Saving a draft does NOT invalidate any cached analysis results — it is a UX-only convenience. Draft saves never trigger a re-analysis.

#### Scenario: A draft persists unsaved changes locally

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Applying a plan records the applied changes in history

The system SHALL satisfy the following:

Applying a plan records the effective changes (the user's accepted picks, as the saved draft holds them) in a time-stamped apply-history entry. Applying does not send anything to the pump; it only records that the user committed to these changes. Applying does invalidate cached analysis because the history entry is now part of the user's data.

#### Scenario: Applying a plan records the applied changes in history

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: The deliverable is a unified 4-parameter schedule built from the active profile plus accepted changes

The system SHALL satisfy the following:

The pump-ready deliverable is constructed by starting with the pump's currently-active profile, applying each accepted recommendation as a change, and collapsing adjacent rows that carry the same values. The deliverable represents exactly what the user would need to key into their pump. Accepted recommendations override the active profile; the deliverable offers no hand-edit of its own.

#### Scenario: The deliverable is a unified 4-parameter schedule built from the active profile plus accepted changes

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies
