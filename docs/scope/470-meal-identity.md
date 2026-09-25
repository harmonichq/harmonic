# A meal is its first carb bolus plus its same-meal top-ups — triage and review ledger

Ticket: #470. Change: `openspec/changes/qa-round-2` (ADR 470; tasks 73–84;
behavioral-layer requirements 3, 5, 6 and 7). Triage ran unattended (AFK run,
2026-09-25).

## Reproduction

`uv run python docs/scope/470-meal-identity.repro.py`, at this change's base
(6404b9c1). Fourteen synthetic days of one noon meal (45 g / 4.5 U) with a 20 g /
2 U top-up at the gap shown; glucose flat at 110, a 2 mg/dL/min climb from the
bolus to 360, then a fall:

```text
top-up at none
  meal opportunities 14, completed carb boluses 14, meals family n 14
  Highs after meals 14 of 14; carb undercount recurrence 14 of 14
    occurrence 2024-05-03 12:00:00 carbs 45.0 insulin 4.5 levers ['carb_undercount']
    occurrence 2024-05-04 12:00:00 carbs 45.0 insulin 4.5 levers ['carb_undercount']
top-up at +5 min
  meal opportunities 28, completed carb boluses 28, meals family n 28
  Highs after meals 28 of 28; carb undercount recurrence 28 of 28
    occurrence 2024-05-03 12:00:00 carbs 45.0 insulin 4.5 levers ['carb_undercount']
    occurrence 2024-05-03 12:05:00 carbs 20.0 insulin 2.0 levers ['carb_undercount']
top-up at +10 min
  meal opportunities 28, completed carb boluses 28, meals family n 28
  Highs after meals 28 of 28; carb undercount recurrence 28 of 28
    occurrence 2024-05-03 12:00:00 carbs 45.0 insulin 4.5 levers ['carb_undercount']
    occurrence 2024-05-03 12:10:00 carbs 20.0 insulin 2.0 levers ['carb_undercount']
top-up at +20 min
  meal opportunities 28, completed carb boluses 28, meals family n 28
  Highs after meals 28 of 28; carb undercount recurrence 28 of 28
    occurrence 2024-05-03 12:00:00 carbs 45.0 insulin 4.5 levers ['carb_undercount']
    occurrence 2024-05-03 12:20:00 carbs 20.0 insulin 2.0 levers ['carb_undercount']
top-up at +30 min
  meal opportunities 28, completed carb boluses 28, meals family n 28
  Highs after meals 28 of 28; carb undercount recurrence 28 of 28
    occurrence 2024-05-03 12:00:00 carbs 45.0 insulin 4.5 levers ['carb_undercount']
    occurrence 2024-05-03 12:30:00 carbs 20.0 insulin 2.0 levers ['carb_undercount']
top-up at +35 min
  meal opportunities 28, completed carb boluses 28, meals family n 28
  Highs after meals 14 of 28; carb undercount recurrence 14 of 28
    occurrence 2024-05-03 12:00:00 carbs 45.0 insulin 4.5 levers []
    occurrence 2024-05-03 12:35:00 carbs 20.0 insulin 2.0 levers ['carb_undercount']
top-up at +10 min, peak 210
  meal opportunities 28, completed carb boluses 28, meals family n 28
  Highs after meals 28 of 28; carb undercount recurrence 28 of 28
    occurrence 2024-05-03 12:00:00 carbs 45.0 insulin 4.5 levers ['carb_undercount']
    occurrence 2024-05-03 12:10:00 carbs 20.0 insulin 2.0 levers ['carb_undercount']
one 65 g / 6.5 U dose, peak 210
  meal opportunities 14, completed carb boluses 14, meals family n 14
  Highs after meals 0 of 14; carb undercount recurrence 0 of -
    occurrence 2024-05-03 12:00:00 carbs 65.0 insulin 6.5 levers []
    occurrence 2024-05-04 12:00:00 carbs 65.0 insulin 6.5 levers []
top-up at +10 min: case file {'claimed': 28, 'denominator': 28, 'noun': 'meals'}, 28 rows
    2024-05-03 12:00:00 fired habit:carb_undercount carbs 45.0 outcome {'kind': 'peak', 'bg': 130.0, 't': '2024-05-03 12:10:00', 'minute': 10.0}
    2024-05-03 12:10:00 fired habit:carb_undercount carbs 20.0 outcome {'kind': 'peak', 'bg': 360.0, 't': '2024-05-03 14:05:00', 'minute': 115.0}
```

Every meal counter doubles for a top-up inside the grace; the split 210-peak meal
fires Carb undercount on each half where the same meal dosed once fires nowhere;
the first bolus's case-file row prints a peak of 130 because its arc stops at the
top-up. `... repro.py --qa` scans every committed QA case:

```text
QA cases: 75; cases holding a same-meal pair: 0
```

## Which generated sets move

`docs/scope/470-meal-identity.probe/sitecustomize.py` observes the producers
without changing them. Run under it, every Python drift check still passes, and
it logs which ones hold a same-meal pair (ADR 470) or a Late bolus match with an
Arc peak at or under 180 (ADR 461). Its log from the eleven drift checks at this
change's base, verbatim but for the demo generator's absolute paths, shortened:

```text
{"test": "mockups/harmonic-v2.exploration/generate.py --check", "kind": "calm", "peaks": ["180.0"]}
{"test": ".claude/qa/gen_synthetic_fixtures.py <scratch dir>", "kind": "pair", "in_one_store": 9, "pooled": 10}
{"test": "scripts/gen_findings_projection_fixtures.py --check", "kind": "pair", "in_one_store": 0, "pooled": 2}
{"test": "scripts/gen_eating_sequence_fixtures.py --check", "kind": "pair", "in_one_store": 20, "pooled": 20}
```

- the Diagnose workstation demo set (`.claude/qa/gen_synthetic_fixtures.py`, run
  by `scripts/check_demo_fixtures.py`): 9 pairs within one store. Its day records
  put carb boluses at 07:25 and 07:35, and at 18:50, 19:05 and 19:10, on each of
  three days;
- the eating-sequence findings payload (`scripts/gen_eating_sequence_fixtures.py`):
  20 pairs, from the high-carb sequence streams (`tests/eating_sequence_streams.py`);
- the design exploration (`mockups/harmonic-v2.exploration/generate.py`): no pair;
  Late bolus meals peaking at exactly 180 (ADR 461's; six, counted by an earlier
  run of the same hooks);
- the findings-projection generator: 2 pairs only when meal times are pooled
  across the many stores it builds, none within any one store, so it does not
  move;
- the chart-builder, QA database, carb-ratio history and block, basal-night,
  correction-factor rest-window and missed-meal fixtures: neither.

The event-comparison capture (Node) reads the demo set's `payload.json`, so it is
regenerated when its `--check` fails. The eating-sequence report fixture is built
from eating windows alone (`eating_sequences.py` imports no meal counter) and does
not move.

The same hooks over the whole Python suite (`PYTHONPATH=docs/scope/470-meal-identity.probe
MEAL_PROBE_LOG=… uv run python -m pytest`, run before the probe split its
per-store count from its pooled one) list the tests whose inputs hold a same-meal
pair. Pooled counts can pair two stores' meals, so some are coincidences:

- `tests/test_classifier_carb_undercount.py`
  (`test_dose_split_within_grace_is_not_a_separate_meal`, task 79);
- `tests/test_finding_case_file.py`
  (`test_an_arc_ends_at_any_carb_tagged_bolus_and_a_cluster_reads_its_second_dose`,
  task 79; `test_a_meal_two_rate_levers_claim_is_credited_once_to_the_first`,
  hand-built exposures, a cross-store coincidence);
- `tests/test_classifier_late_bolus.py` (`PriorCarbBolusOwnsRiseTest`: direct
  classifier calls, whose prior-carb-bolus rule ADR 470 leaves unchanged);
- `tests/test_eating_sequence_finding_fixture.py` and
  `tests/test_check_demo_fixtures.py` (the two regenerated sets);
- `tests/test_finding_case_file_api.py`, `tests/test_findings_projection.py`
  (`ChipProjectionTest`), `tests/test_pattern_replay.py` and
  `tests/test_watched_change.py` (`DeliveryDatingTest`): multi-store tests,
  possibly coincidences; any pin that moves is updated under task 79.

## Grounding notes

- The grace (`carb_undercount_same_meal_grace_min`, 30) is read only by
  `carb_undercount._owned_window_end`; Meal bolus short's
  `meal_bolus_short_dose_split_grace_min` mirrors it for carb-free top-ups.
- `_is_meal` is imported by `follow_up_comparison`, `watched_change`,
  `outcomes_trend`, `trial_evidence`, `finding_case_file`, `meal_suspend` and
  `opportunities`; `explore_time_of_day` repeats the 10 g floor inline;
  `meal_suspend._is_comparison_meal` repeats `completed_carb_bolus`.
- The classifiers sit below `scenario/`: `scenario/__init__` imports the engine,
  which imports the classifiers, so a classifier importing `scenario.anchors`
  first would load itself half-initialized. The rule's module sits beside
  `scenario_config.py`.
- The engine's `recurrence_observations` and the event comparison's
  `_route_meal` hand the meal classifiers one bolus (`item.members[0]`, `meal`);
  both pass the `Meal` under ADR 470.
- A retained comparison context stores `asdict(ScenarioConfig())` and is refused
  on any difference (`follow_up_comparison._execution`), so the rule adds, renames
  and re-values no configuration field.
- `_edge_facts_recipe` (`tests/test_finding_case_file.py`) puts a cancelled 40 g
  bolus exactly 30 minutes after a completed meal: under the inclusive grace it
  joins that meal.
- The carb-ratio analyzer imports only the pre-empted-lows helper from
  `scenario/`; no staging path reads a meal counter this rule moves.
- Would have checked live: nothing; this ticket depends on no deployed state.

## Decisions

- Connor, 2026-09-24/25: ADR 0030's grace is the single meal-identity rule
  (option A); anchor and identity at the first bolus; carbs and dose summed; the
  arc truncates at the next separate meal; every per-bolus meal counter reads the
  rule.
- Decided autonomously during the AFK run (ADR 470): differing stamped ratios
  judge at the first member's; a cancelled leg's carbs count once; sub-floor and
  carb-free boluses stay outside the meal; the rule's module; no configuration
  change; the pooled 12 g meal track, eating windows and the carb-ratio ledgers
  stay as they are.
- Surface lifecycle `revise`; the behavior sweep is deferred to start (Chromium
  cannot launch in the triage sandbox, and no Playwright module is installed in
  the worktree).
- Flat order: the coordinator's slice plan fixes one lock per ticket and one start
  session. The nearby reviewer-memory anchors disagree with flat for a change that
  crosses analyzer, projection, generated fixtures and a served surface.
- Review depth Full: the change moves analyzer meal identity and every classifier
  that judges a meal.

## Review rounds

| Round | Blocking objections entering | Authoring change | Injected ground truth | Verdict |
|---|---|---|---|---|
