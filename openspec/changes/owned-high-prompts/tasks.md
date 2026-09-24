# #448 implementation checklist

## 1. Failing-first tests (through the public interface)

- [ ] 1.1 In `tests/test_pending_prompts.py`, add owned-High tests through
  `build_candidates`, built from synthetic days with no hand-set Lever, verdict or
  flag. (a) A sub-70 low (55 mg/dL) rebounds, with no bolus, into a High whose
  250 mg/dL crossing comes more than 90 minutes after the nadir. Vary the crossing
  across cases, for example about 110 and 150 minutes after the nadir. Assert
  exactly one low prompt, at the nadir, and no missed-meal prompt. (b) A 72 mg/dL
  near-low rebounds into a High, once with the crossing within 90 minutes of the
  nadir and once past it. Assert no prompt at all. The evidence block in
  `design.md` gives shapes that reproduce all four on the base. Run each on the base
  first and record that it fails for the right reason: a missed-meal prompt at the
  High onset.
- [ ] 1.2 Add the controls on the same shapes. (a) An unbolused rise with no low
  before it still raises its missed-meal prompt. (b) A High whose run begins after
  a sub-70 low's rebound has settled in range for at least 30 minutes still raises
  its missed-meal prompt. (c) The 1.1(a) shape with `low_answers` holding a `no`
  answer at the nadir raises the missed-meal prompt at the High onset. The same
  shape with a `not-sure` answer, and again with a `carbs` answer, raises none.
  (a) and (b) keep the base's output. (c) is new behavior through the new
  keyword.
- [ ] 1.3 Add a store-facing test through `build_pending_prompts`, on an in-memory
  store holding the 1.1(a) shape. The queue serves the low prompt and no missed-meal
  prompt. Record a low-prompt `no` at the nadir with `answered_at` at or before the
  store's latest reading, and the missed-meal prompt appears at the High onset. A
  `no` stamped after the latest reading does not restore it, because the Scenario
  does not know that answer yet either (#467). The store's default stamp is wall
  clock, which is after any synthetic reading. The first assertion fails on the
  base.
- [ ] 1.4 Add a gate-configuration test through each classifier's public call, in
  `tests/test_classifier_late_bolus.py` and `tests/test_classifier_carb_undercount.py`.
  (a) A from-flat pre-bolus rise with a 60 mg/dL reading 100 minutes before the
  meal bolus matches under the default configuration. Under
  `ScenarioConfig(gate_lookback_min=120.0)` it does not match, with silence
  reason `upstream_cause`. (b) The same holds for a 74 mg/dL reading 60 minutes
  before the bolus under `ScenarioConfig(gate_low_mgdl=75.0)`. The carb-undercount
  meal carries an ISF and a Dose-stamped carb ratio so its judgment reaches the gate.
  The `design.md` evidence block gives shapes for both. Each fails on the base,
  where the configured verdict still matches.

## 2. Implementation

- [ ] 2.1 In `ciq_autotune/pending_prompts.py`, give `build_candidates` a keyword
  `low_answers` (default empty). Run the shared evaluation walk (`evaluate`) once
  over its events, under the same scenario configuration and those answers, with
  the walk's default classifier context. Collect every High anchor that any
  Episode's attribution lists in `owned_highs`. A High anchor in that set raises no
  missed-meal prompt, whatever the classifier returns. Every other High keeps
  today's `classify_missed_meal` call, and the low prompts are unchanged. Nothing
  here judges a low or a rebound. `build_pending_prompts` passes
  `low_prompt_answers(store, start, now)`, the helper `build_scenarios` uses. Pass
  no ISF and drop no false-low readings (ADR 448 Decision 1). Update the module
  docstring's candidate-derivation bullet, `build_candidates`' docstring, and the
  carb-log prompt review queue comment above `/api/prompts` in
  `ciq_autotune/api.py`, so each says an owned rise raises no question.
- [ ] 2.2 In `ciq_autotune/analyzers/classifiers/late_bolus.py` and
  `ciq_autotune/analyzers/classifiers/carb_undercount.py`, pass `scenario_config`
  to `upstream_cause`. Say in each function docstring's context-gate step that the
  gate is judged under `scenario_config`, as missed meal's does.
- [ ] 2.3 In `ciq_autotune/analyzers/classifiers/correction_on_iob.py` (the
  NO_TRIGGER-versus-UPSTREAM_CAUSE comment, lines 232-235 at the base) and
  `ciq_autotune/analyzers/classifiers/correction_stacking.py` (lines 239-241 at the
  base), say that UPSTREAM_CAUSE names an observable cause the move recovers
  from: the context gate's recent low or suspend (ADR 0009), or an over-treated
  low's rebound (ADR 422). Keep each comment's reason why its own branch is
  `NO_TRIGGER`. Match the wording of the comment in
  `ciq_autotune/analyzers/classifiers/missed_meal.py`.
- [ ] 2.4 In `frontend/day-chart.js`, delete the detector and silence-reason
  reference section: its header comment, `DETECTOR_REFERENCE`, `REASON_REFERENCE`,
  `DETECTOR_DEF` and `REASON_DEF`. Remove the vocabulary header's pointer to the
  deleted `model-view-log.js`. In `frontend/day-chart.test.js`, delete the test
  `reason reference keeps announced-meal ownership calm and server-owned` and its
  `REASON_REFERENCE` import. First re-run an unnarrowed whole-tree grep for the
  four names. It must include `frontend/index.html`, `mockups/` and namespace
  property access such as `DC.REASON_DEF`, which is how the v1 shell read them
  before #416. Triage found no other reader.

## 3. Record, generated artifacts and gates

- [ ] 3.1 In the **Carb-log prompt** entry of `CONTEXT.md`, say that "did you eat
  here?" is asked at a missed-meal rise onset that no over-treated low's rebound
  owns. An owned rise is explained by its low, which asks its own question when it
  is sub-70.
- [ ] 3.2 Regenerate `mockups/harmonic-v2.exploration/focus.json` and
  `journey.json` with `uv run python mockups/harmonic-v2.exploration/generate.py`.
  Only the analyzer `code_version` stamp and the context ids derived from it may
  move. Leave every drift check current: the eleven in `DRIFTS` in
  `mockups/sweep/harmonic-v2-desktop/acceptance.py`, each run as
  `uv run python <path> --check` except `scripts/check_demo_fixtures.py`, which
  takes no flag, and `node mockups/diagnose-event-comparison.synthetic/generate.mjs --check`.
- [ ] 3.3 Run the AGENTS.md pull-request gate in full, once, on the commit handed to
  the coordinator. Record each command's exit code, wall time and output tail in
  `design.md` under a `### Gate` heading.
