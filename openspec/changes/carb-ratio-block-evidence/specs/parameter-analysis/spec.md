## ADDED Requirements

### Requirement: A carb-ratio block publishes why each run counts and what its ledger held

The system SHALL satisfy the following:

Every run on a block's published roster carries one pool reason from a closed set
— counted whole, counted by carb share, directional-only, prior-meal action not
separable, dosed under an earlier ratio or an uncurrent chain, no outcome read —
chosen by the fit that built the pool, together with its side of the programmed
ratio, the ledger terms that produced its ratio (member boluses, post-meal
corrections by provenance, the acted Control-IQ basal delta, the glucose-travel
insulin and attributed rescue carbs), which of its members were dosed in the
block's hours, the weight the fit gave it, how it ended against where it started
(lower, flat or higher, by a flat band published once on the block), and whether
it ended after a later meal outside the block's hours. The block publishes its
whole-run count, its fractional carb-share ownership and their effective sum; the
side's direction beside its side counts; how its counted runs ended, with an
unread count for the counted runs that have no outcome read and so no end (a block
pooling the no-outcome fallback counts every run there); a
carb-share-weighted pooled balance sheet whose quotient is published beside, and
labelled distinctly from, the fitted estimate; its asserted direction; and its
recommendation with the analyzer's own rule stated in words — half the gap from
the programmed ratio toward the estimate, capped when the step cap bound it,
rounded to the pump's step. A block that asserts no move publishes no
recommended value, no rule sentence and no direction: the analyzer's own
recommendation is unchanged, but a hold serves nothing a consumer could draw as a
move. No consumer reconstructs a reason, a side, an end, a weight, a term or a
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

#### Scenario: Each counted run's weight is its own

- **GIVEN** N synthetic runs through the shipped estimator
- **WHEN** the block's roster is published
- **THEN** each counted run's published fit weight equals the weight the fit gave
  that same run, and the fit's runs are exactly the counted runs

### Requirement: A carb-ratio block publishes its meals' plain readings

The system SHALL satisfy the following:

For each meal dosed in a block's hours, the block-evidence payload publishes the
meal's own plain reading over its post-meal window, from its bolus to the
analyzer's post-meal horizon: its peak and nadir with their minutes after the
bolus, and an outcome — above the band, below it, both, in range, or unread when
the window holds no reading. It also publishes the minutes to the run's next bolus
(a bolus under thirty minutes later is the same meal and is skipped), the peak
before that next bolus, and whether the meal is on a counted run. The band is the
analyzer's own in-range band, published once. The tally counts those outcomes, the
meals on counted runs, and how many of those peaked above the band before their
next bolus and anywhere in their window, and publishes the length of the window
every meal was read over, so no client restates it. A store reading with no glucose value is dropped once,
where every window is sliced, so a sensor gap is never read as a glucose value.
The projection layer publishes the readings and tally, because it holds the store;
the block stamper publishes neither. The block's harm arm publishes its listed
lows, gate, nudge, day count and seriousness, and each low's run, its group (on a
counted run, on a run not counted, or after a bolus that is not one of these
meals), its minutes after its bolus and that bolus's carbs; the harm row adds the
group counts and their total, the median, least and greatest minutes after the bolus over exactly
those lows, and one sentence on how the lows on counted runs bear on the move. The
surface prints every sentence verbatim and composes none.

#### Scenario: A pooled chain spikes, then prints a low

- **GIVEN** a manufactured block whose pooled chain rises above the band after its
  block-hours meal and later prints a low attributed to that meal
- **WHEN** the block evidence is published
- **THEN** its tally counts at least one meal above the band, its harm evidence
  lists the low on a counted run with its minutes after its bolus, and its group
  total counts it

#### Scenario: A sensor gap is not a reading

- **GIVEN** a meal window holding a store reading with no glucose value
- **WHEN** the block evidence is prepared
- **THEN** the preparation succeeds, the gap reading appears in no meal reading and
  no run series, and a window holding only the gap reads as unread
