## ADDED Requirements

### Requirement: New Focus records retain the selected outcome window

When a reader starts a Focus from a Pattern, the backend SHALL validate and save
the selected named or drawn outcome clock window with the new Focus context. It
SHALL use that same saved scope for Focus eligibility and both Before and After
comparison arms, within their existing calendar boundaries. It SHALL preserve
full contributing episodes even where their antecedent precedes the window.
Later Diagnose navigation or a changed live window SHALL NOT mutate the saved
context. Historical records without a saved window SHALL retain their existing
comparison semantics without an inferred/backfilled window or a new blanket
unavailable state.

#### Scenario: Focus comparison keeps its admission scope

- **GIVEN** a reader starts a Focus from a scoped Pattern and later changes the
  Diagnose window
- **WHEN** the Focus is read or reassessed
- **THEN** eligibility and both comparison arms use the saved outcome window
- **AND** the original episode context remains available without clipping it to
  the clock boundary

#### Scenario: Historical Focus remains honest

- **GIVEN** a retained Focus created before this requirement
- **WHEN** its history record is read
- **THEN** no selected clock window is inferred or backfilled
- **AND** its existing comparison semantics remain available where they were
  previously available

### Requirement: A late Trial conclusion is additive to an immutable ending

An expired Trial SHALL retain its original ending kind, effective time and saved
ending assessment. The backend SHALL allow a separately dated late conclusion as
an additive record fact without resuming the watch, changing expiry, replacing
the ending, or changing admission of another watch. The write SHALL be
idempotent across retry and conflict-safe against stale input; a successful
durable write SHALL invalidate cached reads after commit. History reads SHALL
remain read-only. A requested reassessment SHALL be named and loaded on demand,
not prewarmed, and SHALL remain distinct from the late conclusion.

#### Scenario: Expiry survives an additive conclusion

- **GIVEN** an expired Trial with an immutable recorded ending
- **WHEN** a reader records and retries a late conclusion
- **THEN** history shows the original ending and separately dated conclusion
- **AND** the Trial remains expired and no duplicate conclusion or reopened
  active watch is created

#### Scenario: Stale conclusion does not poison cached history

- **GIVEN** concurrent stale and current late-conclusion requests
- **WHEN** the public write and subsequent history read complete
- **THEN** the conflict is explicit or the idempotent saved result is returned
- **AND** the next cached read reflects only the committed record

### Requirement: Local writes reconcile a stale follow-up frontier

After a committed carb or prompt write, and on startup when the retained
frontier revision is stale, the existing local reconciliation SHALL run without
changing immutable endings or admission policy. GET requests remain read-only.
If reconciliation fails after the input commits, cached reads SHALL still be
invalidated and the failure SHALL remain explicit.

#### Scenario: A committed input recovers a stale frontier

- **GIVEN** a synthetic stale frontier with either a live or expired retained
  Trial
- **WHEN** a carb or prompt write commits, or the app starts against it
- **THEN** local reconciliation preserves the original ending and current
  admission result
- **AND** a failed reconciliation still invalidates cache after the input write
