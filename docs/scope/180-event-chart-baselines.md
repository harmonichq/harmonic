# Scope ledger — baseline population for every event chart family (#180)

Session origin: `/ticket triage 180` (2026-08-25). Map: #133. Prototype: #178.
Branch `codex/180-baseline-population-event-charts`.

Routed by `/scope` to **interview mode**: the dominant uncertainty is a set of
interlocking design decisions the operator holds, not missing facts.

## Grounding (verified this session, do not redo)

- Closed lever taxonomy, 8 levers over 4 exposure families
  (`ciq_autotune/analyzers/scenario/levers.py`): Meals = carb undercount, late
  bolus, meal over-delivery; Lows = over-treated low, correction on active
  insulin; correction clusters = correction stacking; Highs = missed /
  unannounced meal, meal bolus fell short.
- Two cohort-bearing chart surfaces exist today, both with residue baselines:
  1. The finding case-file event lens. `finding_case_file._event` builds cohorts
     uniformly from `findings_projection.FINDING_VERDICTS`
     (`fired`, `outranked`, `near_miss`, `no_data`, `clean`) over the finding's
     whole exposure-family roster. `clean` renders as `Does not meet`
     (`frontend/diagnose-workstation.js:943`,
     `frontend/diagnose-event-comparison.js:95`).
  2. The standalone comparison route `GET /api/diagnose/event-comparison`
     (schema `diagnose-event-comparison-v3`, views `meals` / `lows`,
     `event_comparison.VIEW_CONFIG`), cohort keys `fired` / `near_rule` /
     `neutral` / `another_factor` / `excluded`; `neutral` is
     "Comparable; no factor matched". Live in the shipped app
     (`frontend/index.html:2345`).
- Exposure rosters are already positive identities
  (`analyzers/scenario/opportunities.py`): Meals = completed carb boluses at or
  above the meal-carb floor; Lows = excursion nadirs; correction clusters =
  adjacent user-correction pairs; Highs = high excursions.
- #178 settled the missed-meal family only, and its baseline is *cross-family*
  (highs versus announced meals), so the nesting question never arose there.
  `not_comparable` does not exist in the tree yet; #178 introduces it.
- Decision 6 in `openspec/changes/diagnose-finding-case-files/design.md:85-105`
  pins today's five-verdict cohorts and the per-family anchors and horizons. Any
  generalization amends it explicitly.
- Basal clean-night (#143), ISF rest-window (#144) and current I:C meal-run
  (#145) evidence projections carry no cohorts. Outside this decision.

## Decisions

(none yet)

## Open questions

Round 1 asked: baseline shape when the attributed set is a slice of its own
population; whether the served shape is uniform across families; whether the
standalone comparison route is bound by the same contract.

## Spawned tasks

(none yet)
