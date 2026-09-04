## MODIFIED Requirements

### Requirement: The separately versioned report is aggregate-only and complete

The report module SHALL expose `REPORT_SCHEMA = "eating-sequence-report-v1"` and
frozen report rows for interval aggregates, quintiles, matrix rows, and comparisons.
Its public serialisation SHALL retain the complete existing report shape, including
the fixed source-window bounds, ordered five-row scopes, six high-carb comparisons,
fifteen matrix rows, fifteen repeat-eating comparisons, closed status enumerations,
and aggregate-only data boundary. Each high-carb comparison row SHALL additionally
carry `reference` and `high`, and each repeat-eating comparison row SHALL additionally
carry `reference` and `repeat`. Each is an interval aggregate with exactly
`status`, `n`, `tir_pct`, `mean_mgdl`, `sd_mgdl`, and `peak_mgdl`; it is insufficient
at `n: 0` with null metrics when the comparison is insufficient. The existing
difference fields remain and SHALL equal high minus reference, or repeat minus
reference, for their corresponding served aggregates. The report SHALL contain no
record-level values.

```json
{"scope":"pooled","period":"in_sequence","reference_cohort":"Q1-Q4","high_cohort":"Q5","status":"insufficient","reference_n":0,"high_n":0,"reference":{"status":"insufficient","n":0,"tir_pct":null,"mean_mgdl":null,"sd_mgdl":null,"peak_mgdl":null},"high":{"status":"insufficient","n":0,"tir_pct":null,"mean_mgdl":null,"sd_mgdl":null,"peak_mgdl":null},"tir_difference_pct_points":null,"mean_difference_mgdl":null,"sd_difference_mgdl":null}
```

#### Scenario: An empty source window remains a complete report

- **GIVEN** no qualifying eating sequences in the fixed Diagnose source window
- **WHEN** the report is serialised
- **THEN** it carries every required comparison cohort aggregate as insufficient
- **AND** it exposes no record-level value
