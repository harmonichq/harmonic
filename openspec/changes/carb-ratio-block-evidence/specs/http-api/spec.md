## ADDED Requirements

### Requirement: The carb-ratio block evidence payload carries the block's explainability facts

The carb-ratio block evidence endpoint SHALL serve, under schema
`diagnose-carb-ratio-block-evidence-v2` and the same analysis-generation guard as
today, the analyzer's published facts copied verbatim — the block's state, the
programmed ratio, the estimate and its band, the recurrence side counts and
direction, the whole and fractional support, how the counted runs ended with the
flat band, the recommendation with its rule and reason sentence, every run's pool
reason, side, in-block members, fit weight, end and ended-after-later-meal flag
and ledger terms, the pooled balance sheet, the harm evidence with its lows'
groups, runs and minutes after bolus, its group counts, minutes range and bearing
sentence, and the run CGM series over the analyzer-owned bounds — together with
the projection layer's own facts: each block-hours meal's plain reading over its
post-meal window, and the tally with its band and reconciling sentence. A payload
missing any of these facts SHALL be refused as inconsistent rather than served
with a hole.

#### Scenario: The v2 payload on the generated fixture

- **WHEN** the endpoint is asked for a block on the committed block-evidence
  fixture with its current analysis generation
- **THEN** the response carries schema v2, every run row's pool reason, end and fit
  weight, the block's run ends and recommendation, its ledger, the meals' plain
  readings and tally, and the harm evidence with its grouped lows

#### Scenario: A block missing a fact is refused

- **GIVEN** an analyzer payload whose block omits a fact the payload serves
- **WHEN** the endpoint is asked for that block
- **THEN** it refuses the block as inconsistent rather than serving a partial payload
