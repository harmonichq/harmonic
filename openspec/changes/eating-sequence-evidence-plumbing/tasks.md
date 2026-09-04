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
- [ ] 6. Add `frontend/diagnose-eating-sequences.js` with exactly
  `adaptEatingSequenceReport(report)`, `trajectorySeries(adapted, { scope, metric })`,
  and `matrixSeries(adapted, { period, metric })`. The adapter preserves aggregates
  untouched; trajectory returns the fixed periods, five quintile series and points
  `{ period, value, n, status }`; matrix returns quintiles 1–5 and bands `1`,`2`,`3+`
  with `{ quintile, value, n, status, comparison }`. Only `3+` has its matched served
  comparison. Unknown scope, metric, or period throws. High-carb charts read
  `adapted.highCarb.comparisons` directly.
- [ ] 7. Add Node tests for the exact public shapes, all fixture values locatable in
  the report, insufficient `{ value: null, status, n }`, the skeleton, and the
  fetch helper's exact route name. Leave `CONTEXT.md` unchanged.
- [ ] 8. Coordinator: run the full gate, including the fixture `--check`.
