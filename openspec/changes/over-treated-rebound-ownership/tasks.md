# #422 implementation checklist

## 1. Failing-first analyzer tests (through the public interface)

- [x] 1.1 Add the ownership regression to `tests/test_scenario_engine.py`, built from
  a synthetic window of several days through `evaluate` and `assemble`, with no
  hand-set Lever, verdict or flag. On each day a sub-70 low rebounds, with no bolus,
  into a >250 mg/dL High whose crossing comes more than 90 minutes after the low run
  ends and inside the guarded rebound. Vary the crossing across days, for example
  100, 120 and 150 minutes after the nadir. Assert: no Episode attributes Missed /
  unannounced meal or Meal bolus fell short to an owned High, and no Episode's
  candidates include either for it. Each rebound is attributed Over-treated low
  exactly once. On a rising, unbolused owned High, the retained missed-meal verdict,
  which would otherwise match, is a non-match with `upstream_cause` whose detail
  names the owning low's nadir value and time. The meal-bolus-short verdict keeps
  its own `no_trigger` (no counted meal bolus). The High's Episode draws no Lever,
  with silence reason `upstream_cause`.
  Pin the Over-treated-low Episode's end (the later of the guarded terminal and the
  owned High run's end) and its severity as literals dumped from the implemented
  analyzer. Include one flat-approach day: the rebound climbs fast, then creeps
  across 250 mg/dL under 1 mg/dL/min, about 115 minutes after the nadir. On the base
  that High sits in its own silent Episode with both verdicts `no_trigger`. After
  the change it keeps `no_trigger` and is recorded on the attribution as owned. Run
  the test on the base first and record that it fails for the right reason.
- [x] 1.2 Add a near-low regression: a 72 mg/dL nadir rebounding into a High that
  shares its Episode (crossing within 90 minutes). The Episode keeps Over-treated low,
  and no missed-meal match, candidate or impact price remains for the High. It fails
  on the base.
- [x] 1.3 Add a #155 regression: a correction-on-active-insulin low that is
  over-treated and splits into its two moments, with the real High run split off more
  than 90 minutes after the low. The real High attributes no High lever, and the
  synthesized High-moment keeps Over-treated low. Add the pre-walk shape as well: a
  1.5 U correction on live insulin drives a 55 mg/dL low, and a second above-range
  correction mid-climb keeps the real High in the low-moment's cluster. On the base
  that Episode (`ep-002`, anchors low, correction, high) attributes
  correction-on-active-insulin with candidates correction-on-active-insulin and
  missed meal. Assert it keeps no missed-meal match or candidate after the change,
  which proves the High-moment's span is known before the walk.
- [x] 1.4 Add the controls on the same window shape. Controls (a) to (d) keep
  today's output; (e) is new behavior.
  (a) A later rise separated from the low by a settled in-range dwell still
  attributes Missed / unannounced meal. (b) A High whose run begins after the guarded
  terminal still attributes it, including a continuous climb that first crosses
  250 mg/dL after the 180-minute horizon. (c) A low refuted by a `no` answer owns
  nothing, and its High is judged as today. (d) A sub-70 low whose High shares its
  Episode keeps the context gate's verdict text unchanged. (e) A 40 g meal bolused
  10 minutes into an owned High, shaped so the meal's Episode draws no Lever (so the
  next-lever-bearing-Episode clamp does not stop the span first), caps the low's
  span: the Over-treated-low Episode ends at that bolus.
- [x] 1.5 Add a configuration test through each classifier's public call: a
  non-default `gate_lookback_min` changes the missed-meal and the meal-bolus-short
  context-gate verdicts. It fails on the base, which always used the gate defaults.

## 2. Implementation

- [x] 2.1 Give `classify_missed_meal` and `classify_meal_bolus_short` the owning
  rebound as an optional input. Consult it only where the classifier would
  otherwise return a match: there it returns a non-match with `upstream_cause`,
  evidence tier Inferred, and a detail naming the owning low's nadir value and time.
  Every non-matching exit keeps its own reason and detail: rise checks, the context
  gate, missed meal's digestion tail, and meal bolus fell short's no-meal and
  no-correction exits. Pass `scenario_config` to `upstream_cause` in both. Update the prose
  that defines `upstream_cause` as the context gate only: both classifiers' module
  and function docstrings, the NO_TRIGGER-versus-UPSTREAM_CAUSE comment in
  `ciq_autotune/analyzers/classifiers/missed_meal.py` (the digestion-tail branch,
  lines 192-195 at the base), and the `UPSTREAM_CAUSE` entry in the `SilenceReason`
  docstring of `ciq_autotune/analyzers/classifiers/evidence.py` (lines 59-61 at the
  base).
- [x] 2.2 In `ciq_autotune/analyzers/scenario/attribute.py` and
  `ciq_autotune/analyzers/scenario/evaluation.py`, carry each fired over-treated-low
  rebound span through the one evaluation walk. An unsplit low's span runs from its
  nadir to its guarded terminal and comes from the build's own fired judgment when the
  walk reaches it. A #155 High-moment's span comes from its anchor and is known before
  the walk starts, because the real High it reaches can sit in the earlier low-moment
  Episode. Hand the owner to the High-lever classifiers for every real High anchor
  whose run begins inside a span, in the same or a later Episode. Record the owned
  Highs on the attribution: every High inside a span, whatever its classifiers
  return. Never re-judge a low outside the walk.
- [x] 2.3 Extend the owning Episode's scored span to the later of its guarded
  terminal and the end of every High run it owns. Never extend past the guarded
  scan's meal-bolus stop (the next substantial carb-tagged meal bolus after the
  nadir), and still stop at the next lever-bearing Episode.
- [x] 2.4 In `ciq_autotune/explore_exposures.py`, skip every owned High in the
  `uncaused` tally, reading the attribution's record, whatever its verdicts. An owned
  High stays a non-driver Occurrence with no attributed Lever. Update the
  `build_exposures` docstring and the `_uncaused_highs` docstring in
  `ciq_autotune/findings_projection.py`. In `scripts/gen_findings_projection_fixtures.py`,
  update the uncaused roll-up prose (the cross-family comment, lines 603-609 at the
  base, and the `_rollup` docstring, lines 630-637). Say that the fixture's one
  owned High, the over-treated low's rebound High, shares its low's lever-bearing
  Episode, so the Episode-wise rule already leaves it out. The generated output must
  not move. Add a test
  in `tests/test_explore_exposures.py` built on the flat-approach owned High from
  task 1.1 as the window's only High. The base serves highs `uncaused: 1`; after the
  change it serves 0; the same window with the low removed serves 1.

## 3. QA coverage era

- [x] 3.1 Follow AGENTS.md "Maintaining QA coverage eras": add the manufactured case
  `behavioral-over-treated-rebound-ownership` to `scripts/qa_e2e_cases.py`, with a
  split-off rising owned High, a flat-approach owned High and a separate unowned
  control High. Materialize it, run
  `execute_case`, and copy the complete serialized dump into literal `QaExpectation`
  values, including `uncaused_highs`. Add its name to `EXPECTED_CASE_NAMES` in
  `tests/test_qa_e2e_cases.py` and to the case map in `tests/test_pattern_replay.py`.
  Run `test_case_behavioral_over_treated_rebound_ownership`.
- [ ] 3.2 Re-measure the five QA budgets without raising a limit, and record the
  literal output in this change's `design.md` under a `### Budgets` heading.

## 4. Record, generated artifacts and gates

- [x] 4.1 Widen the *upstream-cause* entry under **Silence reason** in `CONTEXT.md`
  to include a rise owned by an over-treated low's rebound.
- [ ] 4.2 Regenerate `mockups/harmonic-v2.exploration/focus.json` and `journey.json`
  with `uv run python mockups/harmonic-v2.exploration/generate.py`. Leave every
  drift check current: the eleven in `DRIFTS` in
  `mockups/sweep/harmonic-v2-desktop/acceptance.py` (each `uv run python <path>
  --check`, except `scripts/check_demo_fixtures.py`, which takes no `--check` flag) and
  `node mockups/diagnose-event-comparison.synthetic/generate.mjs --check`.
  `acceptance.py case-cache --check` binds port 8765, so the coordinator runs it.
- [ ] 4.3 Run the AGENTS.md pull-request gate in full, once, on the commit that will
  be handed to the coordinator, and record the result in `design.md` under
  `### Gate`.
