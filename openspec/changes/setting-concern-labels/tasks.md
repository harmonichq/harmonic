# #451 implementation checklist

## 1. Served setting-concern titles (backend)

- [ ] 1.1 Serve a setting concern's `title` from `_SETTING_TITLES` in guidance's
  setting adapter, instead of the tuning lever's title. Serve the same label on
  an absent row whose subject is a setting subject, looked up by the whole
  subject in `_MEMBER_TITLES`. Leave absent habit and Pattern rows at
  `title: null`. Leave unchanged:
  - `priority_inputs`;
  - `units`;
  - `_state`;
  - `_describe`;
  - `tuning_priority.py`.
- [ ] 1.2 Add a public-interface test in `tests/test_guidance.py`, failing first
  on the base. For the manufactured QA cases isf-strengthen and isf-held, the
  `setting:isf` concern's `title` is "Correction factor". For ic-lower and
  ic-held, `setting:carb_ratio`'s is "Carb ratio". For basal-lower,
  `setting:basal_rate`'s is "Basal". None of them is "ISF", "Carb ratio (I:C)"
  or "Basal profile", and each keeps its served `units`.
  - A set-aside `setting:isf` preference over basal-lower comes back absent,
    titled "Correction factor", and still set aside.
  - `baseline_for` each candidate equals the baseline of the same candidate
    with `title` removed.
  - `test_pattern_baseline_contains_only_meaningful_comparison_state` stays as
    written.
- [ ] 1.3 Keep generated artifacts in step.
  - `uv run python scripts/gen_findings_projection_fixtures.py --check` and
    `uv run python mockups/harmonic-v2.exploration/generate.py --check` pass.
    Regenerate any exploration output that moves, with its generator, and say
    which moved.
  - `frontend/guidance.test.js`'s setting stub carries the served label.

## 2. Setting values in the wearer's words (Changes and Diagnose)

- [ ] 2.1 Move `settingValue(parameter, value)` from `frontend/history.js` into
  `frontend/plan.js`, unchanged.
  - `history.js` and `follow-up.js` import it and delete their private copies
    and unit tables.
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
  - a setting concern served with `title` "Correction factor" and
    correction-factor instructions shows "Correction factor" and neither "ISF"
    nor "mg/dL/U" anywhere in its frame;
  - a set-aside setting row served with its label prints the label, not the
    subject.
- [ ] 2.3 The Plan's "What was known" prints each recorded setting through
  `settingValue`, using the parameter of the recorded action row it was
  captured from, and prints the recorded explanation as recorded. Node test in
  `frontend/plan-view.test.js`, failing first on the base: a recorded
  correction-factor context (`settings` value 32, unit "mg/dL/U"; `action`
  parameter "isf") prints "1 U : 32 mg/dL" and no "mg/dL/U".
- [ ] 2.4 Diagnose's findings queue prints an asserting correction-factor row's
  numbers through `settingValue`, keeping the queue's own rounding: "now 1 U :
  30.0 mg/dL → " and "1 U : 32.0 mg/dL". Carb-ratio and basal numbers are
  unchanged. The queue's `UNIT` table loses its correction-factor entry. Node
  test in `frontend/diagnose-findings-queue.test.js`, failing first on the base;
  the existing carb-ratio assertion stays as written.
- [ ] 2.5 The correction-factor inspector prints its current, estimate,
  recommended and interval values as "1 U : <value> mg/dL", keeping its own
  rounding. Its qualifiers no longer carry a unit. The carb-ratio and basal
  inspectors are unchanged. Node test through `renderIsfLevel` in
  `frontend/diagnose-workstation.test.js`, failing first on the base: the
  rendered text contains "1 U : " and no "mg/dL/U".

## 3. The watch dock names a setting change in the wearer's words

- [ ] 3.1 The watched-change dock's Trial title names the setting through the
  desk's `SETTING_NAME` (Correction factor, Carb ratio, Basal, Target; a whole
  profile keeps its own word). It prints a correction-factor value through
  `settingValue`, and its own name table and unit table lose the ISF, I:C and
  mg/dL/U entries. Node tests in `frontend/watched-change-dock.test.js`, failing
  first on the base:
  - a correction-factor Trial reads "Correction factor · 1 U : 30.0 mg/dL →
    1 U : 32.0 mg/dL";
  - a carb-ratio Trial reads "Carb ratio · 5.0 → 4.8 g/U";
  - neither contains "ISF", "I:C" or "mg/dL/U".
- [ ] 3.2 Diagnose's staged title (`stagedDescriptor`) keeps its current
  rounding and reads:
  - "Correction factor · 1 U : <current> mg/dL → 1 U : <recommended> mg/dL"
    for a staged correction factor;
  - "Carb ratio <span> · <current> → <recommended> g/U" for a staged carb-ratio
    block.

  Proven by S178.

## 4. Ledger amendment and replay

- [ ] 4.1 Add `## #451 amendment — 2026-09-23` at the end of
  `mockups/harmonic-v2-desktop.behavior.md`. It carries:
  - the sanction line: Q3 delegation, Connor Griffin, 2026-09-23 ("figure it
    out yourself from here"); coordinator ruling R451;
  - new story blocks S177, S178 and S179 (element, source, lock, data, evidence,
    status);
  - the handler inventory rows for the lines they read.

  No `★ FROZEN` block, header inventory line or earlier story is edited.
- [ ] 4.2 Write the three stories in `frontend/c4.replay.mjs` (`C4_STORIES`).
  Register them in `frontend/desk-behavior.replay.mjs` (export and `REGISTRY`)
  and map each to case store isf-strengthen in `frontend/replay-cases.mjs`
  (`STORY_CASES`). Each story reads the served values from its own reads, never
  a literal number.
  - S177: on a plain arrival at Changes, the Action figure equals `<direction>
    to 1 U : <recommended> mg/dL` for the served selection's first instruction,
    and the Changes desk text contains neither "mg/dL/U" nor "ISF".
  - S178: on Diagnose, the correction-factor queue row's numbers and its
    inspector's values read "1 U : <value> mg/dL".
    - Staging the value seats the dock's staged title "Correction factor · 1 U
      : <current> mg/dL → 1 U : <recommended> mg/dL".
    - None of those lines contains "mg/dL/U" or "ISF ·".
  - S179: after staging the correction factor and recording the Plan, Changes'
    "What was known" prints "1 U : <recommended> mg/dL" and the explanation
    "Correction factor".
- [ ] 4.3 Add S177 to `SMOKE_STORIES` in
  `mockups/sweep/harmonic-v2-desktop/acceptance.py`, so the smoke slice covers
  case store isf-strengthen. In `acceptance.test.py`, move the slice's length
  checks to 25 and re-pin its digest. Move the ledger inventory literals to
  issued 174 / active 155 / retired 19, and move every registry count the port-free tests pin by
  the three added stories.
- [ ] 4.4 Run the port-free checks:
  - `python3 mockups/sweep/harmonic-v2-desktop/acceptance.py inventory --out
    <scratch>`, which reports issued 174 / active 155 / retired 19;
  - `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py
    ReplayPlanTest InventoryProofTest SmokeSelectionTest`.

  Hand the coordinator the port-bound commands: `ONLY=S177,S178,S179` on the
  desk replay at both sizes, expected to fail on base b03431d2 and pass on the
  branch.
