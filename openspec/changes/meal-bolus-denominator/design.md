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
