## MODIFIED Requirements

### Requirement: One predicate decides whether an ISF row may stage

The system SHALL satisfy the following:

`isf_asserts_move` is **the** ISF staging decision. The analyzer evaluates it
after every harm adjustment and any final rounding, then stamps its boolean
result onto the published segment. It is true only when the current programmed
value exists, the final row names a direction, the final recommendation exists,
that recommendation differs from current, and the fasting estimate's served range
excludes current (closed bounds, ADR 489). Direction, annotation, evidence,
and the findings queue register remain independent outputs; no consumer may use
one of them as a substitute staging gate.

#### Scenario: ISF is measurable but no programmed value is available

- **GIVEN** a fasting estimate with its interval and supporting-night evidence
- **AND** no programmed ISF overlaps the fasting envelope
- **WHEN** the analyzer publishes its segment
- **THEN** it preserves the estimate and evidence, emits no recommendation, and
  stamps `asserts_move = false`

#### Scenario: The final recommendation equals current

- **GIVEN** the evidence channel names a strengthen direction
- **WHEN** the capped and rounded final recommendation equals the programmed ISF
- **THEN** the segment preserves that direction and annotation but stamps
  `asserts_move = false`, so it cannot enter Plan

## ADDED Requirements

### Requirement: A carb-ratio block serves the meal runs its estimate counts

Each carb-ratio block SHALL serve `evidence.counted_runs`: every pooled meal run
of its roster, in roster order, with its time and its ratio. The I:C Setting
card's dots and its Meal runs count SHALL read that one list (ADR 523).

#### Scenario: The counted runs are the pooled runs

- **GIVEN** the `basal-and-carb-ratio-lower` QA case, whose whole-day block the
  engine stages a move for from eight pooled runs
- **WHEN** the analysis is read
- **THEN** the block's counted runs are those eight runs, with the ratio each run
  serves
