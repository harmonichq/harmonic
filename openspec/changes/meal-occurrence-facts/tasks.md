# #432 implementation checklist

## 1. Served facts (backend)

- [ ] 1.1 Serve `insulin` and `carbs` on every exposure Occurrence in
  `ciq_autotune/explore_exposures.py`, copied from the model-view anchor (null
  where the anchor is not a bolus), and extend the locked key contract in
  `tests/test_explore_exposures.py`: every Occurrence carries both keys, a meal
  Occurrence's values equal its bolus's, a low's and a high's are null.
- [ ] 1.2 Expose one public per-meal arc read in `ciq_autotune/outcomes_trend.py`
  from the existing `_meal_arc` implementation, returning the Arc peak and its
  reading time and, only when the nadir window qualifies, the Arc nadir and its
  reading time; make `meal_measurements` read through it. Test in
  `tests/test_outcomes_trend.py` that the read's times match its values on a
  synthetic series and that `meal_measurements` output for existing keys is
  unchanged.
- [ ] 1.3 Implement behavioral-layer **Case-file Occurrences serve the facts their
  anchor has** in `ciq_autotune/finding_case_file.py`, in both roster paths and in
  the announced-meal detail, to the served shape in `design.md`. Test through
  `PreparedCases.case` over a store run through the real analyzer, exposure
  builder and `prepare` with N synthetic meals (never a hand-set anchor glucose):
  every meal row serves carbs and dose and a null anchor glucose; a high-outcome
  case file serves the Arc peak equal to the arc read for that meal; Meal
  over-delivery serves the Arc nadir or none; correction clusters serve the second
  correction's dose; verdict counts and claims are unchanged. Show the test failing
  on the base for its feature reason.
- [ ] 1.4 Implement behavioral-layer **A selected case-file Occurrence serves why
  it was judged** in the same module: `reason` with the attributed cause and one
  habit entry per recorded verdict for the case file's habits, the verdict taken
  from `findings_projection._occurrence_verdict`. Test the Meal bolus short
  matched meal (cause, no habit entry), a Pattern Occurrence (one entry per habit
  with a recorded verdict), and a correction cluster (its Correction stacking
  verdict), all over analyzer output.
- [ ] 1.5 Remove the hand-set meal glucose from the Pattern tests in
  `tests/test_finding_case_file.py`: their exposure rows carry what the exposure
  feed serves for a meal (null glucose, dose, carbs), and the tests assert the
  served facts rather than a glucose.

## 2. Generated evidence

- [ ] 2.1 In `.claude/qa/gen_synthetic_fixtures.py`, build the case-file capture's
  meal Opportunities with `opportunities.build_opportunities` over its synthetic
  meal boluses, give its hand-paired correction clusters no anchor glucose, and
  pass its synthetic readings as the preparation's judged series so meal rows
  serve arc outcomes. Give its manufactured meal and correction-cluster exposure
  rows the analyzer's kind and label, a null glucose, and the dose and carbs the
  exposure feed serves. Regenerate and leave `scripts/check_demo_fixtures.py`
  clean.
- [ ] 2.2 Carry those facts through
  `mockups/diagnose-event-comparison.synthetic/generate.mjs` into
  `pattern_populations`, and make `project.mjs` serve the case-file shape of
  `design.md` for Pattern rows and details: anchor dose and carbs, a null outcome,
  and a `reason` built from the capture's recorded verdicts with its existing
  per-habit state function. Regenerate; `node
  mockups/diagnose-event-comparison.synthetic/generate.mjs --check` passes.
- [ ] 2.3 Regenerate every other committed artifact whose generator drifts
  (`scripts/gen_findings_projection_fixtures.py`,
  `scripts/gen_missed_meal_comparison_fixtures.py`,
  `scripts/gen_eating_sequence_fixtures.py`,
  `mockups/harmonic-v2.exploration/generate.py`), refreshing the findings-projection
  generator's frozen exposure slice only where the Pattern case needs the new
  Occurrence keys. Every drift check in AGENTS.md passes, and every node test that
  reads a regenerated capture passes, edited only to follow the analyzer-shaped
  meal and correction rows.

## 3. Surface and contract

- [ ] 3.1 Implement surfaces **Case-file Occurrence rows name what the Occurrence
  is** in `frontend/diagnose-workstation.js` through one exported pure description
  function used by both rosters. Node test with a served meal Occurrence taken from
  the regenerated workstation capture, a correction cluster and a low: each form,
  and no description beginning with a dash for a meal or correction cluster.
- [ ] 3.2 Implement surfaces **A selected Occurrence reads as its facts and served
  reason** in the same module through one exported pure facts function. Retire the
  canvas sentence and the two count lines, and replace the source pin in
  `frontend/diagnose-workstation.test.js` with node tests of the facts function
  over a served meal, Pattern and correction-cluster detail.
- [ ] 3.3 Validate the new fields in `frontend/finding-case-file-validation.js`
  (`anchor.insulin`, `anchor.carbs`, `outcome`, detail `reason`), refusing a
  malformed value; test in `frontend/finding-case-file-validation.test.js`.
- [ ] 3.4 Add S148, S149 and S150 to the desk behavior ledger with replay
  functions (`frontend/c4.replay.mjs`), registry entries
  (`frontend/desk-behavior.replay.mjs`), case mappings
  (`frontend/replay-cases.mjs`), handler-inventory rows and node
  regression tests in `frontend/c4.replay.test.js` that tell a feature assertion
  from a setup error. Amend S25 (`frontend/c2.replay.mjs`) and S107
  (`frontend/c4.replay.mjs` and its node test) under the sanction quoted in
  `design.md`, recording each amendment under the frozen header. Move the pinned
  inventory to 150 issued, 131 active, 19 retired in
  `mockups/sweep/harmonic-v2-desktop/acceptance.py`, its test and `ACCEPTANCE.md`.
- [ ] 3.5 Coordinator-run, serially, never two port-bound legs at once: prove
  S148–S150 fail on the base for their feature reason and pass on the branch, and
  S25 and S107 pass as amended, at 1280x720 and 1440x900; run the desk browser
  suite's grouped-comparison test; then the complete ledger once per size on the
  commit to be pushed.
