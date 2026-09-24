## ADDED Requirements

### Requirement: A carb-ratio block publishes why each run counts and what its ledger held

The system SHALL satisfy the following:

Every run on a block's published roster carries one pool reason from a closed set
— counted whole, counted by carb share, directional-only, prior-meal action not
separable, dosed under an earlier ratio or an uncurrent chain, no outcome read —
chosen by the fit that built the pool, together with its side of the programmed
ratio and the ledger terms that produced its ratio: member boluses, post-meal
corrections by provenance, the acted Control-IQ basal delta, the glucose-travel
insulin and attributed rescue carbs. The block publishes its whole-run count, its
fractional carb-share ownership and their effective sum, and a carb-share-weighted
pooled balance sheet whose quotient is published beside, and labelled distinctly
from, the fitted estimate. No consumer reconstructs a reason, a side, a term or a
count from the estimate, the bounds or the run identity.

#### Scenario: A lone meal whose outcome read falls in a CGM gap

- **GIVEN** N synthetic runs through the shipped estimator, one of them a lone meal
  with no CGM at its outcome read
- **WHEN** the block's roster is published
- **THEN** that run's pool reason is "no outcome read", it is not in the pool, and
  it is not marked directional-only

#### Scenario: A run's published ratio is its published terms' quotient

- **GIVEN** any published pooled run
- **WHEN** its ledger terms are summed as the meal-run ledger defines them
- **THEN** carbs covered over that sum equals the run's published ratio

### Requirement: A carb-ratio block publishes its meals' outcomes and one reconciling sentence

The system SHALL satisfy the following:

For the meals dosed in a block's hours over its fixed span, the block-evidence
payload publishes each meal's outcome as read by the Pattern roster's own
credited claims — ran high when credited to a highs-after-meals rate lever, ran
low when credited to a lows-after-meals rate lever, in range when a meal
exposure credited to neither, unread when no meal exposure exists — with their
counts, and one sentence chosen on the server from a closed set on the block's
asserted direction, the tally's balance and the chain-end read. The projection
layer publishes these, because it holds the store the exposure feed reads; the
block stamper publishes neither. The block's harm arm's attributed printed lows,
gate, nudge, day count and seriousness are published with them, together with
the median minutes from each low's dominant bolus to the low over exactly those
lows. The surface prints the sentence verbatim and composes none.

#### Scenario: A pooled chain spikes, then prints a low

- **GIVEN** a manufactured block whose pooled chain rises above the target range
  after its block-hours meal and later prints a low attributed to that meal
- **WHEN** the block evidence is published
- **THEN** its tally counts at least one ran-high and one ran-low meal, its harm
  evidence lists the low with the median minutes after its bolus, and its
  sentence names the chain-end read
