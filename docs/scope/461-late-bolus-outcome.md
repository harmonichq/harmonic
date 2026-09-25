# Late bolus claims a meal only when it ran above the range line — triage and review ledger

Ticket: #461. Change: `openspec/changes/qa-round-2` (ADR 461; tasks 85–92;
behavioral-layer requirements 4 and 8, qa-e2e-database requirement 1). Triage ran
unattended (AFK run, 2026-09-25). Its peak window stops at the next meal ADR 470
defines, so #470's tasks land first.

## Reproduction

`uv run python docs/scope/461-late-bolus-outcome.repro.py`, at this change's base
(6404b9c1):

```text
1. behavioral-late-bolus: Highs after meals 3 of 6
    2024-05-01 00:00:00 levers [] late_bolus matched False (insufficient_data), arc peak 150.0
    2024-05-24 12:05:00 levers ['late_bolus'] late_bolus matched True (None), arc peak 180.0
    2024-05-25 12:05:00 levers ['late_bolus'] late_bolus matched True (None), arc peak 180.0
    2024-05-26 12:05:00 levers ['carb_undercount'] late_bolus matched False (no_trigger), arc peak 360.0
    2024-05-27 12:05:00 levers [] late_bolus matched False (upstream_cause), arc peak 150.0
    2024-05-28 12:05:00 levers [] late_bolus matched False (no_trigger), arc peak 150.0
2. 14 in-range late meals
  Highs after meals 14 of 14, action habit:late_bolus, seriousness info
  Late bolus confidence k 14 n 14 effect 0.0 priority 0
  Late bolus cause row count sentences [{'sentence': '14 of 14 meals ran high', 'count': 14, 'denominator': 14, 'noun': 'meals', 'outcome': 'ran high'}]
  Late bolus fired on 14 meals; arc peaks [165.0]
3. control: the same climb, post-bolus peak 240
  Highs after meals 14 of 14, action habit:late_bolus, seriousness medium
  Late bolus confidence k 14 n 14 effect 0.2081 priority 43
  Late bolus cause row count sentences [{'sentence': '14 of 14 meals ran high', 'count': 14, 'denominator': 14, 'noun': 'meals', 'outcome': 'ran high'}]
  Late bolus fired on 14 meals; arc peaks [240.0]
```

Meals that never rose above 165 after the bolus are served as "14 of 14 meals ran
high", and the committed case's two Late bolus meals peak at exactly 180.
`... repro.py --qa` scans every committed QA case for Late bolus matches whose Arc
peak (cut at the next meal under ADR 470) is at or under 180:

```text
  behavioral-carb-undercount: [('2024-05-26 12:05:00', 180.0)]
  behavioral-late-bolus: [('2024-05-24 12:05:00', 180.0), ('2024-05-25 12:05:00', 180.0)]
QA cases: 75; cases with a Late bolus verdict ADR 461 turns calm: 2
```

## Spike

`uv run python docs/scope/461-late-bolus-outcome.spike.py` wraps the real
classifier with ADR 461's rule and reads both cases' served tallies (fired /
outranked / near miss / no data / clean):

```text
behavioral-late-bolus
  today: {'late_bolus': '2 / 1 / 1 / 1 / 1', 'carb_undercount': '1 / 2 / 0 / 0 / 3', 'highs_after_meals': '3 of 6'}
  today, reshaped traces: {'late_bolus': '3 / 1 / 1 / 1 / 1', 'carb_undercount': '1 / 3 / 0 / 0 / 3', 'highs_after_meals': '4 of 7'}
  rule, today's traces: {'late_bolus': 'no row', 'carb_undercount': '1 / 0 / 0 / 0 / 5', 'highs_after_meals': '1 of 6'}
  rule, reshaped traces: {'late_bolus': '2 / 1 / 1 / 1 / 2', 'carb_undercount': '1 / 2 / 0 / 0 / 4', 'highs_after_meals': '3 of 7'}
behavioral-carb-undercount
  today: {'late_bolus': '1 / 2 / 0 / 0 / 3', 'carb_undercount': '2 / 1 / 1 / 1 / 1', 'highs_after_meals': '3 of 6'}
  today, reshaped traces: {'late_bolus': '1 / 2 / 0 / 0 / 3', 'carb_undercount': '2 / 1 / 1 / 1 / 1', 'highs_after_meals': '3 of 6'}
  rule, today's traces: {'late_bolus': 'no row', 'carb_undercount': '2 / 0 / 1 / 1 / 2', 'highs_after_meals': '2 of 6'}
  rule, reshaped traces: {'late_bolus': '1 / 2 / 0 / 0 / 3', 'carb_undercount': '2 / 1 / 1 / 1 / 1', 'highs_after_meals': '3 of 6'}
```

Unshaped, both cases lose their Late bolus Finding and the carb-undercount case
loses its outranked band, which the qa-e2e-database requirement forbids. The
reshape (a post-bolus peak of 195, under Carb undercount's 200 bar) keeps every
band, and the new exact-180 meal is the in-range band.

## Grounding notes

- `classify_late_bolus` reads the 20-minute pre-bolus slope, the context gate, a
  completed carb bolus in the prior 60 minutes and the start level; nothing after
  the dose. Carb undercount needs a peak of 200 and Meal bolus short a HIGH-anchored
  episode.
- The row's peak is `outcomes_trend._meal_arc`'s: the highest reading in (bolus,
  bolus + 3 h], cut at the next meal; ADR 461 moves that window into one shared
  reader both call.
- The Day chart's quiet-row rule reads the served anchor state; a `stayed_in_range`
  meal is served `clean`, so no frontend change is needed. The Guide's silence
  article renders the served catalog, and `frontend/kb.test.js` and
  `frontend/desk.browser.test.mjs` build their own catalogs, so neither moves.
- The design exploration is built on `behavioral-late-bolus` with its meals
  repeated (`repeat_manufactured_meals`): six exact-180 Late bolus meals under the
  probe (`docs/scope/470-meal-identity.probe`). The desk ledger replay only checks
  those captures exist; it drives the app on case stores.
- Tests the probe found firing Late bolus with no post-bolus reading or a peak at
  or under 180, outside the two cases: `tests/test_classifier_late_bolus.py`
  (three), `tests/test_follow_up_comparison.py` (one) and
  `tests/test_scenario_engine.py` (one), named in task 87. The guidance,
  preference, wall-clock, case-file and projection tests that flag build on
  `behavioral-carb-undercount`, whose tallies the reshape keeps.
- `openspec/specs/qa-e2e-database/spec.md` pins both cases' tallies literally;
  the change modifies that table's `behavioral-late-bolus` row.
- Would have checked live: nothing; this ticket depends on no deployed state.

## Decisions

- Connor, 2026-09-24/25: option A, a backend verdict; a new calm silence reason;
  one peak definition coordinated with ADR 470's truncation; the late-bolus case
  re-shaped.
- Decided autonomously during the AFK run (ADR 461): the verdict judges the Arc
  window through one shared reader; the check runs last; strictly above 180; the
  reason's name, tier and words; no post-bolus reading is `insufficient_data`;
  `behavioral-carb-undercount` is re-shaped too, and `behavioral-late-bolus` gains
  an exact-180 meal.
- Surface lifecycle `revise`; the behavior sweep is deferred to start (sandbox).
- Flat order, as for #470 (coordinator's slice plan); the reviewer-memory anchors
  disagree with flat.
- Review depth Full: the change moves a classifier verdict that feeds Priority,
  a Pattern count and served advice.

## Review rounds

| Round | Blocking objections entering | Authoring change | Injected ground truth | Verdict |
|---|---|---|---|---|
| 1 | — | Initial flat draft pinned 6dd05119 | Blocker (`authoring`): the fixture-only Pattern case-file projector keeps a fourth calm list (`mockups/diagnose-event-comparison.synthetic/project.mjs:296`), so a `stayed_in_range` meal would read near miss in the browser fixtures while the server serves it clean, and the closed allowlist barred the fix. Notes (`authoring`): the budget leg was missing from Verification and Expectation; the base-relative replay selection is the complete ledger. Refuted: none; each reproduced against the tree. Fixed: task 88, ADR 461 decision 2, the trap line and Expected diff name the projector (its capture too), and its generator's `--check` is in Verification; the budget and replay notes are fixed as in #470's round 1, with S13, S124 and R8 in the `ONLY=` selection. | BLOCKED (1 block, 2 notes); fixed, no further panel by operator instruction |
