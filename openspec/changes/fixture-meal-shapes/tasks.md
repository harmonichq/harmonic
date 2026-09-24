# #454 implementation checklist

## 1. A claimed Occurrence's sentence is served once (sub-order 1)

- [x] 1.1 Implement behavioral-layer (MODIFIED) **A selected case-file Occurrence
  serves why it was judged** in `ciq_autotune/finding_case_file.py`: one rule that
  `_habit_reason` and `_pattern_reason` both pass their reason through, so on a
  claimed row the claimant's entry serves a null sentence when its sentence equals
  the cause's text. No other entry, cause, verdict, count or claim changes.
- [x] 1.2 In `tests/test_finding_case_file.py`, amend
  `test_every_selected_reason_agrees_with_its_row`'s expected sentence to the rule,
  and assert over every selected Occurrence of the `meal_facts` and
  `correction_stacking` analyzer stores, and of a `pattern-near-tie` store
  materialized from `scripts/qa_e2e_cases.py` (single-habit and Highs after meals
  case files), that no habit entry's sentence equals the cause's text while each
  cause keeps its text. Show it failing on the base for its feature reason.
- [x] 1.3 Apply the same rule in the fixture-only mirror
  (`mockups/diagnose-event-comparison.synthetic/project.mjs` `patternReason`), and
  test it through `projectPatternCaseFile` in
  `frontend/diagnose-event-comparison.test.js` on a cloned capture whose claimed
  row's claimant sentence equals the row's text; show it failing on the base
  mirror.
- [x] 1.4 Regenerate `mockups/harmonic-v2.exploration` (`generate.py`); confirm
  that only `focus.json`, `journey.json` and `workstation.json` move, and only by
  claimant sentences that became null.
- [x] 1.5 In `frontend/c4.replay.test.js`, compose `block432`'s habit line as the
  renderer does (a null sentence is omitted), so the S149/S150 helper tests read a
  served null sentence the way the desk prints it.
- [x] 1.6 Add ledger story S182 for surfaces (MODIFIED) **A selected Occurrence
  reads as its facts and served reason**, scenario "A claimed Occurrence prints its
  sentence once": a dated `## #454 amendment — 2026-09-23` section in
  `mockups/harmonic-v2-desktop.behavior.md` with the sanction line; `C4_STORIES.S182`
  and its assertion helper in `frontend/c4.replay.mjs` (pattern-near-tie, All
  charts, `pattern:highs_after_meals`, a claimed Occurrence selected: the served
  cause carries text, the rendered cause line carries it, and no other rendered line
  contains it); the export and registry entry in `frontend/desk-behavior.replay.mjs`;
  `S182: 'pattern-near-tie'` in `frontend/replay-cases.mjs`; unit tests in
  `frontend/c4.replay.test.js` (a unique app-only story on pattern-near-tie; the
  helper passes on a once block and fails at its feature assertion, never its
  premise, when a habit line repeats the cause sentence). Move the inventory
  literals 171 · 152 · 19 to 172 · 153 · 19 in
  `mockups/sweep/harmonic-v2-desktop/acceptance.py` and `acceptance.test.py`; run
  `acceptance.py inventory` and the port-free classes. `SMOKE_STORIES` does not
  change: the smoke slice already covers pattern-near-tie.

Evidence (sub-order 1, commit 57231076): the tasks 1.2, 1.3 and 1.6 tests failed on
the base for their feature reason; every Done-when line passed. Coordinator legs on
b847be7e, each on a fresh case store at 1280x720 and 1440x900: the branch's
`ONLY=S25,S149,S150,S182` executed 4 · failed 0; with the branch harness over base
b03431d2, S182 fails at "S182 the cause's sentence must print once; it repeats on:
Carb undercount · Meets criteria · …", not at setup.

## 2. Manufactured rows take their producer's shapes (sub-order 2)

Coordinator-authorized note (release coordinator, 2026-09-24, recorded by the
sub-order 1 worker): manufactured cause sentences carry no dose or ratio text (no
"N U", no ratios). Use dose-free wording like the spike's ("Corrected at 06:50 with
insulin still active; glucose fell to 48…"), so the public-tree dose/ratio set stays
unchanged in sub-order 2.

- [ ] 2.1 Implement behavioral-layer **Manufactured browser-gate rows carry only
  shapes their producer can serve** in `.claude/qa/gen_synthetic_fixtures.py`
  (`verdicts`, `occurrence`, `build_exposures`, `build_case_file_capture`) to
  `design.md`'s row table: kind and label per family; the judged classifiers per
  anchor kind; closed silence reasons; the correction-cluster rows claimed by
  Correction stacking; a claimed row's own verdict matched with its detail equal to
  the row's text and every other judged classifier calm; unclaimed rows
  unjudgeable; High anchor glucose `250 + (draw − 58)`; each claimed case-file
  member's claim text equal to its recorded sentence. Add, remove or reorder no
  random draw. Correct the docstrings that describe the old shape.
- [ ] 2.2 In `mockups/diagnose-event-comparison.synthetic/generate.mjs`, have the
  lows comparison view judge only Over-treated low and Correction on active insulin.
- [ ] 2.3 Add `tests/test_synthetic_fixture_shapes.py` (stdlib `unittest`) over the
  committed `mockups/diagnose-workstation.synthetic/payload.json` exposures and the
  event-comparison capture's views: every row's kind and label are
  `model_view._KIND_LABEL`'s for its family; its verdicts are exactly the classifiers
  judged at that anchor kind (a literal table citing `attribute.py`); every
  classifier is a `Lever` value and every silence reason a `SilenceReason` value; a
  claimed row's claiming lever is one its anchor kind can drive, and that verdict is
  matched with `detail == text`; an unclaimed row has every verdict unmatched and an
  empty text; a High's anchor glucose reaches `ScenarioConfig().anchor_high_mgdl`.
  Show it failing on the base fixtures for its feature reason.
- [ ] 2.4 Regenerate in `design.md`'s order and confirm the moved and unmoved sets
  match `design.md`.
- [ ] 2.5 Amend the node tests the moved facts reach, to the served values:
  `frontend/diagnose-workstation.test.js` (`#432 · a selected Pattern Occurrence
  lists each served habit with its band label`, and `#432 · a selected claimed meal
  reads as its facts, cause and habit sentence`, which now prints the sentence once);
  `frontend/browser-fixture-population.test.js` (`the Afternoon fixture retains all
  four published behavioral Findings` reads Correction stacking where it read
  Correction on active insulin; `browser preparation mirrors the wrapped row` keeps
  its assertions over a test-local clone of the payload whose unclaimed High is an
  Over-treated low rebound High, the one two-family Cause the producer serves).
- [ ] 2.6 Run `docs/scope/454-row-shapes.measure.py` (base payload from
  `origin/main`, regenerated payload) and return its output; it must match
  `design.md`'s moved-fact list.

## 3. The Pattern mirror judges only its rate family (sub-order 3)

- [ ] 3.1 In `scripts/gen_findings_projection_fixtures.py`, freeze
  `habit_rate_families` into `frontend/__fixtures__/findings-projection.json`: one
  entry per `Lever`, its `policy_for(lever).rate_family` value, or null.
- [ ] 3.2 In the same generator, freeze `pattern_family_cases` for Lows after
  correcting highs with a Correction stacking scenario Pattern and Highs after meals
  with a High-carb sequence scenario Pattern: the browser inputs plus that one
  scenario Pattern, assembled as `docs/scope/454-backend-family.repro.py` does,
  projected by `prepare_findings_projection`, then read through
  `PreparedCases.case` over the browser exposures. Each entry holds the roster
  row, the whole clock case and the clock case selected at its first Occurrence.
  Assert in the generator that each roster row carries its out-of-family member.
- [ ] 3.3 In `generate.mjs`, delete the hand-written lever→family table and publish
  the frozen `habit_rate_families` as the capture's `pattern_families`, read from
  `findings-projection.json` beside `browser_outcome_patterns`; keep every
  `buildCapture` caller working.
- [ ] 3.4 Implement behavioral-layer **A Pattern case file judges only the habit
  members in its rate family** in `project.mjs` `projectPatternCaseFile`: keep a
  habit member only when `capture.pattern_families[lever]` equals the Pattern's
  family, and feed that one list to both the row verdict and the selected reason.
- [ ] 3.5 In `frontend/browser-fixture-population.test.js`, for each
  `pattern_family_cases` entry, swap its roster row into a clone of the committed
  capture, project the whole clock case and the first-Occurrence selection, and
  require the frozen verdict counts, each row's verdict and member in order, and the
  selected reason. Show it failing on the base `project.mjs`; confirm
  `docs/scope/454-mirror-family.repro.mjs` passes.

## 4. The browser findings mirror serves the server's scoped Pattern list (sub-order 4)

- [ ] 4.1 In `scripts/gen_findings_projection_fixtures.py`, freeze
  `browser_outcome_patterns_by_window`: the server's scoped roster
  (`prepare_findings_projection(...).project(WindowQuery.clock(...))["outcome_patterns"]`
  over the same browser inputs as `browser_outcome_patterns`) for the closed set of
  scoped windows the browser checks request: `0-360` (the desk suite's only scoped
  preparation, the one scope `finding-case-files.json` holds) and `135-285` and
  `720-1080` (the fast-gate calls). Beside it, freeze `browser_window_queues`: for
  each such window, the server's rows as `[id, claimed_by]`, its `counts` and its
  `chip_counts`.
- [ ] 4.2 In the same generator, freeze `browser_pattern_cases_by_window`: for each
  such window and each Pattern the server charts there, its clock and event case
  files with no selection, read through `PreparedCases.case` over the browser inputs
  with that window's `outcome_window_population` (as `finding_case_file.prepare`
  builds it) and with glucose and boluses rebuilt from the capture's population
  traces (as `pattern_clock_case` does). `generate.mjs` publishes them in the
  capture as `pattern_cases_by_window`.
- [ ] 4.3 Implement behavioral-layer **The browser-gate findings mirror serves the
  server's scoped Pattern list or fails**: `populateFindingsProjectionInput`
  (`frontend/browser-fixture-population.js`) supplies `outcome_patterns_by_window`
  from the frozen map unless the caller brings its own map (sub-order 5 then
  removes that exception), and
  `mockups/findings-projection.mirror.mjs` throws, naming the window, when a
  supplied map lacks a scoped window. `projectPatternCaseFile` answers a scoped
  coordinate only from `pattern_cases_by_window`, with the requested projection id,
  and throws naming the coordinate for any other scoped window or alignment, and for
  any scoped selection.
- [ ] 4.4 In `frontend/browser-fixture-population.test.js`: for each frozen window,
  the mirror through the browser population serves the frozen server rows (as a
  set of `[id, claimed_by]`), counts and chip counts, and each scoped Pattern row's
  prepared header carries its frozen case's summary and verdict counts. Show this
  failing on the base adapter. An unfrozen window, an unfrozen scoped case and a
  scoped selection each throw by name. Amend `the Afternoon fixture retains all four
  published behavioral Findings` to the server's shown set: Highs after meals, Lows
  after correcting highs, Over-treated low and Missed / unannounced meal, still
  "4 in this window". Both comparisons read rows as a set here; sub-order 5 makes
  them ordered once the test desk projects the server's own inputs.

## 5. The test desk projects the server's own inputs (sub-order 5)

- [ ] 5.1 In `scripts/gen_findings_projection_fixtures.py`, freeze `browser_inputs`:
  the browser analysis (the payload's analysis with the projection's tuning
  levers), the browser scenarios, and the analysis generation, exactly as the
  rosters use them. Build every browser roster, guidance Pattern, scoped roster,
  scoped case and family case from the payload's exposures without alteration:
  delete the `memberless_low` mutation, which moves the whole-day roster's Lows after
  meals from k 1 to 0 (rate 0.05 → 0, Wilson interval 0.0151–0.1532 → 0–0.0759).
  Freeze `browser_windows`: the server's full projection of those inputs for the
  whole day and each frozen scoped window, replacing sub-order 4's
  `browser_window_queues`.
- [ ] 5.2 Implement behavioral-layer **The browser-gate test desk projects the
  server's own inputs**: `populateFindingsProjectionInput` builds the server input
  from the frozen analysis, scenarios, analysis generation, rosters and per-window
  map, taking only exposures (and any event charts) from the caller. The `#395 ·
  the browser input publishes only its renderable mini hosts in served order` test
  (`frontend/diagnose-findings-queue.test.js`) projects `fixture.inputs` directly: it
  reads the projection fixture's own inputs, which never needed the browser adapter,
  and its answer is unchanged. In `frontend/desk.browser.test.mjs`, the
  `/api/analyze` and `/api/scenarios` stubs serve the frozen browser inputs, so every
  desk read shares one input as in the app (the desk renders no scenario field and no
  tuning lever).
- [ ] 5.3 In `frontend/browser-fixture-population.test.js`, replace sub-order 4's set
  comparison with a deep equality of the mirror, through the browser population,
  against `browser_windows` for the whole day and each frozen window, row order
  included; show it failing on the sub-order 4 adapter. Amend the tests whose
  expectation encoded the old prices or order: `the Afternoon fixture retains all
  four published behavioral Findings` to the server's order (Over-treated low, Highs
  after meals, Lows after correcting highs, Missed / unannounced meal; "4 in this
  window"), and `browser preparation mirrors the wrapped row` to the served headline
  "Ranks among this window's findings. Showed up in 1 of 10 lows in this window." In
  `frontend/diagnose-findings-queue.test.js`, re-point `#413 · an unpriced claimed
  member folds under the tail Pattern` to Correction stacking, the server's unpriced
  member (folded under Lows after correcting highs, two fold sentences), now that
  Late bolus carries its server price. In `tests/test_findings_projection.py`,
  `test_memberless_patterns_keep_their_count_without_a_chart` builds its own
  memberless roster with k > 0 instead of reading the committed browser roster: over
  a clone of the payload exposures it re-marks one unclaimed meal as claimed by Meal
  over-delivery, the shape the producer serves (that verdict matched, its sentence as
  the row's text), then runs `build_outcome_patterns` with the frozen browser inputs.
  This moves the deleted `memberless_low` mutation into the one test that needs it.
- [ ] 5.4 Confirm, by reading against `design.md`'s locator list, that no desk
  browser test or replay story clicks a changed queue position or asserts the old
  order, and amend any that does.
- [ ] 5.5 Run the lock's whole worker gate on this final commit, including every
  drift check, the public-tree line and the backend pytest once, and state the
  pytest wall time.
