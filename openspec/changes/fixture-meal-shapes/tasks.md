# #454 implementation checklist

## 1. The Pattern mirror judges only its rate family

- [ ] 1.1 In `scripts/gen_findings_projection_fixtures.py`, freeze
  `habit_rate_families` into `frontend/__fixtures__/findings-projection.json`: one
  entry per `Lever`, its `policy_for(lever).rate_family` value, or null.
- [ ] 1.2 In the same generator, freeze `pattern_family_cases`, keyed by Pattern
  key, for Lows after correcting highs with a Correction stacking scenario Pattern
  and Highs after meals with a High-carb sequence scenario Pattern: the browser
  inputs plus that one scenario Pattern, assembled as
  `docs/scope/454-backend-family.repro.py` does, projected by
  `prepare_findings_projection`, then read through `PreparedCases.case` over the
  browser exposures. Each entry holds the Pattern's roster row, the whole clock
  case and the clock case selected at its first Occurrence. Assert in the generator
  that each roster row carries the out-of-family member, so a roster change that
  drops it fails generation rather than freezing a vacuous case.
- [ ] 1.3 In `mockups/diagnose-event-comparison.synthetic/generate.mjs`, delete the
  hand-written lever→family table and publish the frozen `habit_rate_families` as
  the capture's `pattern_families`, read from `findings-projection.json` beside
  `browser_outcome_patterns`; keep every existing `buildCapture` caller working.
- [ ] 1.4 Implement behavioral-layer **A Pattern case file judges only the habit
  members in its rate family** in
  `mockups/diagnose-event-comparison.synthetic/project.mjs`
  `projectPatternCaseFile`: keep a habit member only when
  `capture.pattern_families[lever]` equals the Pattern's family, and feed that one
  list to both the row verdict and the selected reason. Claims stay as the capture
  records them, so an out-of-family claimant is still the row's cause.
- [ ] 1.5 In `frontend/browser-fixture-population.test.js`, add a test that, for
  each `pattern_family_cases` entry, swaps its roster row into a clone of the
  committed capture, projects the whole clock case and the case selected at the
  first population Occurrence, and requires the frozen answer's verdict counts,
  each row's verdict and member in order, and the selected reason. Show it failing
  on the base `project.mjs` for its feature reason (an extra habit entry), then
  passing.

## 2. Manufactured exposure rows take the real feed's shapes

- [ ] 2.1 Implement behavioral-layer **Manufactured browser-gate exposure rows
  carry only shapes the exposure feed can serve** in
  `.claude/qa/gen_synthetic_fixtures.py` (`verdicts`, `occurrence`,
  `build_exposures`) to `design.md`'s row table: kind and label per family; the
  judged classifiers per anchor kind; closed silence reasons; a claimed row's own
  verdict matched with its detail equal to the row's text and every other judged
  classifier calm; unclaimed rows unjudgeable; a sentence in the claiming lever's
  own form (the Over-treated low sentence kept); correction clusters with no
  verdict and their claim kept; High anchor glucose derived from the existing draw
  at or above `ScenarioConfig().anchor_high_mgdl`. Add, remove or reorder no random
  draw. Correct the docstrings that describe the old shape.
- [ ] 2.2 Add `tests/test_synthetic_fixture_shapes.py` (stdlib `unittest`): read
  the committed `mockups/diagnose-workstation.synthetic/payload.json` exposures
  and require, for every row, the kind and label `model_view._KIND_LABEL` gives
  its family's anchor kind; exactly the judged classifier set for that anchor kind
  (a literal table citing `attribute.py`); every classifier a `Lever` value and
  every silence reason a `SilenceReason` value; on a claimed row whose cause lever
  is judged there, that verdict matched with `detail == text` and the others
  unmatched; on an unclaimed row, every verdict unmatched and an empty text; a High
  anchor glucose at or above `anchor_high_mgdl`. Show it failing on the base
  fixture for its feature reason, then passing.
- [ ] 2.3 Regenerate in `design.md`'s order (generator, projection fixtures,
  `generate.mjs --write`) and confirm the moved and unmoved sets match
  `design.md`.
- [ ] 2.4 Run `docs/scope/454-row-shapes.measure.py` with the base payload
  (`git show origin/main:mockups/diagnose-workstation.synthetic/payload.json`) and
  the regenerated one; confirm only the enumerated verdict-band cells move, and
  record the output summary under `design.md`'s measured facts.
- [ ] 2.5 Amend `frontend/diagnose-workstation.test.js`
  `#432 · a selected Pattern Occurrence lists each served habit with its band
  label` to the served habit sentences, keeping every other assertion.

## 3. Verification

- [ ] 3.1 The worker runs the gate lines in the lock's Verification, including
  every drift check, and the whole backend pytest once at the end, stating its
  wall time.
- [ ] 3.2 The coordinator runs `frontend/desk.browser.test.mjs` whole once on the
  integrated commit (the fixtures it serves move), with the selection in the lock
  for iteration; the desk ledger replay is unaffected and runs as the release
  requires.
