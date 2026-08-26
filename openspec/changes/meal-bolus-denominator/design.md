## ADR 202 — Meal bolus fell short recurs over completed carb-bolus meals

Meal bolus fell short makes a claim about an eligible meal dose and its later
outcome. Its recurrence denominator is therefore the completed carb-bolus meal
population, rather than the high excursions where the outcome was observed.
`evidence_population.py` owns membership, occurrence identity, recurrence noun,
comparison population, anchor, and comparison window together. The completed-meal
predicate is consumed by both the classifier and event comparison so a cancelled,
zero-dose, or too-small-carb row cannot enter one surface but not another.

| Lever | recurrence population / noun | comparison population | anchor / window | cross-population | disposition |
| --- | --- | --- | --- | --- | --- |
| Carb undercount | meals / meals | other completed carb-bolus meals | completed carb-bolus / -60..300 | no | ordinary Exposure opportunity policy |
| Late bolus | meals / meals | other completed carb-bolus meals | completed carb-bolus / -60..300 | no | ordinary Exposure opportunity policy |
| Meal over-delivery | meals / meals | other completed carb-bolus meals | completed carb-bolus / -60..300 | no | ordinary Exposure opportunity policy |
| Over-treated low | lows / lows | other low excursions | excursion nadir / -300..120 | no | ordinary Exposure opportunity policy |
| Correction on active insulin | lows / lows | other low excursions | excursion nadir / -300..120 | no | ordinary Exposure opportunity policy |
| Correction stacking | correction clusters / correction clusters | other back-to-back correction pairs | correction pair / -300..180 | no | ordinary Exposure opportunity policy; its behavior/harm trend clamp remains a separate paired-count audit |
| Missed / unannounced meal | highs / highs | completed carb-bolus meals | completed carb-bolus / -60..300 | yes | explicit cross-population exception retained |
| Meal bolus fell short | eligible completed carb-bolus meals / meals | other completed carb-bolus meals | completed carb-bolus / -60..300 | no | recurrence moved from highs; eligible meal event is its stable occurrence identity |

Outcome-family consumers may retain `LEVER_EXPOSURE` where they answer where an
episode landed (for example Focus's outcome series). Recurrence consumers use this
policy seam; a family is not silently treated as a finding denominator.

| Consumer | disposition |
| --- | --- |
| `scenario/__init__.py` | exports the legacy outcome-family taxonomy; policy remains importable at its own seam. |
| `scenario/levers.py` | retains `LEVER_EXPOSURE` solely for outcome-family classification. |
| `api.py` | `/api/outcomes` serializes the flat account after policy-owned tallying. |
| `explore_exposures.py` | stamps `cause_occurrence_id` from the policy, so projections do not rediscover a meal. |
| `finding_case_file.py` | deferred to chunk 2; its comparison policy is superseded by this seam. |
| `findings_projection.py` | deferred to chunk 2; consumes the serialized occurrence groups. |
| `outcomes.py` | retains exposure rows as an outcome-family account; calls policy to make that separation explicit. |
| `outcomes_trend.py` | reads policy recurrence membership for meal-bolus-short instead of applying the old min clamp. |
| `watched_change.py` | retains outcome-kind Focus selection; policy distinction is explicit at the call site. |
| `window_membership.py` | retains outcome-anchor membership, never recurrence membership. |
| `guide.py` | emits policy-owned recurrence noun as the server-owned measured label. |
