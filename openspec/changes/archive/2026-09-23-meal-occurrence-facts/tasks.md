# #432 implementation checklist

## 1. Served facts (backend)

- [x] 1.1 Serve `insulin` and `carbs` on every exposure Occurrence in
  `ciq_autotune/explore_exposures.py`, copied from the model-view anchor (null
  where the anchor is not a bolus), and extend the locked key contract in
  `tests/test_explore_exposures.py`: every Occurrence carries both keys, a meal
  Occurrence's values equal its bolus's, a low's and a high's are null.
- [x] 1.2 Expose one public per-meal arc read in `ciq_autotune/outcomes_trend.py`
  that runs the existing `_meal_arc` (still the one implementation) on the
  time-sorted series narrowed by bisection to (bolus, bolus + 6 h], returning the
  Arc peak and its reading time and, only when the nadir window qualifies, the Arc
  nadir and its reading time; make `meal_measurements` read through it. Test in
  `tests/test_outcomes_trend.py` that the read's times match its values on a
  synthetic series, that narrowing changes no value, and that `meal_measurements`
  output for existing keys is unchanged.
- [x] 1.3 Implement behavioral-layer **Case-file Occurrences serve the facts their
  anchor has** in `ciq_autotune/finding_case_file.py`, in both roster paths, the
  rise-onset anchor and the announced-meal detail, to the served shape in
  `design.md`. Test through `PreparedCases.case` over a store run through the real
  analyzer, exposure builder and `prepare` with N synthetic meals (never a hand-set
  anchor glucose): every meal row serves carbs and dose and a null anchor glucose;
  a high-outcome case file serves the Arc peak equal to the arc read for that meal;
  Meal over-delivery serves the Arc nadir or none; correction clusters serve the
  second correction's dose; a Missed / unannounced meal comparison anchor and its
  detail anchor serve null dose and carbs; verdict counts and claims are unchanged.
  Extend the exact key sets in `tests/test_finding_case_file_api.py`
  (`assert_case_tree`) to the new anchor, Occurrence and detail keys. Show the
  facts test failing on the base for its feature reason.
- [x] 1.4 Implement behavioral-layer **A selected case-file Occurrence serves why
  it was judged** in the same module, carrying the per-anchor facts on `Member`'s
  defaulted `recorded`, `driver` and `claim_text` fields as `design.md` states.
  Test over analyzer output, for every Occurrence of each tested single-habit and
  Pattern case file, that the reason agrees with the row: a cause exactly on
  claimed rows naming the claimant; a single-habit row's verdict equals its one
  entry's; an unclaimed Pattern row's verdict is its highest-precedence entry (clean
  when none); a claimed row is fired; every served sentence's recorded verdict
  reads as its entry's verdict. Cover a meal claimed by Meal bolus short inside a
  chartable Highs after meals Pattern (cause Meal bolus short, empty text unless
  that lever drove the meal's episode), building or extending a synthetic store
  until the projection publishes that roster by its own rules, never by hand-set
  claims; and a correction cluster judged by its Correction stacking verdict.
- [x] 1.5 Remove the hand-set meal glucose from the Pattern tests in
  `tests/test_finding_case_file.py`: their exposure rows carry what the exposure
  feed serves for a meal (null glucose, dose, carbs), and the tests assert the
  served facts rather than a glucose.

## 2. Generated evidence

- [x] 2.1 In `.claude/qa/gen_synthetic_fixtures.py`: build the case-file capture's
  meal Opportunities with `opportunities.build_opportunities` over its synthetic
  meal boluses; give its hand-paired correction clusters no anchor glucose; pass its
  synthetic readings as the preparation's judged series so meal rows serve arc
  outcomes; give each hand-verdicted `Member` a `recorded` verdict that
  `_occurrence_verdict` reads as its hand-set verdict (with another lever as
  `driver` for outranked) and a synthetic sentence, and its claimed `Member` a
  synthetic `claim_text`; and give its manufactured meal and correction-cluster
  exposure rows a null glucose plus the dose and carbs the exposure feed serves,
  leaving their kinds, labels, states, attribution and verdicts unchanged.
  `scripts/gen_missed_meal_comparison_fixtures.py` keeps its `Member` defaults.
  Regenerate; `scripts/check_demo_fixtures.py` is clean.
- [x] 2.2 Carry the exposure rows' dose, carbs and `text` through
  `mockups/diagnose-event-comparison.synthetic/generate.mjs` into
  `pattern_populations`, and make `project.mjs` serve the case-file shape of
  `design.md` for Pattern rows and details: dose and carbs on every anchor, a null
  outcome, and a `reason` by the Pattern rule using its existing per-habit state
  function and fired-to-outranked mapping. Regenerate; `node
  mockups/diagnose-event-comparison.synthetic/generate.mjs --check` passes.
- [x] 2.3 In `scripts/gen_findings_projection_fixtures.py`'s `exposures()`, give the
  meal and correction rows a null glucose and a dose and carbs (carbs null on
  corrections). Regenerate every artifact whose generator drifts
  (`scripts/gen_findings_projection_fixtures.py`,
  `scripts/gen_missed_meal_comparison_fixtures.py`,
  `scripts/gen_eating_sequence_fixtures.py`,
  `mockups/harmonic-v2.exploration/generate.py`). Every drift check in AGENTS.md
  passes; no regenerated meal or correction-cluster case-file or exposure
  Occurrence carries an anchor glucose (the event-comparison capture's
  exploration-only `views` and its `pattern_populations` source rows are excluded,
  as `design.md` states); every node test that reads a regenerated capture passes,
  edited only to follow the analyzer-shaped rows.

## 3. Surface and contract

- [x] 3.1 Implement surfaces **Case-file Occurrence rows name what the Occurrence
  is** in `frontend/diagnose-workstation.js` through one exported pure description
  function used by both rosters. Node test with a served meal Occurrence taken from
  the regenerated workstation capture, a correction cluster and a low: each form,
  and no description beginning with a dash for a meal or correction cluster.
- [x] 3.2 Implement surfaces **A selected Occurrence reads as its facts and served
  reason** in the same module through one exported pure facts function. Retire the
  canvas sentence and the two count lines, and replace the source pin in
  `frontend/diagnose-workstation.test.js` with node tests of the facts function
  over served details: a claimed meal with a cause and a habit sentence (the
  regenerated workstation capture's `cases["finding:carb_undercount"]` selected
  claimed member), a Pattern Occurrence with several habit entries (the
  regenerated findings-projection fixture's Highs after meals selection), and a
  correction cluster (the workstation capture's `cases["finding:correction_stacking"]`
  selection).
- [x] 3.3 In `frontend/finding-case-file-validation.js`, require `insulin` and
  `carbs` (number or null) on every anchor it checks, `outcome` (null or a
  well-formed reading) on every roster row, and `reason` (well-formed cause and
  habit entries) on every selected detail, refusing a missing or malformed value;
  test in `frontend/finding-case-file-validation.test.js`.
- [x] 3.4 Add S148, S149 and S150 with replay functions (`frontend/c4.replay.mjs`),
  registry entries (`frontend/desk-behavior.replay.mjs`), case mappings
  (`frontend/replay-cases.mjs`), handler-inventory rows and node regression tests
  in `frontend/c4.replay.test.js` that tell a feature assertion from a setup error.
  Amend S25 (`frontend/c2.replay.mjs`) and S107 (`frontend/c4.replay.mjs` and its
  node test). Record the stories, handler rows and both amendments, with the
  sanction quoted in `design.md`, in a new dated `## #432 amendment — 2026-09-23`
  section of `mockups/harmonic-v2-desktop.behavior.md`, writing each amendment as
  an `Amended S25 · 2026-09-23 · #432 / Q2 sanction: …` or `Amended S107 · …` line
  and never as a line beginning `S25 ·` or `S107 ·`; no `★ FROZEN` block or header
  inventory line is edited. Move only the numeric inventory literals, in
  `mockups/sweep/harmonic-v2-desktop/acceptance.py` `inventory()` and in its test at
  `:226`, `:292` and `:295-296`, to 150 issued, 131 active, 19 retired; run
  `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py
  ReplayPlanTest InventoryProofTest SmokeSelectionTest` and
  `python3 mockups/sweep/harmonic-v2-desktop/acceptance.py inventory --out <scratch
  dir>`, which must print 150/131/19. `ACCEPTANCE.md` and `mockups/INDEX.md` counts
  are the release coordinator's.
- [x] 3.5 Coordinator-run, serially, with `CASE_STORE_DIR` set to a fresh directory
  and nothing else on port 8765, at 1280x720 and 1440x900: S148–S150 fail on the
  base for their feature reason and pass on the branch; the frozen S25 and S107
  fail on the branch build at the count-line and "Completed carb bolus" assertions
  and pass as amended; the render matrix in `design.md` is captured base and branch
  into `docs/scope/release-422-434-evidence/432/`; the whole
  `frontend/desk.browser.test.mjs` passes once; the full
  `mockups/sweep/harmonic-v2-desktop/acceptance.test.py` passes once (it binds a
  port); and the complete ledger passes once per size on the commit to be
  integrated.
