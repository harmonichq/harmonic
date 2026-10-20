## REMOVED Requirements

### Requirement: The measured ISF feeds the I:C ledger's glucose-travel term

**Reason**: No passive method identifies ISF under Control-IQ, and the pooled
fasting estimate leans toward stronger corrections (#563).

**Migration**: Replaced by "The dose-stamped ISF feeds the I:C ledger's
glucose-travel term" below; the correction-only fallback and the
confirmed-subpopulation rule carry over unchanged.

## ADDED Requirements

### Requirement: The dose-stamped ISF feeds the I:C ledger's glucose-travel term

The system SHALL satisfy the following:

Turning a meal's or a run's glucose travel into insulin units SHALL use the ISF
the pump stamped on its bolus; for a chained run, its first member's. A bolus
with no stamp SHALL use the programmed ISF segment in force at its time of day
in the latest settings snapshot captured at or before it. With neither, the
meal SHALL NOT be converted, and the ledger falls back to its correction-only
form and flags that run as unconfirmed. No conversion SHALL read the ISF
analyzer's fasting estimate, because no passive method identifies ISF under
Control-IQ and the pooled estimate leans toward stronger corrections. Confirmed
and fallback runs centre differently, so whenever any run in a pool has a
readable outcome the estimate is taken from that subpopulation alone rather than
folding a mixture into one number.

#### Scenario: Each meal converts with the ISF stamped on its bolus

- **GIVEN** a synthetic store whose ISF schedule has two segments, with meals in
  each segment whose boluses carry that segment's stamp
- **WHEN** the analysis runs
- **THEN** each run's glucose travel in units is its travel divided by its own
  bolus's stamped ISF

#### Scenario: An unstamped meal converts with the segment in force as of its time

- **GIVEN** a meal bolus with no stamped ISF, after a settings snapshot whose
  schedule programs a segment at the meal's time of day, and a later snapshot
  that programs a different value there
- **WHEN** the analysis runs
- **THEN** the meal converts with the earlier snapshot's segment

#### Scenario: An unstamped meal before every snapshot is not converted

- **GIVEN** a meal bolus with no stamped ISF earlier than every settings snapshot
- **WHEN** the analysis runs
- **THEN** its run carries no glucose travel in units and reads as unconfirmed

#### Scenario: A carb-ratio result does not move with the fasting ISF estimate

- **GIVEN** two synthetic stores with the same meals, stamps, printed lows and
  meal-window basal, which differ only in their fasting nights, so that the ISF
  analyzer serves a different estimate for each, one of them zero
- **WHEN** the analysis runs over each store
- **THEN** both serve the same carb-ratio segment rows and blocks, including
  every staging verdict, and every meal with a readable outcome is converted
