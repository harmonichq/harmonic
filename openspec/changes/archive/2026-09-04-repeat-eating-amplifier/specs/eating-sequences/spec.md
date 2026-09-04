## ADDED Requirements

### Requirement: Repeat-eating amplifier compares matched carb cohorts

For every eligible sequence, the report SHALL band `EatingSequence.window_count`
as `1`, `2`, or `3+`, and SHALL aggregate `in_sequence`, `post_4h`, and `post_6h`
by `(carb quintile, band)` into all fifteen `matrix` rows in that order. For every
carb quintile and period it SHALL compare the `3+` band with the `1` band into all
fifteen `comparisons` rows in `(carb_quintile, period)` order. A comparison SHALL
be supported only when both bands have `n >= minimum_bucket_n`; its differences
SHALL be repeat minus reference for TIR, mean glucose, and glucose SD. A comparison
is adverse when `3+` has lower median TIR or higher median glucose SD. The `2` band
SHALL be served in the matrix but SHALL not enter a comparison or finding.

The detector SHALL surface a finding only from an adverse supported comparison. It
SHALL first select the TIR-drop tier, ordered by largest absolute negative
`tir_difference_pct_points`; only when that tier has no candidate, it SHALL select
the SD-rise tier ordered by largest positive `sd_difference_mgdl`. Both tiers SHALL
break ties by `post_4h`, `post_6h`, `in_sequence`, then lower quintile number. Its
TIR summary SHALL be `In carb quintile <q> sequences, those with three or more
eating windows spent <repeat TIR>% of the <period label> in range against
<reference TIR>% for single-window sequences (n = <repeat_n> vs <reference_n>)`.
Its SD summary SHALL be `In carb quintile <q> sequences, those with three or more
eating windows had a <period label> glucose spread of <repeat SD> mg/dL against
<reference SD> mg/dL for single-window sequences (n = <repeat_n> vs
<reference_n>)`. Both state association only and SHALL NOT state cause, a carb
limit, an eating-frequency prescription, or a setting change. When no adverse
supported comparison exists, status SHALL be `insufficient` and finding null.

#### Scenario: An adverse matched repeat cohort headlines the TIR association

- **GIVEN** supported `3+` and `1` cohorts in one carb quintile where `3+` has
  lower median TIR
- **WHEN** the detector builds the report
- **THEN** the comparison is supported and the report finding is non-null
- **AND** its summary uses the fixed TIR template from served cohort metrics

#### Scenario: An SD-only adverse matched repeat cohort headlines the SD association

- **GIVEN** supported `3+` and `1` cohorts with no negative TIR difference and a
  positive `3+` glucose-SD difference
- **WHEN** the detector builds the report
- **THEN** the finding is non-null and uses the fixed SD template

#### Scenario: A populated two-window band alone concludes nothing

- **GIVEN** the `2` band has at least `minimum_bucket_n` eligible sequences while
  the `3+` band is thin
- **WHEN** the detector builds the report
- **THEN** the `2` matrix row remains populated
- **AND** no repeat-eating finding is produced

#### Scenario: Four-hour evidence wins an equal TIR-drop tie

- **GIVEN** adverse supported `post_4h` and `post_6h` comparisons in the same
  quintile with equal TIR drops
- **WHEN** the detector selects its headline
- **THEN** its finding names `post_4h`

### Requirement: Both detectors share eligibility and exclusions

The repeat-eating amplifier SHALL use the same pre-eligibility pooled quintile
assignment and same `_metrics` eligibility output as the high-carb sequence detector.
It SHALL NOT re-derive quintiles or make a second eligibility pass. Its exclusions
block SHALL carry the same `cgm_coverage`, `carb_log_contamination`, and
`next_sequence_overlap` counts as `high_carb_sequence.exclusions`.

#### Scenario: Detector exclusion blocks are equal

- **GIVEN** a source window with intervals excluded for coverage, Carb-log
  contamination, or next-sequence overlap
- **WHEN** the report is built
- **THEN** `repeat_eating_amplifier.exclusions` equals `high_carb_sequence.exclusions`
