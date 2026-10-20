# durable-follow-up Specification

## Purpose
Keep a reader's follow-up on a change durable: a Focus saves the outcome window it
was started on, a Trial's ending stays immutable once recorded, and local writes
reconcile against a stale follow-up frontier rather than overwrite it.

## Requirements

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

#### Scenario: The 24 h selection retains the whole day

- **GIVEN** an eligible Pattern selected from the 24 h view, including a Pattern
  displayed through its child finding
- **WHEN** the reader starts and later inspects a Focus
- **THEN** the saved outcome window is explicitly 0–1440 and Inspect restores 24 h
- **AND** both comparison arms include outcomes at 23:59 within their existing
  calendar bounds
- **AND** other equal clock endpoints remain invalid and older records receive
  no inferred scope

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

#### Scenario: Changed late conclusion is a conflict

- **GIVEN** an expired Trial already has a saved late conclusion
- **WHEN** a later request uses a different request identity but different
  conclusion text
- **THEN** the public write returns an explicit conflict
- **AND** the original ending and saved late conclusion remain unchanged

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

### Requirement: A retained comparison keeps the ISF it was captured with

The system SHALL satisfy the following:

A comparison context captured before conversions read the dose-stamped ISF
retains one programmed ISF, and SHALL keep executing every conversion with that
value, so its result neither moves nor reads as an unsupported retained
execution. A context captured after SHALL record that it converts with the
dose-stamped ISF, SHALL carry no ISF value, and SHALL convert each meal with the
dose-stamped rule over the settings snapshots before its cutoff. Both SHALL read
without error.

#### Scenario: A comparison retained before the change reads the same after it

- **GIVEN** a Trial and a Focus whose comparison contexts were captured with a
  programmed ISF before the change
- **WHEN** each comparison is read after the change
- **THEN** each is available and serves the same result it served before

#### Scenario: A comparison captured after the change carries no ISF value

- **GIVEN** a Trial ended after the change
- **WHEN** its comparison context is captured
- **THEN** the context records the dose-stamped ISF source and no ISF value, and
  the store accepts it

### Requirement: A Pattern Focus watches the member it was started on

A Focus started from a Pattern with a `lever` SHALL watch that lever when it is
one of the Pattern's pinnable habit members, and the request SHALL be refused,
with nothing written, when it is not. A Focus started from a Pattern with no
`lever` SHALL watch the Pattern's first pinnable habit member, as before. Either
way the record SHALL keep the Pattern's subject and key, so every reader of the
Pattern's Focus is unchanged. A retried pin SHALL be refused when it names a
`lever` other than the one its Focus watches. A sent lever SHALL be admitted
exactly when the findings projection serves its cause as `pinnable` for that
Pattern.

#### Scenario: A Focus started on the second cause watches it

- **GIVEN** the `pattern-meal-two-causes` QA case, where Carb undercount is the
  Pattern's first pinnable member and Late bolus its second
- **WHEN** a Focus is started with `pattern_key` `highs_after_meals` and `lever`
  `late_bolus`
- **THEN** the Focus watches Late bolus under the subject
  `pattern:highs_after_meals`

#### Scenario: A lever that is not the Pattern's member is refused

- **GIVEN** the same case
- **WHEN** a Focus is started with `pattern_key` `highs_after_meals` and `lever`
  `meal_over_delivery`
- **THEN** the request is refused with 400 and no Focus is written

#### Scenario: With no lever the first member is watched

- **GIVEN** the same case
- **WHEN** a Focus is started with `pattern_key` `highs_after_meals` and no
  `lever`
- **THEN** the Focus watches Carb undercount

#### Scenario: A retry naming another lever is refused

- **GIVEN** a durable pin of Late bolus on Highs after meals
- **WHEN** the same request id is sent again with `lever` `carb_undercount`
- **THEN** it is refused as a request identity mismatch and the Focus still
  watches Late bolus

#### Scenario: A cause served as not pinnable is refused

- **GIVEN** the `pattern-correction-collapse` QA case, whose served cause
  Correction stacking is not `pinnable`
- **WHEN** a Focus is started on Lows after correcting highs with `lever`
  `correction_stacking`
- **THEN** it is refused and no Focus is written
