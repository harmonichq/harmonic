## ADDED Requirements

### Requirement: The verdict is the only basal and I:C staging and delivery predicate

The system SHALL satisfy the following:

The safety verdict — exposed as `SlotEstimate.asserts_move` for basal and as the I:C
analyzer's own single eligibility flag — is what every
downstream consumer reads to decide whether a change may move a deliverable schedule
or be staged into a plan. Basal and I:C also use that same eligibility when counting
actionable priority. **No other
layer may re-derive an evidence floor of its own.** Not the consolidated-profile
builder, not the ranking layer, not any frontend surface. This is the invariant this
codebase has regressed on repeatedly:
each recurrence took the form of a second predicate — a display-only thinness marker,
a `not wide` check, an extra "has a recommendation" test — placed at one call site
while the verdict underneath kept admitting the move, so the change was held in one
place and delivered in another. A new hold belongs *inside* the verdict; a consumer
that re-tests a condition the verdict already covers is a defect regardless of whether
it currently agrees.

#### Scenario: A consumer sees a moved recommendation on a held slot

- **GIVEN** a slot whose verdict is `INSUFFICIENT` but which still carries a capped
  recommendation different from its current rate
- **WHEN** the consolidated profile, the priority tally, or a staging surface reads
  that slot
- **THEN** each of them carries the *current programmed rate* forward and stages
  nothing, because each keys on the verdict and none re-derives eligibility from the
  recommendation, the interval width, or the day count

#### Scenario: A new hold is needed for basal

- **GIVEN** a newly identified condition under which a basal slot must not move
- **WHEN** that hold is implemented
- **THEN** it is expressed as part of the verdict computation, so that the deliverable
  schedule, the priority tally, and every surface inherit it at once

### Requirement: I:C moves are half-gap steps under the 20% cap

The system SHALL satisfy the following:

The I:C analyzer does not route through the basal cap;
it computes its own recommendation as half the gap from the programmed value toward
its measured target, clamped to ±20% of the programmed value. Moving halfway per
window converges on the right value while re-measuring at each step, where repeated
full steps overshoot and reverse. The ±20% clamp is the same per-pass limit the basal
step cap enforces, applied to a different parameter.

#### Scenario: I:C moves are half-gap steps under the 20% cap

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

## REMOVED Requirements

### Requirement: One backend predicate decides whether an ISF row may stage

**Reason:** ADR 564: Harmonic does not estimate or tune the correction factor, because no passive method identifies it under Control-IQ.

**Migration:** None. No correction-factor row is served, so nothing stages or reads one.

### Requirement: A direction without a trustworthy number recommends nothing

**Reason:** ADR 564: Harmonic does not estimate or tune the correction factor, because no passive method identifies it under Control-IQ.

**Migration:** None. No correction-factor row is served, so nothing stages or reads one.

### Requirement: The verdict is the only staging and delivery predicate

**Reason:** ADR 564: Harmonic does not estimate or tune the correction factor, because no passive method identifies it under Control-IQ. Its correction-factor clauses go; the rest is restated as "The verdict is the only basal and I:C staging and delivery predicate".

**Migration:** None; the basal and I:C behavior it states is unchanged.

### Requirement: ISF and I:C moves are half-gap steps under the same 20% cap

**Reason:** ADR 564: Harmonic does not estimate or tune the correction factor, because no passive method identifies it under Control-IQ. Its correction-factor clauses go; the rest is restated as "I:C moves are half-gap steps under the 20% cap".

**Migration:** None; the basal and I:C behavior it states is unchanged.

