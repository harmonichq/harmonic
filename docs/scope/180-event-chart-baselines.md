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

- **The comparison line and the claimed events never share a member** (Q1, B).
  Each factor's chart draws its claimed events against the same declared
  population with those events taken out, so the two lines are disjoint groups
  rather than a slice inside its own whole. Why: two disjoint groups read as a
  comparison; a slice inside its own total mutes the contrast it exists to show.
  `inline`
- **#178 already satisfies this rule and is not reopened.** Its two lines are
  different kinds of event entirely (a high with no bolus near it, versus a meal
  that had one), so nothing needs subtracting for them to be disjoint. Why: the
  general rule subsumes the prototype rather than contradicting it. `inline`

## Open questions

Carried from round 1, unanswered: whether the served shape is uniform across
families; whether the standalone comparison route is bound by the same contract.

Round 2 opened by Q1's answer: what exactly comes out of the comparison
population -- only the events this factor claimed, or every event some factor
claimed.

## Spawned tasks

(none yet)
