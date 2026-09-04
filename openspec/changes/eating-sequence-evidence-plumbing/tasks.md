# Tasks — eating-sequence evidence plumbing

## 1. Serve both cohorts on every comparison row

- [ ] 1. Extend `HighCarbComparisonRow` with `reference` and `high`, and
  `RepeatComparisonRow` with `reference` and `repeat`: serialise each as the
  existing six-key interval aggregate. Populate them from `_ComparedCohorts` and
  `_ComparedRepeatCohorts`; make `empty_report` use the insufficient aggregate.
- [ ] 2. Amend the complete eating-sequences requirement under `## MODIFIED
  Requirements`: its normative JSON and comparison-row prose include both cohorts.
- [ ] 3. Regenerate `frontend/__fixtures__/eating-sequence-report.json` through
  `scripts/gen_eating_sequence_fixtures.py`; retain parity and `--check`. Add
  serialisation-key tests and equality tests for every supported high-carb and
  repeat row: nested cohort `n` equals the row count and each non-null TIR, mean,
  and SD difference equals the served subtraction, using `assertAlmostEqual`.

## 2. Fetch and adapt the report for the Diagnose evidence section

- [ ] 4. Add `fetchEatingSequences()` in `frontend/data.js`, beside
  `fetchExploreTimeOfDay` in `makeDeps`, its return namespace, and default exports.
  It calls `/api/diagnose/eating-sequences` with no query parameter.
- [ ] 5. Extend `frontend/diagnose-data-age.test.js`: pin that
  `recordDiagnoseAge(ages, shape, payload)` returns a payload with no
  `input_data_age` unchanged and deletes only `ages[shape]`; invent no age.
- [ ] 6. Add `frontend/diagnose-eating-sequences.js` exporting exactly three
  functions, field selection and renaming only, never arithmetic:
  `adaptEatingSequenceReport(report)` returns
  `{ schema, window, definitions, highCarb: { status, finding, exclusions,
  scopes: { pooled: { boundaries_g, rows: [quintile row x5] }, evening: { same } },
  comparisons: [row x6] }, repeat: { status, finding, exclusions, matrix: [row x15],
  comparisons: [row x15] } }` where every served row and every interval aggregate
  (`{ status, n, tir_pct, mean_mgdl, sd_mgdl, peak_mgdl }`) is carried through with
  its served keys, and the comparison rows keep their nested `reference` and
  `high` / `repeat` aggregates. `trajectorySeries(adapted, { scope, metric })`, with
  `scope` in `pooled | evening` and `metric` in `tir_pct | mean_mgdl | sd_mgdl`,
  returns `{ periods: ['in_sequence','post_4h','post_6h'], boundaries_g,
  series: [ { quintile, sequence_n, points: [ { period, value, n, status } x3 ] } x5 ] }`
  where `value` is the aggregate's `metric` field or null when its status is
  insufficient. `matrixSeries(adapted, { period, metric })`, with `period` one of the
  three fixed periods and `metric` in `tir_pct | sd_mgdl`, returns
  `{ quintiles: [1,2,3,4,5], series: [ { band, cells: [ { quintile, value, n, status,
  comparison } x5 ] } x3 ] }` in band order `1`, `2`, `3+`, where `comparison` is the
  served repeat comparison row for that quintile and period on the `3+` band's
  cells and null elsewhere. Any other `scope`, `metric` or `period` throws. The
  evening-versus-pooled chart reads `adapted.highCarb.comparisons` directly; there
  is no third selector.
- [ ] 7. Add Node tests for the exact public shapes, all fixture values locatable in
  the report, insufficient `{ value: null, status, n }`, the skeleton, and the
  fetch helper's exact route name. Leave `CONTEXT.md` unchanged.
- [ ] 8. Coordinator: run the full gate, including the fixture `--check`.
