# eating-sequences Specification

## Purpose
Eating sequences are the unit Harmonic uses to ask whether a person's own
relatively high-carb eating, or eating repeatedly within one stretch, runs
with less stable glucose during and for a few hours after it. This capability
owns that vocabulary and the aggregate report built from it: how carb-bearing
boluses chain into eating windows and windows into sequences, how sequences
are ranked into carb cohorts relative to the user's own history rather than a
fixed gram cutoff, which measured intervals are eligible, what counts as too
little evidence, and the exact aggregate-only shape a detector may serve. It is
advisory evidence for Diagnose: it stages nothing into the Plan, feeds no
deliverable schedule, and never couples to the safety path.

## Requirements

### Requirement: Eating windows and eating sequences have one pinned construction rule

The eating-sequence detector contract SHALL define a carb-bearing bolus as a
`BolusEvent` with recorded carbs greater than zero. An eating window SHALL chain
carb-bearing boluses when each next bolus is no more than 30 minutes after the
latest bolus already in that window; it starts at the first bolus, ends at the
last, and sums their recorded carbs. A correction-only bolus SHALL neither
create nor extend a window. An eating sequence SHALL chain windows when the next
window's first bolus is no more than three hours after the latest window's last
bolus; it starts and ends at those outer boluses, sums its window carbs, and
counts its windows. The contract SHALL band the count as `1`, `2`, or `3+`.

#### Scenario: A correction does not join two eating windows

- **GIVEN** two carb-bearing boluses separated by more than 30 minutes and a
  correction-only bolus between them
- **WHEN** the detector constructs eating windows
- **THEN** the correction-only bolus creates and extends no eating window
- **AND** the two carb-bearing boluses remain governed only by the pinned
  window and sequence gaps

### Requirement: Measured intervals have explicit eligibility and exclusion counts

The contract SHALL use occupied five-minute CGM slots divided by
`ceil(span_seconds / 300)` for coverage, with a floor of 0.70. A measured
interval SHALL be ineligible when a Carb log entry falls in `[start, end)`;
the Carb log is an exclusion signal only and SHALL not add carbs, create a
window, or change a sequence carb total. A post-sequence interval SHALL be
ineligible when the next sequence starts before its horizon closes. The report
SHALL count CGM-coverage, Carb-log-contamination, and next-sequence-overlap
exclusions separately.

#### Scenario: A contaminated post-sequence horizon is counted, not measured

- **GIVEN** a sequence whose post-4-hour interval contains a Carb log entry
- **WHEN** the detector assesses interval eligibility
- **THEN** that interval does not enter its aggregate
- **AND** `carb_log_contamination` increases while the Carb log changes no
  eating-window or sequence carb total

### Requirement: The report uses only the pinned intervals and scopes

The contract SHALL define `in_sequence` as `[sequence start, sequence end + 5
minutes)`, `post_4h` as `[sequence end, sequence end + 4 hours)`, and `post_6h`
as `[sequence end, sequence end + 6 hours)`. It SHALL define no other
post-sequence horizon. It SHALL report pooled and evening scopes; evening SHALL
mean that the first eating window's first bolus is at 18:00–23:59 local pump
wall time. The analysis source window SHALL be
`findings_projection.DIAGNOSE_SOURCE_WINDOW_DAYS`, not a detector-specific
range.

#### Scenario: A late evening sequence receives the evening scope

- **GIVEN** a sequence whose first eating window begins at 23:59 local pump
  wall time
- **WHEN** the detector assigns scopes
- **THEN** the sequence is included in the evening scope
- **AND** no interval other than `in_sequence`, `post_4h`, or `post_6h` is
  emitted

### Requirement: Interval metrics aggregate qualifying sequences by median

For every eligible interval, the contract SHALL calculate TIR as the percentage
of readings with 70 <= bg <= 180 mg/dL inclusive, mean glucose, population
standard deviation, and peak glucose. A bucket aggregate SHALL be the median
of each per-sequence metric across qualifying sequences, never a pooled
reading-level statistic. Its metric keys SHALL be `tir_pct`, `mean_mgdl`,
`sd_mgdl`, and `peak_mgdl`.

#### Scenario: A long sequence cannot weight a bucket more than a short one

- **GIVEN** two qualifying sequences with different counts of CGM readings
- **WHEN** their bucket aggregate is built
- **THEN** each sequence contributes one per-sequence metric to each median
- **AND** the contract does not pool their readings before calculating the
  aggregate

### Requirement: Carb quintiles are deterministic and user-relative

The contract SHALL assign balanced empirical quintiles once over every
constructed sequence in the source window, before interval eligibility, ordered
by `(carb total ascending, sequence start ascending)`. For 0-based rank `i` of
`n`, the internal quintile index SHALL be `min(4, i * 5 // n)`; served quintile
labels SHALL be 1-based Q1 through Q5. The four boundaries SHALL be midpoints
between adjacent ordered carb totals at each cut: for 0-based cut `q`, left
index `((q + 1) * n + 4) // 5 - 1` and right index `min(left + 1, n - 1)`.
The evening scope SHALL filter that pooled assignment and repeat its boundaries
verbatim; it SHALL never re-rank evening sequences. A quintile row's
`sequence_n` SHALL count every sequence assigned to that quintile within the
scope, whether or not any of its intervals qualify, while each interval
aggregate's `n` SHALL count qualifying sequences only. These boundaries SHALL
be user-relative interpretation data, not clinical or reusable carb thresholds.

#### Scenario: Equal carb totals remain deterministic

- **GIVEN** sequences with tied carb totals and distinct sequence starts
- **WHEN** quintiles and boundaries are assigned
- **THEN** sequence start breaks the tie deterministically
- **AND** every sequence receives exactly one balanced empirical quintile

#### Scenario: Evening rows reuse the pooled quintile assignment

- **GIVEN** constructed source-window sequences whose evening subset has a
  different carb distribution from the pooled set
- **WHEN** quintile rows are prepared for pooled and evening scopes
- **THEN** evening filters the quintiles and boundaries assigned to the pooled
  source-window population without re-ranking
- **AND** each `sequence_n` includes assigned sequences even when all of their
  measured intervals are excluded

### Requirement: Insufficient evidence remains visible and non-concluding

Every interval aggregate SHALL carry `status` and its true qualifying `n`. A
bucket with `n < 8` SHALL have `status` `insufficient` and null for every metric;
it SHALL not support a comparison or finding headline. A bucket with `n >= 8`
SHALL have `status` `supported` and median metrics. A zero-sequence report SHALL
serve a complete all-insufficient report with `n = 0`, rather than omitting
keys or reporting empty success.

#### Scenario: Seven and eight qualifying sequences differ at the evidence floor

- **GIVEN** otherwise valid buckets with seven and eight qualifying sequences
- **WHEN** the interval aggregates are serialised
- **THEN** the seven-sequence aggregate is insufficient with null metrics and
  `n` 7
- **AND** the eight-sequence aggregate is supported with median metrics and
  `n` 8

### Requirement: The separately versioned report is aggregate-only and complete

The report module SHALL expose `REPORT_SCHEMA = "eating-sequence-report-v1"`
and frozen report rows for interval aggregates, quintiles, matrix rows, and
comparisons. Its public serialisation SHALL use the following complete shape.
`window.start` and `window.end` are ISO date-time strings for the source-window
bounds, and are the only time values the report may carry; they are not event
times. `days` and every exclusion count are integers. An interval aggregate's
`n` is an integer >= 0; each metric is a number or null, all null when status is
`insufficient` and all non-null when status is `supported`. `boundaries_g` has
exactly four number-or-null entries. Each scope always has five Q1–Q5 rows in
ascending order. `high_carb_sequence.comparisons` always has all six rows in
`(scope, period)` order; `matrix` always has all fifteen rows in
`(carb_quintile, window_count_band)` order; and
`repeat_eating_amplifier.comparisons` always has all fifteen rows in
`(carb_quintile, period)` order. Optional `finding` is either null or exactly
the shown object. Every `definitions` duration, range, and coverage field is a
number except its closed integer arrays (`post_horizons_hours`,
`tir_range_mgdl`, and `evening_hours`); both detector statuses are exactly
`supported` or `insufficient`; all listed enumerations are closed.

```json
{
  "schema": "eating-sequence-report-v1",
  "window": {"start": "2040-01-01T00:00:00", "end": "2040-01-31T00:00:00", "days": 30},
  "definitions": {"window_merge_minutes": 30, "sequence_gap_hours": 3, "in_sequence_tail_minutes": 5, "post_horizons_hours": [4, 6], "tir_range_mgdl": [70, 180], "cgm_coverage_floor": 0.7, "minimum_bucket_n": 8, "evening_hours": [18, 24]},
  "high_carb_sequence": {
    "status": "insufficient",
    "finding": null,
    "scopes": {
      "pooled": {"boundaries_g": [null, null, null, null], "rows": [
        {"quintile": 1, "sequence_n": 0, "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}},
        {"quintile": 2, "sequence_n": 0, "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}},
        {"quintile": 3, "sequence_n": 0, "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}},
        {"quintile": 4, "sequence_n": 0, "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}},
        {"quintile": 5, "sequence_n": 0, "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}}
      ]},
      "evening": {"boundaries_g": [null, null, null, null], "rows": [
        {"quintile": 1, "sequence_n": 0, "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}},
        {"quintile": 2, "sequence_n": 0, "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}},
        {"quintile": 3, "sequence_n": 0, "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}},
        {"quintile": 4, "sequence_n": 0, "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}},
        {"quintile": 5, "sequence_n": 0, "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}}
      ]}
    },
    "comparisons": [
      {"scope": "pooled", "period": "in_sequence", "reference_cohort": "Q1-Q4", "high_cohort": "Q5", "status": "insufficient", "reference_n": 0, "high_n": 0, "tir_difference_pct_points": null, "mean_difference_mgdl": null, "sd_difference_mgdl": null},
      {"scope": "pooled", "period": "post_4h", "reference_cohort": "Q1-Q4", "high_cohort": "Q5", "status": "insufficient", "reference_n": 0, "high_n": 0, "tir_difference_pct_points": null, "mean_difference_mgdl": null, "sd_difference_mgdl": null},
      {"scope": "pooled", "period": "post_6h", "reference_cohort": "Q1-Q4", "high_cohort": "Q5", "status": "insufficient", "reference_n": 0, "high_n": 0, "tir_difference_pct_points": null, "mean_difference_mgdl": null, "sd_difference_mgdl": null},
      {"scope": "evening", "period": "in_sequence", "reference_cohort": "Q1-Q4", "high_cohort": "Q5", "status": "insufficient", "reference_n": 0, "high_n": 0, "tir_difference_pct_points": null, "mean_difference_mgdl": null, "sd_difference_mgdl": null},
      {"scope": "evening", "period": "post_4h", "reference_cohort": "Q1-Q4", "high_cohort": "Q5", "status": "insufficient", "reference_n": 0, "high_n": 0, "tir_difference_pct_points": null, "mean_difference_mgdl": null, "sd_difference_mgdl": null},
      {"scope": "evening", "period": "post_6h", "reference_cohort": "Q1-Q4", "high_cohort": "Q5", "status": "insufficient", "reference_n": 0, "high_n": 0, "tir_difference_pct_points": null, "mean_difference_mgdl": null, "sd_difference_mgdl": null}
    ],
    "exclusions": {"cgm_coverage": 0, "carb_log_contamination": 0, "next_sequence_overlap": 0}
  },
  "repeat_eating_amplifier": {
    "status": "insufficient",
    "finding": null,
    "matrix": [
      {"carb_quintile": 1, "window_count_band": "1", "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}},
      {"carb_quintile": 1, "window_count_band": "2", "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}},
      {"carb_quintile": 1, "window_count_band": "3+", "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}},
      {"carb_quintile": 2, "window_count_band": "1", "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}},
      {"carb_quintile": 2, "window_count_band": "2", "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}},
      {"carb_quintile": 2, "window_count_band": "3+", "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}},
      {"carb_quintile": 3, "window_count_band": "1", "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}},
      {"carb_quintile": 3, "window_count_band": "2", "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}},
      {"carb_quintile": 3, "window_count_band": "3+", "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}},
      {"carb_quintile": 4, "window_count_band": "1", "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}},
      {"carb_quintile": 4, "window_count_band": "2", "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}},
      {"carb_quintile": 4, "window_count_band": "3+", "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}},
      {"carb_quintile": 5, "window_count_band": "1", "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}},
      {"carb_quintile": 5, "window_count_band": "2", "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}},
      {"carb_quintile": 5, "window_count_band": "3+", "in_sequence": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_4h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}, "post_6h": {"status": "insufficient", "n": 0, "tir_pct": null, "mean_mgdl": null, "sd_mgdl": null, "peak_mgdl": null}}
    ],
    "comparisons": [
      {"carb_quintile": 1, "period": "in_sequence", "reference_band": "1", "repeat_band": "3+", "status": "insufficient", "reference_n": 0, "repeat_n": 0, "tir_difference_pct_points": null, "mean_difference_mgdl": null, "sd_difference_mgdl": null},
      {"carb_quintile": 1, "period": "post_4h", "reference_band": "1", "repeat_band": "3+", "status": "insufficient", "reference_n": 0, "repeat_n": 0, "tir_difference_pct_points": null, "mean_difference_mgdl": null, "sd_difference_mgdl": null},
      {"carb_quintile": 1, "period": "post_6h", "reference_band": "1", "repeat_band": "3+", "status": "insufficient", "reference_n": 0, "repeat_n": 0, "tir_difference_pct_points": null, "mean_difference_mgdl": null, "sd_difference_mgdl": null},
      {"carb_quintile": 2, "period": "in_sequence", "reference_band": "1", "repeat_band": "3+", "status": "insufficient", "reference_n": 0, "repeat_n": 0, "tir_difference_pct_points": null, "mean_difference_mgdl": null, "sd_difference_mgdl": null},
      {"carb_quintile": 2, "period": "post_4h", "reference_band": "1", "repeat_band": "3+", "status": "insufficient", "reference_n": 0, "repeat_n": 0, "tir_difference_pct_points": null, "mean_difference_mgdl": null, "sd_difference_mgdl": null},
      {"carb_quintile": 2, "period": "post_6h", "reference_band": "1", "repeat_band": "3+", "status": "insufficient", "reference_n": 0, "repeat_n": 0, "tir_difference_pct_points": null, "mean_difference_mgdl": null, "sd_difference_mgdl": null},
      {"carb_quintile": 3, "period": "in_sequence", "reference_band": "1", "repeat_band": "3+", "status": "insufficient", "reference_n": 0, "repeat_n": 0, "tir_difference_pct_points": null, "mean_difference_mgdl": null, "sd_difference_mgdl": null},
      {"carb_quintile": 3, "period": "post_4h", "reference_band": "1", "repeat_band": "3+", "status": "insufficient", "reference_n": 0, "repeat_n": 0, "tir_difference_pct_points": null, "mean_difference_mgdl": null, "sd_difference_mgdl": null},
      {"carb_quintile": 3, "period": "post_6h", "reference_band": "1", "repeat_band": "3+", "status": "insufficient", "reference_n": 0, "repeat_n": 0, "tir_difference_pct_points": null, "mean_difference_mgdl": null, "sd_difference_mgdl": null},
      {"carb_quintile": 4, "period": "in_sequence", "reference_band": "1", "repeat_band": "3+", "status": "insufficient", "reference_n": 0, "repeat_n": 0, "tir_difference_pct_points": null, "mean_difference_mgdl": null, "sd_difference_mgdl": null},
      {"carb_quintile": 4, "period": "post_4h", "reference_band": "1", "repeat_band": "3+", "status": "insufficient", "reference_n": 0, "repeat_n": 0, "tir_difference_pct_points": null, "mean_difference_mgdl": null, "sd_difference_mgdl": null},
      {"carb_quintile": 4, "period": "post_6h", "reference_band": "1", "repeat_band": "3+", "status": "insufficient", "reference_n": 0, "repeat_n": 0, "tir_difference_pct_points": null, "mean_difference_mgdl": null, "sd_difference_mgdl": null},
      {"carb_quintile": 5, "period": "in_sequence", "reference_band": "1", "repeat_band": "3+", "status": "insufficient", "reference_n": 0, "repeat_n": 0, "tir_difference_pct_points": null, "mean_difference_mgdl": null, "sd_difference_mgdl": null},
      {"carb_quintile": 5, "period": "post_4h", "reference_band": "1", "repeat_band": "3+", "status": "insufficient", "reference_n": 0, "repeat_n": 0, "tir_difference_pct_points": null, "mean_difference_mgdl": null, "sd_difference_mgdl": null},
      {"carb_quintile": 5, "period": "post_6h", "reference_band": "1", "repeat_band": "3+", "status": "insufficient", "reference_n": 0, "repeat_n": 0, "tir_difference_pct_points": null, "mean_difference_mgdl": null, "sd_difference_mgdl": null}
    ],
    "exclusions": {"cgm_coverage": 0, "carb_log_contamination": 0, "next_sequence_overlap": 0}
  }
}
```

The JSON block's repeating rows use the following exact row definitions:
`quintile` is an integer 1..5 and `sequence_n` an integer >= 0; each of
`in_sequence`, `post_4h`, and `post_6h` is the interval aggregate above.
Each matrix row has integer `carb_quintile` 1..5, `window_count_band` exactly
`"1"`, `"2"`, or `"3+"`, and those three interval aggregates. Each comparison
row in `high_carb_sequence.comparisons` has `scope` exactly `"pooled"` or
`"evening"`, `period` exactly `"in_sequence"`, `"post_4h"`, or `"post_6h"`,
`reference_cohort` exactly `"Q1-Q4"`, `high_cohort` exactly `"Q5"`, `status`
exactly `"supported"` or `"insufficient"`, integer `reference_n` and `high_n`,
and number-or-null `tir_difference_pct_points`, `mean_difference_mgdl`, and
`sd_difference_mgdl`. Its reference aggregate SHALL be the median across the
union of qualifying Q1–Q4 sequences for its scope and period, never a median
of the four quintile medians; each difference SHALL be high minus reference;
and its status SHALL be supported only when both cohorts have `n >=
minimum_bucket_n`. Each comparison row in
`repeat_eating_amplifier.comparisons` has integer `carb_quintile` 1..5,
`period` exactly `"in_sequence"`, `"post_4h"`, or `"post_6h"`,
`reference_band` exactly `"1"`, `repeat_band` exactly `"3+"`, `status` exactly
`"supported"` or `"insufficient"`, integer `reference_n` and `repeat_n`, and
number-or-null
`tir_difference_pct_points`, `mean_difference_mgdl`, and
`sd_difference_mgdl`. `high_carb_sequence.finding`, when non-null, has string
`summary`, `scope` exactly `"pooled"` or `"evening"`, and `period` from the
three interval names. `repeat_eating_amplifier.finding`, when non-null, has
string `summary`, integer `carb_quintile` 1..5, and the same `period`
enumeration. It SHALL contain aggregate counts, aggregate metrics, and optional
aggregate finding summaries only; it SHALL NOT return timestamps other than the
two window bounds, event IDs or rows, Day links, raw EGVs, or per-occurrence
data.

#### Scenario: An empty source window remains a complete report

- **GIVEN** no qualifying eating sequences in the fixed Diagnose source window
- **WHEN** the report is serialised
- **THEN** it carries `eating-sequence-report-v1`, every required key, and
  all-insufficient interval aggregates at `n` 0
- **AND** it exposes no record-level value

### Requirement: Eating-sequence reporting is outside the tuning and safety paths

The eating-sequence report SHALL be a separate report contract, not an extension
of `AnalysisResult`. Neither detector nor report contract SHALL stage a Plan
item, feed the Consolidated profile or a deliverable schedule, create a
`TuningLever`, affect Priority, import `safety.py`, or use a fixed carb cutoff.
The fixed numerical values in this capability SHALL be limited to the pinned
definition and data-quality gates and the 70–180 mg/dL TIR convention.

#### Scenario: An aggregate association cannot become a pump-setting move

- **WHEN** an eating-sequence report has supported adverse aggregates
- **THEN** it remains advisory-only aggregate evidence
- **AND** it does not create a Plan, a deliverable schedule, a `TuningLever`,
  or a safety-path judgment

### Requirement: Store-facing report construction shares Diagnose's source window

The eating-sequences module SHALL expose
`build_report(boluses, cgm, carb_log, *, window_start, window_end, config)` as a
pure event-list entry returning `EatingSequenceReport`. It SHALL also expose
`build_eating_sequence_report(store, *, window_days=30, now=None)`, which reads
BolusEvent, CgmReading, CarbEntry, and basal streams without writing and passes only
the first three to `build_report`. It SHALL read basal solely to derive `span_end`,
never as a modeling input. Its `span_end` SHALL be the latest basal-or-CGM timestamp,
its `now` SHALL be supplied `now` or `span_end` or `datetime.now()`, and its start
SHALL be `now - timedelta(days=window_days)`, matching `build_scenarios`. After that
derivation it SHALL slice all three modeling streams to `[start, now]` (both ends inclusive, the same predicate as Scenario's `_slice`) exactly as
`build_scenarios` slices its streams. `build_report` SHALL treat the lists it receives
as complete window content and SHALL construct no sequence from an event outside
`[window_start, window_end]`.

#### Scenario: Store wrapper reports the same fixed source bounds as Diagnose

- **GIVEN** a store with CGM history and no explicit `now`
- **WHEN** the store-facing report builder runs with the fixed Diagnose window
- **THEN** the report window ends at the latest basal-or-CGM timestamp
- **AND** its start is exactly thirty days earlier

#### Scenario: A basal delivery later than the last CGM reading sets the window end

- **GIVEN** a store whose latest basal delivery is later than its latest CGM reading
- **WHEN** the store-facing report builder runs without an explicit `now`
- **THEN** the report window ends at that basal delivery

#### Scenario: Events before the source window build no sequence

- **GIVEN** otherwise qualifying bolus, CGM, and Carb-log events before the source window
- **WHEN** the store-facing report builder prepares the report
- **THEN** those events produce no eating sequence

### Requirement: High-carb findings are supported aggregate associations only

For each scope and period, the detector SHALL compare Q5 with Q1–Q4. A comparison
row SHALL be `supported` whenever both cohorts clear the floor, and SHALL be adverse
when Q5 has lower median TIR or higher median glucose SD. An evening candidate SHALL
be headline eligible only when both that evening comparison and its pooled counterpart
clear the floor. Headline candidates SHALL rank in two tiers: first every adverse
supported comparison whose TIR difference is negative, ordered by largest absolute
TIR drop; only if no such candidate exists, every adverse supported comparison whose
SD difference is positive, ordered by largest SD rise. Both tiers SHALL break ties by
shorter period and then pooled before evening. Without an adverse supported candidate
its status SHALL be `insufficient` and its finding null. The summary SHALL use the
fixed TIR variant `In <scope> sequences, the highest-carb fifth spent <q5 TIR>% of
the <period label> in range against <reference TIR>% for the rest (n = <high_n> vs
<reference_n>)` or the fixed SD variant `In <scope> sequences, the highest-carb
fifth's <period label> glucose spread was <q5 SD> mg/dL against <reference SD> mg/dL
for the rest (n = <high_n> vs <reference_n>)`, naming the served metric. It SHALL
state an association and SHALL NOT state cause, a carb limit, or a setting change.

#### Scenario: Higher-carb cohort with worse supported TIR receives the headline

- **GIVEN** supported Q5 and Q1–Q4 post-period cohorts where Q5 median TIR is lower
- **WHEN** the detector builds the report
- **THEN** that comparison is supported and the report finding is non-null
- **AND** its summary is an aggregate association from the served values

#### Scenario: A better high-carb cohort does not produce a finding

- **GIVEN** supported cohorts where Q5 has no lower median TIR and no higher median glucose SD
- **WHEN** the detector builds the report
- **THEN** the report has no finding

#### Scenario: An SD-only adverse comparison headlines the SD association

- **GIVEN** supported Q5 and Q1–Q4 cohorts with no negative TIR difference and a
  positive Q5 SD difference
- **WHEN** the detector builds the report
- **THEN** the report finding is non-null and uses the fixed SD association template

### Requirement: Served eating-sequence evidence is generated and parity-checked

The repository SHALL commit `frontend/__fixtures__/eating-sequence-report.json` only
when `scripts/gen_eating_sequence_fixtures.py` produces it from deterministic
synthetic event streams through `build_report`. The fixture SHALL carry
`_generated_by` and `_note`, exercise a supported Q5-versus-Q1–Q4 comparison and a
non-null finding, and the generator's `--check` SHALL byte-compare it. A test SHALL
prove the committed JSON equals `build_report` over the builder streams and carries
the provenance pair.

#### Scenario: Generated populated fixture remains coherent with the analyzer

- **WHEN** the fixture parity test and generator check run
- **THEN** the committed JSON equals the analyzer-built report, has both provenance
  fields, and retains a populated high-carb finding

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
