## ADR 202 — Meal bolus fell short recurs over completed carb-bolus meals

Meal bolus fell short makes a claim about an eligible meal dose and its later
outcome. Its recurrence denominator is therefore the completed carb-bolus meal
population, rather than the high excursions where the outcome was observed.
`evidence_population.py` owns membership, occurrence identity, recurrence noun,
comparison population, anchor, and comparison window together. The completed-meal
predicate is consumed by both the classifier and event comparison so a cancelled,
zero-dose, or too-small-carb row cannot enter one surface but not another.
Their shared non-default-floor contract is exercised together: changing
`anchor_meal_min_carbs` must admit or reject the same completed bolus in both.

| Lever | recurrence population / noun | comparison population | anchor / window | cross-population | occurrence identity | disposition |
| --- | --- | --- | --- | --- | --- | --- |
| Carb undercount | meals / meals | other meal opportunities | completed carb-bolus / -60..300 | no | episode | ordinary Exposure opportunity policy; engine/trend retain compatibility clamps because episode attribution and meal-opportunity collection do not yet share an occurrence identity |
| Late bolus | meals / meals | other meal opportunities | completed carb-bolus / -60..300 | no | episode | ordinary Exposure opportunity policy; engine/trend retain the same compatibility clamps |
| Meal over-delivery | meals / meals | other meal opportunities | completed carb-bolus / -60..300 | no | episode | ordinary Exposure opportunity policy; engine/trend retain the same compatibility clamps |
| Over-treated low | lows / lows | other low excursions | excursion nadir / -300..120 | no | episode | ordinary Exposure opportunity policy; engine/trend retain compatibility clamps because actionable near-low rebounds can exist without a sub-70 recurrence opportunity |
| Correction on active insulin | lows / lows | other low excursions | excursion nadir / -300..120 | no | episode | ordinary Exposure opportunity policy; engine/trend retain the same near-low compatibility clamps |
| Correction stacking | correction clusters / correction clusters | other back-to-back correction pairs | correction pair / -300..180 | no | episode | ordinary Exposure opportunity policy; engine retains the legacy opportunity clamp and trend retains separate behavior/harm clamps because its paired classifier counts are not occurrence-associated |
| Missed / unannounced meal | highs / highs | completed carb-bolus meals | completed carb-bolus / -60..300 | yes | episode | explicit cross-population exception retained; engine/trend retain compatibility clamps because high opportunities and attributed episodes have no shared occurrence identity |
| Meal bolus fell short | eligible completed carb-bolus meals / meals | other completed carb-bolus meals | completed carb-bolus / -60..300 | no | eligible meal event | recurrence moved from highs; eligible meal event is its stable occurrence identity |

Outcome-family consumers may retain `LEVER_EXPOSURE` where they answer where an
episode landed (for example Focus's outcome series). Recurrence consumers use this
policy seam; a family is not silently treated as a finding denominator.

| Consumer | disposition |
| --- | --- |
| `scenario/__init__.py` | retains the legacy outcome-family exports for compatibility; recurrence callers import the policy at its own seam. |
| `scenario/levers.py` | retains `LEVER_EXPOSURE` solely as the outcome-family taxonomy; its `Exposure.HIGHS` value for Meal bolus fell short does not denominate recurrence. |
| `api.py` | remains a thin accounting adapter; `/api/outcomes` delegates its flat recurrence-population account to `outcomes.py`, while `/api/outcomes-trend` serializes the policy-owned per-lever recurrence account. |
| `explore_exposures.py` | stamps `cause_occurrence_id` from the policy, so projections do not rediscover a meal. |
| `finding_case_file.py` | builds recurrence rosters and both same-population and cross-population comparison cohorts through the policy. The eight-lever served-shape audit remains closed; Meal bolus fell short is derived from synthetic events through analyzer output rather than injected `Member` or recurrence values. |
| `findings_projection.py` | delegates serialized recurrence identity and denominator selection to the policy. A one-off attributed meal remains a `1 of 1 meals` Finding below the scenario pattern gate; the gate withholds pattern confidence, not the observed Finding occurrence. Two High outcomes attributed to one meal still count as one recurrence occurrence. |
| `outcomes.py` | rolls attributed occurrences into the policy-owned recurrence account; Meal bolus fell short therefore charges meals, not highs. |
| `outcomes_trend.py` | reads policy recurrence membership, noun, count, and caller `ScenarioConfig` for Meal bolus fell short; only non-meal policies retain the audited served-account clamp described above. A non-default meal floor exercises the structural `k <= n` contract. |
| `watched_change.py` | remains a consequence-outcome selector for Focus, so it deliberately retains `LEVER_EXPOSURE`; no discarded policy call remains. |
| `window_membership.py` | remains consequence-anchor clock membership and tolerates unknown serialized levers through `outcome_kind`; it deliberately does not invoke the closed recurrence policy. |
| `guide.py` | emits policy-owned recurrence noun as the server-owned measured label. |
| `scenario/engine.py` staging evidence | behavioral patterns do not own an `asserts_move` predicate and cannot stage a dose change; the invariance test exercises every behavioral lever, then pins byte-identical verdicts from a synthetic basal analyzer fixture that produces real staged moves. |
| `.claude/qa/gen_synthetic_fixtures.py` | builds every demo case-file roster from the policy. Meal bolus fell short therefore emits completed-meal anchors and `m_` occurrence identities while retaining its High outcome family. `scripts/check_demo_fixtures.py` regenerates and byte-compares the committed fixture in CI. |
