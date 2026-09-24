## ADDED Requirements

### Requirement: The carb-ratio block evidence payload carries the block's explainability facts

The carb-ratio block evidence endpoint SHALL serve, under schema
`diagnose-carb-ratio-block-evidence-v2` and the same analysis-generation guard as
today, the analyzer's published facts copied verbatim — the programmed ratio, the
estimate and its band, the recurrence side counts, the whole and fractional
support, every run's pool reason, side, ownership and ledger terms, the pooled
balance sheet, the harm evidence with its median minutes after bolus, and the run
CGM series over the analyzer-owned bounds — together with the projection layer's
own two facts: the per-meal outcome tally with its sentence, and one meals
comparison projection assembled as the Finding case file assembles a meals-family
comparison, one pooled cohort per served outcome (ran high, ran low, in range),
each with its name, anchor and five-minute pooled points, over the block-hours
meals from ten minutes before each bolus to the end of the post-meal window. A
payload missing any analyzer fact SHALL be refused as inconsistent rather than
served with a hole.

#### Scenario: The v2 payload on the generated fixture

- **WHEN** the endpoint is asked for a block on the committed block-evidence
  fixture with its current analysis generation
- **THEN** the response carries schema v2, every run row's pool reason, the
  block's ledger, outcomes and harm evidence, and a meals comparison projection
  with one named cohort per served outcome
