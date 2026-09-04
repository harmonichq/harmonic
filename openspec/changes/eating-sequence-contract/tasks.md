# Tasks — lock the eating-sequence aggregate detector contract (#274)

- [x] Add `ciq_autotune/analyzers/eating_sequence_config.py` with the frozen,
  code-owned `EatingSequenceConfig` interface: `window_merge_minutes=30.0`,
  `sequence_gap_hours=3.0`, `in_sequence_tail_minutes=5.0`,
  `post_horizons_hours=(4, 6)`, `tir_low_mgdl=70`,
  `tir_high_mgdl=180`, `cgm_coverage_floor=0.7`, `minimum_bucket_n=8`,
  `quintile_count=5`, `evening_start_hour=18`, `evening_end_hour=24`, and
  `window_count_bands=("1", "2", "3+")`. Follow
  `scenario_config.py`'s docstring register: it belongs under `analyzers/`,
  not `ModelConfig` or `safety.py`, because it owns detector rules and
  `analyzers/__init__.py` is inert.
- [x] Add `ciq_autotune/analyzers/eating_sequences.py` as a pure, separately
  versioned report contract. Export `REPORT_SCHEMA =
  "eating-sequence-report-v1"`, frozen row types for interval aggregates,
  quintiles, matrix rows, high-carb comparison rows, repeat comparison rows,
  plus `assign_quintiles`,
  `aggregate_interval`, `report_dict`/`to_dict`, and `empty_report` (or an
  equivalent public interface). Do not import `safety.py`, change
  `AnalysisResult`, or add a `TuningLever`.
- [x] Make `assign_quintiles(values, *, config)` accept one caller-owned item
  per sequence with carb total and a comparable sequence-start key, return each
  item's quintile and four boundaries, and document the index convention:
  internally 0-based indices are permitted, but served rows are Q1–Q5. Sort by
  `(carb_total ascending, sequence_start ascending)`; assign rank `i` of `n`
  to `min(4, i * 5 // n)`; and calculate each boundary as the midpoint of the
  adjacent values at left index `((q + 1) * n + 4) // 5 - 1` and right index
  `min(left + 1, n - 1)`. Assign once across every constructed sequence in the
  source window before interval eligibility, then filter that same assignment
  into the evening scope; evening repeats the pooled boundaries verbatim and
  never re-ranks. Preserve duplicate carb totals through the start-key
  tiebreaker rather than collapsing sequences.
- [x] Make `aggregate_interval(metric_rows, *, config)` return the true
  qualifying `n`; return `status="insufficient"` with all four metric values
  null below `minimum_bucket_n`; otherwise return `status="supported"` and
  medians of the per-sequence `tir_pct`, `mean_mgdl`, `sd_mgdl`, and
  `peak_mgdl` values. It must never produce a pooled reading-level metric.
- [x] Serialize the complete `eating-sequence-report-v1` dictionary in
  `ciq_autotune/analyzers/eating_sequences.py` exactly as the capability's
  **separately versioned report is aggregate-only and complete** requirement
  specifies: five ordered Q1–Q5 quintile rows in each scope, all fifteen
  `(quintile, band)` matrix rows, all six `(scope, period)` high-carb
  comparison rows, all fifteen `(quintile, period)` repeat comparison rows,
  every aggregate and exclusion key, and only `window.start` and `window.end`
  as source-window-bound time values. Public output contains no event id,
  event row, Day link, raw EGV, or per-occurrence data. `empty_report(window)`
  must preserve that complete shape with all rows present and all interval
  aggregates insufficient at `n=0`.
- [x] Add `tests/test_eating_sequences.py` through the public contract
  interface. Cover configuration immutability; deterministic balanced quintiles
  for `n=5k`, non-divisible `n`, ties, and `n<5`; all four boundary values;
  insufficiency at `n=7` and support at `n=8`; median aggregation; complete
  serialisation by walking the dictionary for every required key, exempting
  exactly `window.start` and `window.end` as source-window bounds and rejecting
  every other timestamp-like or event-id-like key or value; and the complete
  `n=0` empty-report skeleton, including five rows per scope, six high-carb
  comparisons, fifteen matrix rows, and fifteen repeat comparisons. Build
  deterministic caller-owned item and metric-row literals in the test; their
  values must not round from a real reading.
- [ ] Run the focused contract tests and the required static gates: the locked
  pytest interpreter, `node --test 'frontend/**/*.test.js'`,
  `npx --yes @fission-ai/openspec@1 validate --all --strict`,
  `python3 scripts/check_adr_numbers.py`,
  `python3 scripts/check_owned_identifiers.py`, and
  `python3 scripts/check_public_allowlist.py`. Leave API/cache integration,
  committed fixtures, Diagnose projection, and frontend work to #275–#278.
