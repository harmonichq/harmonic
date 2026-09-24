# #451 implementation checklist

## 1. Served names and their generated parity (backend)

- [ ] 1.1 Serve a setting concern's `title` from `_SETTING_TITLES` in guidance's
  setting adapter, instead of the tuning lever's title. Leave unchanged:
  - `priority_inputs`;
  - `units`;
  - `_state`;
  - `_describe`;
  - `tuning_priority.py`.
- [ ] 1.2 Add `subject_title(subject)` to guidance. It resolves names by whole
  subject:
  - setting → `_SETTING_TITLES`;
  - habit → `levers.title` (through `_MEMBER_TITLES`);
  - Pattern → the outcome roster's name, through a public name lookup that
    `ciq_autotune/analyzers/scenario/outcome_patterns.py` adds over `_ROSTER`;
  - `investigation:uncaused_highs` → its title constant, shared with the
    investigation candidate;
  - anything else → null.

  Absent rows in `build_guidance` serve `title: subject_title(subject)`. No
  name enters `_state`.
- [ ] 1.3 `/api/plan/history` serves `subject_titles` beside `subjects` in every
  record's `decision_context`: a parallel list computed at read time through
  `subject_title`, never stored. Serve it in the endpoint (`api.py`), not in
  `with_plan_verdicts`, because guidance imports `watched_change`.
- [ ] 1.4 The findings projection titles setting findings by their user labels:
  `_title("Correction factor", …)` for the correction-factor row, and
  `_title(f"Carb ratio {label}", …)` for a carb-ratio block. Basal is unchanged.
  - Make the same two edits in `mockups/findings-projection.mirror.mjs`.
  - Regenerate `frontend/__fixtures__/findings-projection.json` with
    `uv run python scripts/gen_findings_projection_fixtures.py`.
  - Regenerate `mockups/diagnose-workstation.synthetic/finding-case-files.json`
    with `uv run python .claude/qa/gen_synthetic_fixtures.py
    mockups/diagnose-workstation.synthetic`. No other file in that directory may
    move; if one does, stop and report.
- [ ] 1.5 Update the QA finding-title literals in `scripts/qa_e2e_cases.py` by the
  AGENTS.md coverage-era process. For each case whose literal names "ISF" or
  "I:C", materialize the case, run `execute_case`, and copy the literal
  finding-title dump; never derive at assertion time. Then run each affected
  case's catalog-generated `test_case_<name>` test. The coordinator re-measures
  the QA budgets at integration.
- [ ] 1.6 Tests through the public reads, each failing first on the base:
  - `tests/test_guidance.py`, on the manufactured QA cases:
    - isf-strengthen and isf-held title `setting:isf` "Correction factor";
    - ic-lower and ic-held title `setting:carb_ratio` "Carb ratio";
    - basal-lower titles `setting:basal_rate` "Basal";
    - none is "ISF", "Carb ratio (I:C)" or "Basal profile";
    - each keeps its served `units`;
    - set-aside preferences the read no longer carries come back absent and
      titled: `setting:isf` "Correction factor", a habit its Lever's title, a
      Pattern its roster name;
    - `baseline_for` each candidate equals the baseline with names removed;
    - `test_pattern_baseline_contains_only_meaningful_comparison_state` stays as
      written.
  - `tests/test_durable_follow_up.py`: a Plan recorded from a correction-factor
    concern is read back from `/api/plan/history` with `subject_titles`
    ["Correction factor"] beside `subjects` ["setting:isf"], and its explanation
    records "Correction factor".
  - `tests/test_findings_projection.py`: the correction-factor row is titled
    "Correction factor …" and a carb-ratio block "Carb ratio <span> …". Existing
    lookups by the old titles move to the new ones.
- [ ] 1.7 Frontend tests that read the fixture's old titles move to the new
  ones:
  - `frontend/diagnose-findings-queue.test.js` (`title === 'ISF'`,
    `startsWith('I:C')`);
  - `frontend/findings-projection-mirror.test.js` (`row('ISF')`);
  - `frontend/guidance.test.js`'s setting stub carries the served label.

  These checks pass:
  - `uv run python scripts/gen_findings_projection_fixtures.py --check`;
  - `uv run python scripts/check_demo_fixtures.py`;
  - `uv run python mockups/harmonic-v2.exploration/generate.py --check`,
    regenerating any exploration output that moves and saying which;
  - `node mockups/diagnose-event-comparison.synthetic/generate.mjs --check`.

## 2. The desk prints names, values and states in the wearer's words (Changes and Diagnose)

- [ ] 2.1 Move `settingValue(parameter, value)` from `frontend/history.js` into
  `frontend/plan.js`, unchanged.
  - `history.js` and `follow-up.js` import it and delete their private copies
    and unit tables. They touch no Focus name or reason word (#449/#450).
  - `userValue` in `plan-view.js` and in `utilities.js` takes its
    correction-factor branch from it.
  - Its unit test moves to `frontend/plan.test.js`.
- [ ] 2.2 Changes' Action figure prints each carried setting instruction as
  `<direction> to <settingValue(parameter, recommended)>`, from the
  instruction's own `parameter`, never from the concern's `units`. Node tests in
  `frontend/changes.test.js`, each failing first on the base:
  - a Pattern carrying a correction-factor instruction reads "strengthen to
    1 U : 32 mg/dL";
  - one carrying a carb-ratio instruction reads "lower to 9 g/U";
  - a setting concern served with `title` "Correction factor" shows "Correction
    factor" and neither "ISF" nor "mg/dL/U" in its frame;
  - set-aside rows served with names print the names, not the subjects.
- [ ] 2.3 `frontend/guidance.js` gains the disposition words (design.md table),
  and Changes' nameplate and Action heading print them, never the code. A code
  outside the table prints no words. Node test in `frontend/changes.test.js`
  through the Changes mount, failing first on the base: under
  `eligible_action` and `guided_investigation` the frame shows "Ready to stage"
  and "Evidence to inspect", and no disposition code appears in its text.
- [ ] 2.4 The Plan's "What was known" prints each recorded subject by its served
  name (`subject_titles`), never an identifier; a subject with no served name
  prints nothing. It prints each recorded setting through `settingValue`, using
  the parameter of the recorded action row it was captured from, and prints the
  recorded explanation as recorded. Node test in `frontend/plan-view.test.js`,
  failing first on the base: a recorded correction-factor context (`subjects`
  ["setting:isf"], `subject_titles` ["Correction factor"], `settings` value 32
  unit "mg/dL/U", `action` parameter "isf") prints "Correction factor" and "1 U
  : 32 mg/dL", and neither "setting:" nor "mg/dL/U".
- [ ] 2.5 Diagnose's findings queue prints an asserting correction-factor row's
  numbers through `settingValue`, keeping the queue's own rounding: "now 1 U :
  30.0 mg/dL → " and "1 U : 32.0 mg/dL". Carb-ratio and basal numbers are
  unchanged, and the queue's `UNIT` table loses its correction-factor entry.
  Node test in `frontend/diagnose-findings-queue.test.js`, failing first on the
  base.
- [ ] 2.6 The correction-factor panel prints its current, estimate, recommended
  and interval values as "1 U : <value> mg/dL", keeping its own rounding, with
  no unit in its qualifiers. Its heading, breadcrumb leaf (`crumbLabel`) and
  scope sentence say "Correction factor" instead of "ISF". The carb-ratio and
  basal panels are unchanged. Node test through `renderIsfLevel` in
  `frontend/diagnose-workstation.test.js`, failing first on the base: the
  rendered text contains "Correction factor" and "1 U : ", and neither "ISF" nor
  "mg/dL/U".
- [ ] 2.7 Delete the `#status-src` and `#status-clock` writes in
  `frontend/diagnose-workstation.js`. No shipped markup declares either id, and
  a whole-tree `git grep` finds only these writes.

## 3. The watch dock names a setting change in the wearer's words

- [ ] 3.1 The watch dock's Trial title names the setting through the desk's
  `SETTING_NAME` (Correction factor, Carb ratio, Basal, Target; a whole profile
  keeps its own word). It prints a correction-factor value through
  `settingValue`, and its own name and unit tables lose the ISF, I:C and
  mg/dL/U entries. Node tests in `frontend/watched-change-dock.test.js`, failing
  first on the base:
  - a correction-factor Trial reads "Correction factor · 1 U : 30.0 mg/dL →
    1 U : 32.0 mg/dL";
  - a carb-ratio Trial reads "Carb ratio · 5.0 → 4.8 g/U";
  - neither contains "ISF", "I:C" or "mg/dL/U".
- [ ] 3.2 Diagnose's staged title (`stagedDescriptor`) keeps its current rounding
  and reads:
  - "Correction factor · 1 U : <current> mg/dL → 1 U : <recommended> mg/dL" for
    a staged correction factor;
  - "Carb ratio <span> · <current> → <recommended> g/U" for a staged carb-ratio
    block.

  Proven by S178.

## 4. Ledger amendment and replay

- [ ] 4.1 Add `## #451 amendment — 2026-09-23` at the end of
  `mockups/harmonic-v2-desktop.behavior.md`. It carries:
  - the sanction line: Q3 delegation, Connor Griffin, 2026-09-23 ("figure it
    out yourself from here"); coordinator ruling R451 as corrected and the
    coordinator's widening of #451;
  - new story blocks S177, S178 and S179 (element, source, lock, data, evidence,
    status);
  - the handler inventory rows for the lines they read.

  No `★ FROZEN` block, header inventory line or earlier story is edited.
- [ ] 4.2 Write the three stories in `frontend/c4.replay.mjs` (`C4_STORIES`).
  Register them in `frontend/desk-behavior.replay.mjs` (export and `REGISTRY`)
  and map each to case store isf-strengthen in `frontend/replay-cases.mjs`
  (`STORY_CASES`). Each story reads served values from its own reads, never a
  literal number.
  - S177: on a plain arrival at Changes, the Action figure equals `<direction>
    to 1 U : <recommended> mg/dL` for the served selection's first instruction.
    The nameplate and Action heading print the disposition's words. The Changes
    desk text contains no "mg/dL/U", "ISF" or disposition code.
  - S178, on Diagnose:
    - the correction-factor queue row is titled "Correction factor · <served
      direction>";
    - its numbers and its panel's values read "1 U : <value> mg/dL";
    - the panel's heading says "Correction factor";
    - staging the value seats the dock's staged title "Correction factor · 1 U
      : <current> mg/dL → 1 U : <recommended> mg/dL";
    - the Diagnose desk text contains neither "mg/dL/U" nor "ISF".
  - S179: after staging the correction factor and recording the Plan, Changes'
    "What was known" names the subject "Correction factor" with no `setting:`
    text. It prints the change "1 U : <recommended> mg/dL" and the explanation
    "Correction factor".
- [ ] 4.3 Add S177 to `SMOKE_STORIES` in
  `mockups/sweep/harmonic-v2-desktop/acceptance.py`, so the smoke slice covers
  isf-strengthen. In `acceptance.test.py`, move the slice's length checks to 25
  and re-pin its digest. Move the ledger inventory literals to issued 174 /
  active 155 / retired 19, and move every registry count the port-free tests pin
  by the three added stories.
- [ ] 4.4 Run the port-free checks:
  - `python3 mockups/sweep/harmonic-v2-desktop/acceptance.py inventory --out
    <scratch>`, which reports issued 174 / active 155 / retired 19;
  - `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py
    ReplayPlanTest InventoryProofTest SmokeSelectionTest`.

  Hand the coordinator the port-bound commands: `ONLY=S177,S178,S179` on the
  desk replay at both sizes, expected to fail on base b03431d2 and pass on the
  branch.
