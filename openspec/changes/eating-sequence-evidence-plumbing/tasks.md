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
  serialisation-key tests and a supported-row equality test that high TIR minus
  reference TIR equals the served difference.

## 2. Fetch and adapt the report for the Diagnose evidence section

- [ ] 4. Add `fetchEatingSequences()` in `frontend/data.js`, beside
  `fetchExploreTimeOfDay` in `makeDeps`, its return namespace, and default exports.
  It calls `/api/diagnose/eating-sequences` with no query parameter.
- [ ] 5. Extend `frontend/diagnose-data-age.test.js`: pin that
  `recordDiagnoseAge(ages, shape, payload)` returns a payload with no
  `input_data_age` unchanged and deletes only `ages[shape]`; invent no age.
- [ ] 6. Add `frontend/diagnose-eating-sequences.js`, Vue-free and DOM-free.
  Field-for-field, with no arithmetic or reclassification, it provides:
  - per-scope Q1–Q5 series over `in_sequence`, `post_4h`, and `post_6h`, with
    median TIR default and served mean/SD alternatives; every point has `n`/status;
  - paired Q5 and Q1–Q4 points per interval and pooled/evening scope from
    `high_carb_sequence.comparisons` plus scope rows, with served `n`/status;
  - a selected-period quintile matrix with `1`, `2`, and `3+` series, attaching
    served comparison status/differences to `3+` cells; and
  - detector `status`, `finding`, and `exclusions` passed through verbatim.
  Insufficient cells remain `null` plus status, never omitted or zero-filled.
- [ ] 7. Add `frontend/diagnose-eating-sequences.test.js` over the regenerated report:
  assert row counts 5 / 5 / 6 / 15 / 15, insufficiency, and no invented number.
  Construct an all-insufficient skeleton from fixture definitions and documented
  shape in a test helper; add no ungenerated fixture.

- [ ] 7. The adapter's high-carb candidate reads `reference` and `high` directly;
  the repeat matrix reads `reference` and `repeat` directly. Its Node tests also
  prove the fetch route name. Leave `CONTEXT.md` unchanged: its Explore entry
  describes a retired mode and should not rename this independent section.
- [ ] 8. Coordinator: run the full gate, including the fixture `--check`.
