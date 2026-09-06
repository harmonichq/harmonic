# Tasks — The case file names the selected Occurrence's comparison cohort (#376)

- [x] 1. In `ciq_autotune/finding_case_file.py`, make the event projection's own
  cohort membership the single source of the selected Occurrence's cohort.
  Inside `Preparation.case`, where `active_ids` is built for
  `alignment == "event"`, build instead one mapping from occurrence id to the
  `key` of the cohort in `projection["cohorts"]` whose `occurrence_ids` contains
  it, and keep `active_ids` as that mapping's key set so admission is unchanged.
  Stamp `comparison_cohort` from that mapping onto the `selection.detail` of
  every event-aligned `"selected"` selection — both the roster-member branch and
  the announced-comparison branch. Leave clock alignment untouched: it publishes
  no cohorts and its detail keeps no pointer. Then delete the two per-lever
  derivations this replaces — `_missed_detail`'s `cohort` parameter and the
  `"comparison_cohort"` literal in `_announced_detail` — so the field has exactly
  one producer. The stamped value must be identical to today's for Missed /
  unannounced meal: a claimed member is the `matched` cohort's, a near-miss
  member the `nearly_matched` cohort's, and an `m_`-prefixed announced bolus the
  `comparison` cohort's.

- [x] 2. Pin the stamped pointer in `tests/test_finding_case_file.py`, through
  `Preparation.case`. Extend
  `test_factor_specific_event_horizons_and_far_pair_selected_evidence` so the
  expected detail key set includes `comparison_cohort` for every lever, not for
  Missed / unannounced meal alone, and add a test that asserts, for each lever,
  that the stamped `comparison_cohort` names the cohort in
  `case["projection"]["cohorts"]` whose `occurrence_ids` contains
  `detail["id"]`, and that the clock-aligned detail for the same Occurrence
  carries no `comparison_cohort`. Run the new assertions against the unmodified
  module first and record that they fail on the missing key.

  Then pin the same pointer once through the public interface, in
  `tests/test_finding_case_file_api.py`. Today's selected-response check for
  `finding:over_treated_low` compares `selection["detail"]` to itself and so pins
  no field, and the file's only real pointer assertion covers
  `finding:missed_meal` — the one lever that already works. Add exactly one
  assertion to the `over_treated_low` block: the served
  `detail["comparison_cohort"]` equals the `key` of the cohort in that same
  response's `projection["cohorts"]` whose `occurrence_ids` contains
  `detail["id"]`. Change nothing else in that file, and run it against the
  unmodified tree first to see it fail on the absent key.

- [x] 3. In `frontend/finding-case-file-validation.js`, extend
  `validFindingCaseFile` so a case file whose `projection.alignment` is `event`
  and whose `selection.state` is `selected` is valid only when
  `selection.detail.comparison_cohort` is a string naming a cohort in
  `projection.cohorts` whose `occurrence_ids` contains `selection.detail.id`.
  Keep the existing Missed / unannounced meal clauses as they are. This is the
  boundary that makes the renderer's absent-cohort branch unreachable, so add no
  fallback to `renderCaseSelection` or to the keydown handler in
  `frontend/diagnose-workstation.js` and no cohort re-derivation to
  `frontend/diagnose-event-comparison.js`. Pin the rejection in
  `frontend/finding-case-file-validation.test.js` with a case file whose
  event-aligned selected detail has the pointer deleted, and one whose pointer
  names a cohort that does not contain the selected id.

- [x] 4. Regenerate the committed Diagnose capture from the corrected projection
  with `uv run python .claude/qa/gen_synthetic_fixtures.py
  mockups/diagnose-workstation.synthetic` and commit the changed
  `mockups/diagnose-workstation.synthetic/finding-case-files.json`. Add an
  assertion in `frontend/finding-case-files.fixture.test.js` that every
  `selected_event` case in that capture carries a `comparison_cohort` naming the
  cohort whose `occurrence_ids` contains the selected id, and that every
  `selected_clock` case carries none.

- [x] 5. Iterate the order's verification chain until it matches the stated
  expectation — the full six-command fast gate from `AGENTS.md`, then
  `scripts/check_demo_fixtures.py`, then the browser legs. Where this session can
  launch Chromium, run all four: the three that read the regenerated capture —
  `frontend/cockpit-shell.browser.test.mjs`,
  `frontend/diagnose-event-comparison-behavior.replay.mjs` and
  `frontend/diagnose-workstation-behavior.replay.mjs` (which needs the app served
  by `AGENTS.md`'s copy-then-serve of `mockups/qa-e2e.synthetic/harmonic.sqlite`
  with `--no-fetch --token ''`) — plus
  `mockups/diagnose-event-comparison-support-audit.mjs`, each through the exact
  command in `AGENTS.md`. The frozen behaviour ledger is this surface's
  contract and is not in this change's expected diff: if a story moves under the
  regenerated capture, stop and report which story and what it now sees, rather
  than editing the ledger or the replay. From a sandboxed session Chromium cannot
  launch at all; report that per `AGENTS.md` rather than diagnosing it or editing
  code to chase it.
