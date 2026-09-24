# #448 implementation checklist

## 1. Failing-first tests (through the public interface)

- [x] 1.1 In `tests/test_pending_prompts.py`, add owned-High tests through
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
- [x] 1.2 Add the controls on the same shapes. (a) An unbolused rise with no low
  before it still raises its missed-meal prompt. (b) A High whose run begins after
  a sub-70 low's rebound has settled in range for at least 30 minutes still raises
  its missed-meal prompt. (c) The 1.1(a) shape with `low_answers` holding a `no`
  answer at the nadir raises the missed-meal prompt at the High onset. The same
  shape with a `not-sure` answer, and again with a `carbs` answer, raises none.
  (a) and (b) keep the base's output. (c) is new behavior through the new
  keyword.
- [x] 1.3 Add a store-facing test through `build_pending_prompts`, on an in-memory
  store holding the 1.1(a) shape. The queue serves the low prompt and no missed-meal
  prompt. Record a low-prompt `no` at the nadir with `answered_at` at or before the
  store's latest reading, and the missed-meal prompt appears at the High onset. A
  `no` stamped after the latest reading does not restore it, because the Scenario
  does not know that answer yet either (#467). The store's default stamp is wall
  clock, which is after any synthetic reading. The first assertion fails on the
  base.
- [x] 1.4 Add a gate-configuration test through each classifier's public call, in
  `tests/test_classifier_late_bolus.py` and `tests/test_classifier_carb_undercount.py`.
  (a) A from-flat pre-bolus rise with a 60 mg/dL reading 100 minutes before the
  meal bolus matches under the default configuration. Under
  `ScenarioConfig(gate_lookback_min=120.0)` it does not match, with silence
  reason `upstream_cause`. (b) The same holds for a 74 mg/dL reading 60 minutes
  before the bolus under `ScenarioConfig(gate_low_mgdl=75.0)`. The carb-undercount
  meal carries an ISF and a Dose-stamped carb ratio so its judgment reaches the gate.
  The `design.md` evidence block gives shapes for both. Each fails on the base,
  where the configured verdict still matches.
- [x] 1.5 Pin the two reader-facing definitions of upstream cause through their
  public readers. Nothing pins either string today. In `tests/test_guide_catalog.py`,
  assert that the `upstream_cause` entry of `build_catalog()["silence_reasons"]`
  serves exactly the new body in ADR 448 Decision 3. In `frontend/day.test.js`,
  beside the existing test that reads the Glossary's Quiet entry through
  `glossaryGroups`, assert that its definition contains exactly the new
  "explained (…)" clause in Decision 3. Assert each string as a literal copied from
  the ADR, never derived from the module under test. Each fails on the base, which
  serves the gate-only wording.
- [x] 1.6 In `tests/test_pending_prompts.py`, add a sequence-won test through
  `build_candidates` on a synthetic week shaped like ADR 448 Decision 1a's
  evidence. It has 42 carb sequences in 7 days, ten of them 90 g or more. After
  nine of those ten, glucose sits high through most of the 4-hour post-sequence
  window, so a High-carb sequence finding is supported. On one day a 99 g breakfast is followed by a 72 mg/dL near-low at
  12:00 and a rebound crossing 250 mg/dL at 12:55. The design.md evidence script
  builds exactly this week. Assert that the queue raises no missed-meal prompt.
  Through `evaluate` on the same week, assert that the High's Episode is won by
  High-carb sequence and still lists the High in `owned_highs`. Record that the
  test fails on the base, where the queue asks at 12:55. Record that it fails
  again with task 2.1 alone, before task 2.6 lands.

## 2. Implementation

- [x] 2.1 In `ciq_autotune/pending_prompts.py`, give `build_candidates` a keyword
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
- [x] 2.2 In `ciq_autotune/analyzers/classifiers/late_bolus.py` and
  `ciq_autotune/analyzers/classifiers/carb_undercount.py`, pass `scenario_config`
  to `upstream_cause`. Say in each function docstring's context-gate step that the
  gate is judged under `scenario_config`, as missed meal's does.
- [x] 2.3 In `ciq_autotune/analyzers/classifiers/correction_on_iob.py` (the
  NO_TRIGGER-versus-UPSTREAM_CAUSE comment, lines 232-235 at the base) and
  `ciq_autotune/analyzers/classifiers/correction_stacking.py` (lines 239-241 at the
  base), say that UPSTREAM_CAUSE names an observable cause the move recovers
  from: the context gate's recent low or suspend (ADR 0009), or an over-treated
  low's rebound (ADR 422). Keep each comment's reason why its own branch is
  `NO_TRIGGER`. Match the wording of the comment in
  `ciq_autotune/analyzers/classifiers/missed_meal.py`.
- [x] 2.4 In `frontend/day-chart.js`, delete the detector and silence-reason
  reference section: its header comment, `DETECTOR_REFERENCE`, `REASON_REFERENCE`,
  `DETECTOR_DEF` and `REASON_DEF`. Remove the vocabulary header's pointer to the
  deleted `model-view-log.js`. In `frontend/day-chart.test.js`, delete the test
  `reason reference keeps announced-meal ownership calm and server-owned` and its
  `REASON_REFERENCE` import. First re-run an unnarrowed whole-tree grep for the
  four names. It must include `frontend/index.html`, `mockups/` and namespace
  property access such as `DC.REASON_DEF`, which is how the v1 shell read them
  before #416. Triage found no other reader.

- [x] 2.5 Reword the two reader-facing definitions to the sentences in ADR 448
  Decision 3. The first is the `SilenceReason.UPSTREAM_CAUSE` body in
  `ciq_autotune/analyzers/scenario/guide.py`, served by `/api/catalog` and
  rendered by the Guide's silence article. The second is the "explained" clause of
  the Quiet entry in `frontend/glossary.js`. Change no label, tier, order or other
  entry. Leave the pipeline article's "Silence is a verdict, not a gap" paragraph
  as it is (Decision 3 says why).

- [x] 2.6 In `ciq_autotune/analyzers/scenario/evaluation.py`, make the
  sequence-winner rebuild in `evaluate` (lines 290-297 at the base) keep the
  Episode's `owned_highs`, in the same `replace` call that keeps
  `anchor_verdicts`. Change nothing else in the walk. ADR 448 Decision 1a says
  why no current output moves; tasks 3.2 and 3.3 confirm it.

## 3. Record, generated artifacts and gates

- [x] 3.1 In the **Carb-log prompt** entry of `CONTEXT.md`, say that "did you eat
  here?" is asked at a missed-meal rise onset that no over-treated low's rebound
  owns. An owned rise is explained by its low, which asks its own question when it
  is sub-70.
- [x] 3.2 Regenerate `mockups/harmonic-v2.exploration/focus.json`, `journey.json`,
  `utilities.json` and `glossary.js` with
  `uv run python mockups/harmonic-v2.exploration/generate.py`. In `focus.json`
  and `journey.json`, only the analyzer `code_version` stamp and the context ids
  derived from it may move. In `utilities.json` and `glossary.js`, only the two
  sentences task 2.5 rewords may move. Leave every drift check current: the eleven in `DRIFTS` in
  `mockups/sweep/harmonic-v2-desktop/acceptance.py`, each run as
  `uv run python <path> --check` except `scripts/check_demo_fixtures.py`, which
  takes no flag, and `node mockups/diagnose-event-comparison.synthetic/generate.mjs --check`.
- [x] 3.3 Run the AGENTS.md pull-request gate in full, once, on the commit handed to
  the coordinator. Record each command's exit code, wall time and output tail in
  `design.md` under a `### Gate` heading.
- [x] 3.4 (Coordinator-owned; the implementing worker does not run it or tick it.)
  Capture renders of the Guide's silence article at its Upstream cause row and of
  the Glossary's Episode Log group, on the base (`b03431d2`) and on the branch, at
  1280x720 and 1440x900, in the one theme the desk ships. #304 retired the Light
  theme: the desk is Dark with its bone reading sheet. Use the QA no-fetch serve
  AGENTS.md permits. The evidence lives in a private design-evidence record, not
  part of the public tree.
  Evidence, coordinator-run 2026-09-24: 448-A1 (the silence article at its Upstream
  cause row) and 448-B1 (the Glossary's Episode Log group at Quiet), before on
  b03431d2 and after on the release trunk 9882bcfe (served with the desk shell built
  at 25392ade, after every ticket's desk change had merged), at 1280x720 and
  1440x900, in the release's evidence record.
