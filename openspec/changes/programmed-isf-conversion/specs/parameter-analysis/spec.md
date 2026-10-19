## REMOVED Requirements

### Requirement: The measured ISF feeds the I:C ledger's glucose-travel term

**Reason**: No passive method identifies ISF under Control-IQ, and the pooled
fasting estimate leans toward stronger corrections (#563).

**Migration**: Replaced by "The programmed ISF feeds every glucose-to-insulin
conversion" below; the correction-only fallback and the confirmed-subpopulation
rule carry over unchanged.

## ADDED Requirements

### Requirement: The programmed ISF feeds every glucose-to-insulin conversion

The system SHALL satisfy the following:

Turning glucose travel into insulin units requires one representative ISF for
the window. Every such conversion SHALL use the median of the latest settings
snapshot's active ISF schedule: the I:C ledger's glucose-travel term, the
carb-undercount classifier, and the scenario engine's attribution wherever it
runs. No conversion SHALL read the ISF analyzer's fasting estimate, because no
passive method identifies ISF under Control-IQ and the pooled estimate leans
toward stronger corrections. Where no programmed ISF exists, the ledger falls
back to its correction-only form and flags those runs as unconfirmed. Confirmed
and fallback runs centre differently, so whenever any run in a pool has a
readable outcome the estimate is taken from that subpopulation alone rather
than folding a mixture into one number.

#### Scenario: A carb-ratio result does not move with the fasting ISF estimate

- **GIVEN** two synthetic stores with the same programmed ISF and the same
  meals, which differ only in their fasting nights, so that the ISF analyzer
  serves a different estimate for each
- **WHEN** the analysis runs over each store
- **THEN** both serve the same carb-ratio segment rows and blocks, including
  every staging verdict

#### Scenario: A zero fasting estimate leaves the glucose-travel term in place

- **GIVEN** a store whose ISF analyzer serves an estimate of zero, and whose
  active schedule programs an ISF
- **WHEN** the I:C ledger reads a meal with a readable outcome
- **THEN** the meal's glucose travel is converted with the programmed ISF, and
  the meal is not read as having no outcome
