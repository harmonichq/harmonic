# #422 implementation checklist

## 1. Failing-first analyzer tests (through the public interface)

- [ ] 1.1 Add the ownership regression to `tests/test_scenario_engine.py`, built from
  a synthetic window of several days through `evaluate` and `assemble`, with no
  hand-set Lever, verdict or flag. On each day a sub-70 low rebounds, with no bolus,
  into a >250 mg/dL High whose crossing comes more than 90 minutes after the low run
  ends and inside the guarded rebound. Vary the crossing across days, for example
  100, 120 and 150 minutes after the nadir. Assert: no Episode attributes Missed /
  unannounced meal or Meal bolus fell short to an owned High, and no Episode's
  candidates include either for it. Each rebound is attributed Over-treated low
  exactly once. The owned High's retained missed-meal and meal-bolus-short verdicts
  are non-matches with `upstream_cause`, whose detail names the owning low's nadir
  value and time. Its Episode draws no Lever, with silence reason `upstream_cause`.
  Pin the Over-treated-low Episode's end (the later of the guarded terminal and the
  owned High run's end) and its severity as literals dumped from the implemented
  analyzer. Run it on the base first and record that it fails for the right reason.
- [ ] 1.2 Add a near-low regression: a 72 mg/dL nadir rebounding into a High that
  shares its Episode (crossing within 90 minutes). The Episode keeps Over-treated low,
  and no missed-meal match, candidate or impact price remains for the High. It fails
  on the base.
- [ ] 1.3 Add a #155 regression: a correction-on-active-insulin low that is
  over-treated and splits into its two moments, with the real High run split off more
  than 90 minutes after the low. The real High attributes no High lever, and the
  synthesized High-moment keeps Over-treated low.
- [ ] 1.4 Add the controls on the same window shape; each keeps today's output.
  (a) A later rise separated from the low by a settled in-range dwell still
  attributes Missed / unannounced meal. (b) A High whose run begins after the guarded
  terminal still attributes it, including a continuous climb that first crosses
  250 mg/dL after the 180-minute horizon. (c) A low refuted by a `no` answer owns
  nothing, and its High is judged as today. (d) A sub-70 low whose High shares its
  Episode keeps the context gate's verdict text unchanged.
- [ ] 1.5 Add a configuration test through each classifier's public call: a
  non-default `gate_lookback_min` changes the missed-meal and the meal-bolus-short
  context-gate verdicts. It fails on the base, which always used the gate defaults.

## 2. Implementation

- [ ] 2.1 Give `classify_missed_meal` and `classify_meal_bolus_short` the owning
  rebound as an optional input. Consult it after the rise checks and after the
  context gate: a rise the gate explains keeps its gate verdict; otherwise the
  classifier returns a non-match with `upstream_cause`, evidence tier Inferred, and
  a detail naming the owning low's nadir value and time. Pass `scenario_config` to
  `upstream_cause` in both. Update both module and function docstrings.
- [ ] 2.2 In `ciq_autotune/analyzers/scenario/attribute.py` and
  `ciq_autotune/analyzers/scenario/evaluation.py`, carry each fired over-treated-low
  rebound span through the one evaluation walk. An unsplit low's span runs from its
  nadir to its guarded terminal and comes from the build's own fired judgment when the
  walk reaches it. A #155 High-moment's span comes from its anchor and is known before
  the walk starts, because the real High it reaches can sit in the earlier low-moment
  Episode. Hand the owner to the High-lever classifiers for every real High anchor
  whose run begins inside a span, in the same or a later Episode. Record the owned
  Highs on the attribution. Never re-judge a low outside the walk.
- [ ] 2.3 Extend the owning Episode's scored span to the later of its guarded
  terminal and the end of every High run it owns, still stopping at the next
  lever-bearing Episode.
- [ ] 2.4 In `ciq_autotune/explore_exposures.py`, skip owned Highs in the `uncaused`
  tally, reading the attribution's record. An owned High stays a non-driver
  Occurrence with no attributed Lever. Update the `build_exposures` docstring and the
  `_uncaused_highs` docstring in `ciq_autotune/findings_projection.py`. Add a test in
  `tests/test_explore_exposures.py`: a window whose only High is owned serves
  `uncaused: 0` for highs, and removing the low's rebound (so the High is no longer
  owned) serves 1.

## 3. QA coverage era

- [ ] 3.1 Follow AGENTS.md "Maintaining QA coverage eras": add the manufactured case
  `behavioral-over-treated-rebound-ownership` to `scripts/qa_e2e_cases.py`, with a
  split-off owned High and a separate unowned control High. Materialize it, run
  `execute_case`, and copy the complete serialized dump into literal `QaExpectation`
  values, including `uncaused_highs`. Add its name to `EXPECTED_CASE_NAMES` in
  `tests/test_qa_e2e_cases.py` and to the case map in `tests/test_pattern_replay.py`.
  Run `test_case_behavioral_over_treated_rebound_ownership`.
- [ ] 3.2 Re-measure the five QA budgets without raising a limit, and record the
  literal output in this change's `design.md` under a `### Budgets` heading.

## 4. Record, generated artifacts and gates

- [ ] 4.1 Widen the *upstream-cause* entry under **Silence reason** in `CONTEXT.md`
  to include a rise owned by an over-treated low's rebound.
- [ ] 4.2 Regenerate `mockups/harmonic-v2.exploration/focus.json` and `journey.json`
  with `uv run python mockups/harmonic-v2.exploration/generate.py`. Leave every
  drift check in AGENTS.md and `.github/workflows/ci.yml` current.
- [ ] 4.3 Run the AGENTS.md pull-request gate in full, once, on the commit that will
  be handed to the coordinator, and record the result in `design.md` under
  `### Gate`.
