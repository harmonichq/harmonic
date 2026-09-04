## ADDED Requirements

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

The contract SHALL assign balanced empirical quintiles over sequences ordered
by `(carb total ascending, sequence start ascending)`. For 0-based rank `i` of
`n`, the internal quintile index SHALL be `min(4, i * 5 // n)`; served quintile
labels SHALL be 1-based Q1 through Q5. The four boundaries SHALL be midpoints
between adjacent ordered carb totals at each cut: for 0-based cut `q`, left
index `((q + 1) * n + 4) // 5 - 1` and right index `min(left + 1, n - 1)`.
These boundaries SHALL be user-relative interpretation data, not clinical or
reusable carb thresholds.

#### Scenario: Equal carb totals remain deterministic

- **GIVEN** sequences with tied carb totals and distinct sequence starts
- **WHEN** quintiles and boundaries are assigned
- **THEN** sequence start breaks the tie deterministically
- **AND** every sequence receives exactly one balanced empirical quintile

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
comparisons. Its public serialisation SHALL include every contract key:
`schema`, `window`, `definitions`, `high_carb_sequence`,
`repeat_eating_amplifier`, `quintiles`, `scopes`, `matrix`, `comparisons`, and
`exclusions`, including all interval aggregate keys and explicit null optional
finding values where no finding exists. It SHALL contain aggregate counts,
aggregate metrics, and optional aggregate finding summaries only; it SHALL NOT
return timestamps, event IDs or rows, Day links, raw EGVs, or per-occurrence
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

### Requirement: The high-carb-sequence detector has one supported-comparison condition

The later high-carb-sequence detector SHALL compare Q5 with Q1–Q4 for the same
metric and interval, and SHALL surface an advisory finding only when both
cohorts are supported and Q5 has lower median TIR or higher median glucose SD.
It SHALL provide pooled and evening aggregates, but an evening headline SHALL
be eligible only when both pooled and evening comparisons clear their evidence
floor. Its headline preference SHALL select the largest supported clinically
legible contrast among in-sequence, post-4-hour, post-6-hour, and equivalent
evening comparisons; without a supported comparison it SHALL serve the report
and insufficiency state without a headline.

#### Scenario: An unsupported Q5 cohort cannot produce a high-carb headline

- **GIVEN** a Q5 versus Q1–Q4 comparison whose Q5 interval aggregate is
  insufficient
- **WHEN** the detector prepares its finding
- **THEN** it serves the aggregate report without a finding headline

### Requirement: The repeat-eating amplifier has one matched-carb comparison condition

The later repeat-eating amplifier SHALL aggregate each interval by carb quintile
and window-count band. It SHALL compare `3+` with `1` only within the same
quintile and interval, and SHALL surface an advisory finding only when both
bands have at least eight qualifying sequences and `3+` has lower median TIR or
higher median glucose SD. The `2` band SHALL remain descriptive and SHALL NOT
be combined with `3+` for a finding. The preferred headline SHALL have the
largest supported TIR difference, preferring post-4-hour over post-6-hour when
both are supported, and SHALL report both cohort counts and the quintile label.

#### Scenario: A populated two-window band is descriptive only

- **GIVEN** an interval where only the `2` window-count band is sufficiently
  populated
- **WHEN** the repeat-eating amplifier prepares its finding
- **THEN** it serves the band as descriptive aggregate evidence
- **AND** it does not produce a repeat-eating finding headline
