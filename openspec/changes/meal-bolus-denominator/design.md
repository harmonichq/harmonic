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
| Carb undercount | meals / meals | other completed carb-bolus meals | completed carb-bolus / -60..300 | no | ordinary Exposure opportunity policy; engine/trend retain compatibility clamps because episode attribution and meal-opportunity collection do not yet share an occurrence identity |
| Late bolus | meals / meals | other completed carb-bolus meals | completed carb-bolus / -60..300 | no | ordinary Exposure opportunity policy; engine/trend retain the same compatibility clamps |
| Meal over-delivery | meals / meals | other completed carb-bolus meals | completed carb-bolus / -60..300 | no | ordinary Exposure opportunity policy; engine/trend retain the same compatibility clamps |
| Over-treated low | lows / lows | other low excursions | excursion nadir / -300..120 | no | ordinary Exposure opportunity policy; engine/trend retain compatibility clamps because actionable near-low rebounds can exist without a sub-70 recurrence opportunity |
| Correction on active insulin | lows / lows | other low excursions | excursion nadir / -300..120 | no | ordinary Exposure opportunity policy; engine/trend retain the same near-low compatibility clamps |
| Correction stacking | correction clusters / correction clusters | other back-to-back correction pairs | correction pair / -300..180 | no | ordinary Exposure opportunity policy; engine retains the legacy opportunity clamp and trend retains separate behavior/harm clamps because its paired classifier counts are not occurrence-associated |
| Missed / unannounced meal | highs / highs | completed carb-bolus meals | completed carb-bolus / -60..300 | yes | explicit cross-population exception retained; engine/trend retain compatibility clamps because high opportunities and attributed episodes have no shared occurrence identity |
| Meal bolus fell short | eligible completed carb-bolus meals / meals | other completed carb-bolus meals | completed carb-bolus / -60..300 | no | recurrence moved from highs; eligible meal event is its stable occurrence identity |

Outcome-family consumers may retain `LEVER_EXPOSURE` where they answer where an
episode landed (for example Focus's outcome series). Recurrence consumers use this
policy seam; a family is not silently treated as a finding denominator.

| Consumer | disposition |
| --- | --- |
| `scenario/__init__.py` | retains the legacy outcome-family exports for compatibility; recurrence callers import the policy at its own seam. |
| `scenario/levers.py` | retains `LEVER_EXPOSURE` solely as the outcome-family taxonomy; its `Exposure.HIGHS` value for Meal bolus fell short does not denominate recurrence. |
| `api.py` | remains a thin accounting adapter; `/api/outcomes` delegates its flat outcome-family account to `outcomes.py`, while `/api/outcomes-trend` serializes the policy-owned per-lever recurrence account. |
| `explore_exposures.py` | stamps `cause_occurrence_id` from the policy, so projections do not rediscover a meal. |
| `finding_case_file.py` | deferred to chunk 2 by the work boundary; its comparison branches must be replaced by this policy rather than revised here. |
| `findings_projection.py` | deferred to chunk 2 by the work boundary; it will consume the serialized occurrence groups without re-deriving meal identity. |
| `outcomes.py` | remains an outcome-family clean-rate account, so it deliberately retains `LEVER_EXPOSURE`; no discarded policy call remains. |
| `outcomes_trend.py` | reads policy recurrence membership, noun, and count for Meal bolus fell short; only non-meal policies retain the audited served-account clamp described above. |
| `watched_change.py` | remains a consequence-outcome selector for Focus, so it deliberately retains `LEVER_EXPOSURE`; no discarded policy call remains. |
| `window_membership.py` | remains consequence-anchor clock membership and tolerates unknown serialized levers through `outcome_kind`; it deliberately does not invoke the closed recurrence policy. |
| `guide.py` | emits policy-owned recurrence noun as the server-owned measured label. |
