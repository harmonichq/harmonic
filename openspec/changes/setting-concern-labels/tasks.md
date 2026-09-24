# #451 implementation checklist

## 1. Analyzer and projection wording, with their generated parity

- [x] 1.1 Reword every served carb-ratio sentence in
  `ciq_autotune/analyzers/ic.py` to the wording design.md's carb-ratio ADR
  tables: "carb ratio" for "I:C", no prose em dash, and "identifiable meals"
  for "clean-start". This covers:
  - `_recommend`'s reasons and annotations;
  - `_START_HIGH_XREF`;
  - the hold intros, exit texts and close;
  - the block owner prefix;
  - `_block_annotation`'s states;
  - `_history_annotation` ("(range …)" for "(CI …)");
  - the carb-counting, meals-start-high and post-meal-correction-burden
    Findings' summaries and occurrence details.

  Meaning and every served number are unchanged. Leave comments, docstrings and
  error messages.
- [x] 1.2 Extend `tests/test_annotation_register.py` with a carb-ratio catalog
  built through the analyzer's own functions:
  - every `_recommend` branch;
  - each hold variant, with and without the start-high cross-reference;
  - the block owner prefix;
  - each `_block_annotation` state and hold reason;
  - the history annotation;
  - the three Findings' summaries and occurrence details.

  Add `(re.compile(r"\bI:C\b"), 'user-facing "I:C"')` to `BANNED` beside its
  "ISF" rule. Check each sentence against the full `BANNED` list, as the basal
  and correction-strength tests do. It guards a changed behavior, so it fails
  first on the base.
- [x] 1.3 In `ciq_autotune/findings_projection.py`, title the correction-factor
  row `_title("Correction factor", …)` and a carb-ratio block
  `_title(f"Carb ratio {label}", …)`; basal is unchanged. Make the same two edits
  in `mockups/findings-projection.mirror.mjs`.
- [x] 1.4 Regenerate every generated copy with its generator:
  - `frontend/__fixtures__/findings-projection.json`
    (`uv run python scripts/gen_findings_projection_fixtures.py`);
  - `frontend/__fixtures__/analysis.json`
    (`uv run python scripts/gen_chart_builder_fixtures.py`);
  - `mockups/diagnose-workstation.synthetic/ic-history-events.capture.json`
    (`uv run python scripts/gen_ic_history_event_fixtures.py`);
  - `mockups/diagnose-workstation.synthetic/finding-case-files.json`, after
    retitling exactly the two hand-written literals `'I:C Evening'` →
    `'Carb ratio Evening'` and `'ISF'` → `'Correction factor'` in
    `.claude/qa/gen_synthetic_fixtures.py`
    (`uv run python .claude/qa/gen_synthetic_fixtures.py
    mockups/diagnose-workstation.synthetic`). Touch nothing else in that
    generator (#454 edits it too). No other file in that directory may move;
    if one does, stop and report.
- [x] 1.5 Re-dump the QA literals in `scripts/qa_e2e_cases.py` by the AGENTS.md
  coverage-era process: materialize each affected case, run `execute_case`, and
  copy the literal dump; never derive at assertion time. The affected literals
  on b03431d2 are:
  - the four current-setting carb-ratio queue-row headlines that quote the
    reworded annotations;
  - the six finding-title literals naming "ISF" or "I:C".

  Re-dump the pinned carb-ratio sentences in `tests/test_analyzer_ic.py` the
  same way: the "direction needs more identifiable meals", "clean-start" and
  "When Carb ratio was … (CI …)" assertions. `tests/test_result.py`'s "(CI …)"
  string is a hand-set serialization input, not analyzer output; leave it. Run each affected case's
  `test_case_<name>` in `tests/test_qa_e2e_cases.py`. The coordinator
  re-measures the QA budgets at integration.
- [x] 1.6 Tests and checks.
  - `tests/test_findings_projection.py`: the correction-factor row is titled
    "Correction factor …" and a carb-ratio block "Carb ratio <span> …"; the
    lookups and headline literals that quoted the old titles or sentences move
    to the new ones.
  - `frontend/diagnose-findings-queue.test.js` (`title === 'ISF'`,
    `startsWith('I:C')`) and `frontend/findings-projection-mirror.test.js`
    (`row('ISF')`) read the new titles.
  - These checks pass: `gen_findings_projection_fixtures.py --check`,
    `gen_chart_builder_fixtures.py --check`,
    `gen_ic_history_event_fixtures.py --check`, `check_demo_fixtures.py`, the
    exploration `generate.py --check` (regenerate any exploration output that
    moves and say which) and the event-comparison `generate.mjs --check`.

## 2. Served names on guidance and the Plan history read

- [ ] 2.1 Serve a setting concern's `title` from `_SETTING_TITLES` in guidance's
  setting adapter, instead of the tuning lever's title. Leave unchanged:
  - `priority_inputs`;
  - `units`;
  - `_state`;
  - `_describe`;
  - `tuning_priority.py`.
- [ ] 2.2 Add `subject_title(subject)` to guidance. It resolves names by whole
  subject:
  - setting → `_SETTING_TITLES`;
  - habit → `levers.title` (through `_MEMBER_TITLES`);
  - `investigation:uncaused_highs` → its title constant, shared with the
    investigation candidate;
  - anything else → null. A Pattern needs no branch: the roster always serves
    every Pattern present.

  Absent rows in `build_guidance` serve `title: subject_title(subject)`. No
  name enters `_state`.
- [ ] 2.3 `/api/plan/history` serves `subject_titles` beside `subjects` in every
  record's `decision_context`: a parallel list computed at read time through
  `subject_title`, never stored. Serve it in the endpoint (`api.py`), not in
  `with_plan_verdicts`, because guidance imports `watched_change`.
- [ ] 2.4 Tests through the public reads. The name tests are for changed
  behavior and fail first on the base; the invariance assertions are regression
  tests.
  - `tests/test_guidance.py`, on the manufactured QA cases:
    - isf-strengthen and isf-held title `setting:isf` "Correction factor";
    - ic-lower and ic-held title `setting:carb_ratio` "Carb ratio";
    - basal-lower titles `setting:basal_rate` "Basal";
    - none is "ISF", "Carb ratio (I:C)" or "Basal profile", and each keeps its
      served `units`;
    - set-aside preferences for a setting, a roster-owned habit and the
      uncaused-highs investigation that the read no longer carries come back
      absent and titled by their name sources, still set aside;
    - a set-aside Pattern preference is served present with its roster title;
    - `baseline_for` each candidate equals the baseline with names removed;
    - `test_pattern_baseline_contains_only_meaningful_comparison_state` stays as
      written.
  - `tests/test_durable_follow_up.py`: a Plan recorded from a correction-factor
    concern reads back from `/api/plan/history` with `subject_titles`
    ["Correction factor"] beside `subjects` ["setting:isf"], and its explanation
    records "Correction factor".
  - `frontend/guidance.test.js`'s setting stub carries the served label.

## 3. The Changes and Diagnose lines in the wearer's words

- [ ] 3.1 Move `settingValue(parameter, value)` from `frontend/history.js` into
  `frontend/plan.js`, unchanged.
  - `history.js` and `follow-up.js` import it and delete their private copies
    and unit tables. They touch no Focus name or reason word (#449/#450).
  - `userValue` in `plan-view.js` and in `utilities.js` takes its
    correction-factor branch from it.
  - Its unit test moves to `frontend/plan.test.js`.
- [ ] 3.2 Changes' Action figure prints each carried setting instruction as
  `<direction> to <settingValue(parameter, recommended)>`, from the
  instruction's own `parameter`, never from the concern's `units`. Node tests in
  `frontend/changes.test.js`, failing first on the base:
  - a Pattern carrying a correction-factor instruction reads "strengthen to
    1 U : 32 mg/dL";
  - one carrying a carb-ratio instruction reads "lower to 9 g/U";
  - a setting concern served with `title` "Correction factor" shows "Correction
    factor" and neither "ISF" nor "mg/dL/U".
- [ ] 3.3 `frontend/guidance.js` gains the status words (design.md table). They
  are chosen from the served disposition and, under `eligible_action`, from the
  served action's shape. For an identified action they also depend on whether
  Changes passes a served Focus offer (`focusOffer(subject)`), and on the
  Pattern's served readiness verdict. Changes' nameplate and Action heading
  print them, never the code, and a code outside the table prints no words.
  Node tests in `frontend/changes.test.js` through the Changes mount, failing
  first on the base:
  - a setting-led `eligible_action` read shows "Ready to stage";
  - an identified action with a served Focus offer shows "Ready to start a
    Focus";
  - a withheld Pattern (behavioral-carb-undercount shape: identified action,
    readiness verdict `withheld`, no offer) shows "Focus withheld";
  - a legacy habit lead (behavioral-missed-meal shape: habit, identified action,
    no offer) shows "Action identified";
  - a `guided_investigation` read shows "Evidence to inspect";
  - no disposition code appears in any frame's text.
- [ ] 3.4 Changes' set-aside rows print each row's served name. A row with no
  name prints "A concern no longer in this read", never the subject. Add a
  **Concern** entry to `CONTEXT.md`: one candidate Changes can lead with (a
  setting, a habit, a Pattern or an investigation) as guidance serves it; avoid
  "candidate" and "subject" in user copy. Node test in
  `frontend/changes.test.js`, failing first on the base: named rows print their
  names, an unnamed row prints the phrase, and no `setting:`, `habit:` or
  `pattern:` text appears.
- [ ] 3.5 The Plan's "What was known" names each recorded subject by its served
  name (`subject_titles`) and never prints an identifier; a subject with no
  served name prints nothing. It prints each recorded setting through
  `settingValue`, using the parameter of the recorded action row it was
  captured from, and prints the recorded explanation as recorded. Node test in
  `frontend/plan-view.test.js`, failing first on the base: a recorded
  correction-factor context (`subjects` ["setting:isf"], `subject_titles`
  ["Correction factor"], `settings` value 32 unit "mg/dL/U", `action` parameter
  "isf") prints "Correction factor" and "1 U : 32 mg/dL", and neither "setting:"
  nor "mg/dL/U".
- [ ] 3.6 Diagnose's findings queue prints an asserting correction-factor row's
  numbers through `settingValue`, keeping the queue's own rounding: "now 1 U :
  30.0 mg/dL → " and "1 U : 32.0 mg/dL". Carb-ratio and basal numbers are
  unchanged, and the queue's `UNIT` table loses its correction-factor entry.
  Node test in `frontend/diagnose-findings-queue.test.js`, failing first on the
  base.
- [ ] 3.7 The correction-factor panel prints its current, estimate, recommended
  and interval values as "1 U : <value> mg/dL", keeping its own rounding, with
  no unit in its qualifiers. Its heading, breadcrumb leaf (`crumbLabel`) and
  scope sentence say "Correction factor". The peak-hour link names a "carb ratio
  block" instead of an "I:C block". The carb-ratio and basal panels are
  otherwise unchanged. Node test through `renderIsfLevel` in
  `frontend/diagnose-workstation.test.js`, failing first on the base: the
  rendered text contains "Correction factor" and "1 U : ", and neither "ISF" nor
  "mg/dL/U".
- [ ] 3.8 Delete the `#status-src` and `#status-clock` writes in
  `frontend/diagnose-workstation.js`. No shipped markup declares either id, and
  a whole-tree `git grep` finds only these writes.
- [ ] 3.9 Coordinator-authorized after sub-order 1's chunk review (Q3
  delegation, Connor Griffin, 2026-09-23; coordinator ruling R451): the Plan's
  pump-mismatch diff labels its parameters from `PARAM_LABEL` in
  `frontend/plan.js`, which reads "ISF (mg/dL/U)" and "I:C (g/U)". It takes the
  user labels and `CONTEXT.md`'s unit forms: the correction factor names
  "Correction factor" with its insulin-first form, and the carb ratio names
  "Carb ratio" with "g/U". Touch only `PARAM_LABEL` and its readers: #453,
  already on the release trunk, reduced `reconcileDeliverable` in the same
  file. A node test through the mismatch rows' public reader fails first on the
  base.

## 4. The watch dock's title names the change; its values wrap below

- [ ] 4.1 `watchDockView` (`frontend/watched-change-dock.js`) builds the Trial
  title from the setting's name, through the desk's `SETTING_NAME` (a whole
  profile keeps its own word), plus its slot. A Trial serves no direction, and
  the dock derives none. The from→to values in their user form, through
  `settingValue` for a correction factor, lead the wrapping detail line. The
  dock's own name and unit tables lose the ISF, I:C and mg/dL/U entries. Node
  tests in `frontend/watched-change-dock.test.js`, failing first on the base:
  - a correction-factor Trial's title is "Correction factor" and its detail
    carries "1 U : 30.0 mg/dL → 1 U : 32.0 mg/dL";
  - a carb-ratio Trial's title is "Carb ratio" and its detail carries "5.0 →
    4.8 g/U";
  - neither title nor detail contains "ISF", "I:C" or "mg/dL/U".
- [ ] 4.2 Diagnose's staged descriptor (`stagedDescriptor`) serves the dock a
  title and a separate values part, and the dock's staged detail leads with the
  values before its existing sentence.
  - Titles:
    - "Correction factor · <served direction>";
    - "Carb ratio <span>" (a carb-ratio block serves no direction);
    - "Basal <span> · <served direction>" when every staged half hour carries
      that served direction, otherwise "Basal <span>".
  - Values keep the current `u()` rounding: "1 U : <current> mg/dL → 1 U :
    <recommended> mg/dL", "<current> → <recommended> g/U", and the basal pair
    where every staged half hour agrees.
  - Proven by S178, which runs at both sizes.

## 5. Ledger amendment and replay

- [ ] 5.1 Add `## #451 amendment — 2026-09-23` at the end of
  `mockups/harmonic-v2-desktop.behavior.md`. It carries:
  - the sanction line: Q3 delegation, Connor Griffin, 2026-09-23 ("figure it
    out yourself from here"); coordinator ruling R451 as corrected, the
    coordinator's widening of #451, and its plan-review rulings;
  - new story blocks S177, S178 and S179 (element, source, lock, data, evidence,
    status);
  - the handler inventory rows for the lines they read.

  No `★ FROZEN` block, header inventory line or earlier story is edited.
- [ ] 5.2 Write the three stories in `frontend/c4.replay.mjs` (`C4_STORIES`).
  Register them in `frontend/desk-behavior.replay.mjs` (export and `REGISTRY`)
  and map each to case store isf-strengthen in `frontend/replay-cases.mjs`
  (`STORY_CASES`). Each story reads served values from its own reads, never a
  literal number.
  - S177: on a plain arrival at Changes, the Action figure equals `<direction>
    to 1 U : <recommended> mg/dL` for the served selection's first instruction.
    The nameplate and Action heading print the status words for the served
    disposition and action shape. The Changes desk text contains no "mg/dL/U",
    "ISF" or disposition code.
  - S178, on Diagnose:
    - the correction-factor queue row is titled "Correction factor · <served
      direction>", and its numbers and its panel's values read "1 U : <value>
      mg/dL";
    - the panel's heading says "Correction factor";
    - staging the value seats the dock's staged title "Correction factor ·
      <served direction>" with `scrollWidth <= clientWidth` (no truncation);
    - its detail line shows "1 U : <current> mg/dL → 1 U : <recommended> mg/dL"
      fully visible;
    - the Diagnose desk text contains neither "mg/dL/U" nor "ISF".
  - S179: after staging the correction factor and recording the Plan, Changes'
    "What was known" names the subject "Correction factor" with no `setting:`
    text. It prints the change "1 U : <recommended> mg/dL" and the explanation
    "Correction factor".
- [ ] 5.3 Add S177 to `SMOKE_STORIES` in
  `mockups/sweep/harmonic-v2-desktop/acceptance.py`, so the smoke slice covers
  isf-strengthen. In `acceptance.test.py`, move the slice's length checks to 25
  and re-pin its digest. Move the ledger inventory literals to issued 174 /
  active 155 / retired 19, and move every registry count the port-free tests pin
  by the three added stories.
- [ ] 5.4 Run the port-free checks:
  - `python3 mockups/sweep/harmonic-v2-desktop/acceptance.py inventory --out
    <scratch>`, which reports issued 174 / active 155 / retired 19;
  - `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py
    ReplayPlanTest InventoryProofTest SmokeSelectionTest`.

  Hand the coordinator the port-bound commands: `ONLY=S177,S178,S179` on the
  desk replay at both sizes, expected to fail on base b03431d2 and pass on the
  branch.
