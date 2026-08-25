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

- **The subtraction removes only what this factor claimed** (Q4, A). An
  occurrence some other factor claimed still counts as an ordinary member of the
  comparison line. Why: removing every claimed occurrence rebuilds the
  `Does not meet` residue under a new name. `inline`
- **Every chart carries at most four drawn series, and the same three cohorts**
  (Q2, operator's set): occurrences this factor matched; occurrences it nearly
  matched; occurrences where the starting gun fired but this factor did not
  match. The fourth series is the user's own selected occurrence trace. Why: one
  taxonomy across every family is what lets the canvas (#135) render every event
  tile the same way. `inline`
- **The standalone comparison route moves to the same contract** (Q3, A):
  `GET /api/diagnose/event-comparison` and its `meals` / `lows` views are bound
  by this decision and change with it. Why: it carries the same residue baseline,
  and leaving it means two comparison vocabularies in one app. `inline`

- **The three cohorts partition the population** (Q5, A). A nearly-matched
  occurrence is drawn on the near-miss line only, never also on the comparison
  line, so the three counts reconcile against the population. Why: an occurrence
  drawn twice makes the chart's own numbers unaddable. `inline`
- **Occurrences too sparse to judge are a count, never a curve** (Q6, A), riding
  the support provisions already in the tree (`event_comparison.py:682-690`
  grades each point `supported` / `limited` / `withheld` against a floor). Why:
  drawing them adds broken curves and quietly weakens the comparison line.
  `inline`
- **`Meal bolus fell short` compares against completed carb-bolus meals**
  (Q7, B), cross-family, not against other highs. Why: the claim is about a meal
  dose falling short, so meals are the population it is really speaking about.
  `inline`
- **The missed-meal family keeps the three-line shape** (Q8, A): matched highs,
  near-miss highs, announced meals. Why: #178 pins the announced-meal comparison
  without forbidding a near-miss line, so the shared shape holds unbroken.
  `inline`
- **Comparison identity, per factor**, derived from the settled rule:

  | Factor | Comparison line |
  | --- | --- |
  | Carb undercount | Other completed carb-bolus meals |
  | Late bolus | Other completed carb-bolus meals |
  | Meal over-delivery | Other completed carb-bolus meals |
  | Over-treated low | Other low excursions |
  | Correction on active insulin | Other low excursions |
  | Correction stacking | Other back-to-back correction pairs |
  | Missed / unannounced meal | Completed carb-bolus meals (#178, cross-family) |
  | Meal bolus fell short | Completed carb-bolus meals (cross-family) |

  `inline`

- **Line naming is server-owned, shared for two lines and per-factor for the
  third** (Q9, B). The matched and nearly-matched lines read the same on every
  chart; the comparison line names its own population. The frontend renders the
  published words and derives none of them, per the repo's standing rule that
  membership and its labels stay server-owned. `inline`
- **`Meal bolus fell short` lines up both cohorts on a meal dose** (Q10, A): the
  matched occurrences on the dose the engine already records as the one it
  judged (`MealBolusShortVerdict.meal_t`), the comparison meals on their own
  dose, over one fixed window. Why: both lines then mean "the hours after a meal
  dose", which is the comparison the factor's claim actually rests on. `inline`
- **A window too thin to build a comparison draws the matched line and says so**
  (Q11, A). Never a withheld chart, and never a silent fall back to the verdict
  cohorts. Why: a visible gap is safer than a chart that quietly changes what it
  compares. `inline`

### Risk contract

- **Must prevent:** a chart whose drawn comparison line is not the population its
  caption names; a baseline conditioned on the outcome that followed; any
  membership or label decided in the browser.
- **Must recover:** nothing automatically.
- **Accepted failure:** too few comparison occurrences in a window draws the
  matched line with the comparison stated as unavailable (Q11).
- **Unsupported:** windows with no occurrences of the factor's own population;
  real-data grounding beyond a local read-only snapshot.
- **Evidence owed:** per factor, that the three cohorts partition the population
  and their counts reconcile against it; that a nearly-matched occurrence is
  drawn once; that occurrences too sparse to judge are counted and not drawn;
  that both cross-family factors anchor on a real carb bolus; that no occurrence
  claimed by another factor is removed from the comparison line.

Why: served advisory dosing evidence for one operator, read in a clinician
conversation, where a mislabelled population misgrounds the conversation while
every failure mode is recoverable by reload.
Disposition: copied into the work order at admission.

## Open questions

Round 5: where the comparison lives after this (one module for both surfaces, or
two shapes sharing a vocabulary); and the build shape that follows.

## Spawned tasks

(none yet)
