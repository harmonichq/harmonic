# Scope — #63 highs attribution gap

Routed from `/ticket triage 63` to `/scope` → interview mode.
Branch `codex/63-highs-attribution-gap`, worktree `/Users/connor/worktrees/harmonic/63`.

## Grounding (measured, not assumed)

Measured read-only against the #61 snapshot (`/Users/connor/worktrees/harmonic/61/tconnect-data/ciq-snapshot.db`, real data, 30 days). Headline reproduced: highs n=30, attributed=3 (10%).

Silence-reason distribution over the 27 unattributed highs (missed-meal verdict per occurrence, from `build_exposures` → `exposures.highs.occurrences[].verdicts`):

| bucket | n | detail pattern |
| --- | --- | --- |
| no_trigger, rising but meal bolus still in digestion window | 10 | "rising, but a meal bolus N min ago is still likely driving absorption" |
| no_trigger, ~flat (no rise) | 12 | "glucose was ~flat — no significant rise to attribute to a missed meal" |
| upstream_cause (defensive Control-IQ suspend) | 2 | "rising, but control-iq suspended basal defensively" |
| matched=True but occurrence `state: outranked` | 2 | classifier matched; exposures view still counts unattributed |
| insufficient_data | 1 | sparse CGM around the rise |

Facts:
- `classify_missed_meal` returns `MissedMealVerdict`; closed silence set {insufficient_data, no_trigger, upstream_cause} (`ciq_autotune/analyzers/classifiers/missed_meal.py`).
- `_high_lever` (`attribute.py:437`) has exactly two exits: rebound → over_treated_low; else missed_meal.
- The only classifier verdict present on unattributed highs is missed_meal — no other detector even looks.
- No single explanation from the handoff wins: the 27 split ~12 "no rise at all" (honest-ceiling territory), ~10 digestion-window rejections (threshold vs under-dosed-meal detector gap), 2 suspend rebounds, 2 projection bookkeeping, 1 data.

## Decisions

**D1 (Q3). Defensive-suspend rebounds get no new lever.** The 2 highs following a Control-IQ defensive suspend fold into the "no known cause" copy with the suspend named as context; user's read: if anything they are over-corrected-low territory, not a new cause. Why: levers advise behavior; a suspend rebound is the algorithm working as designed. Disposition: inline

**D2 (Q4). Flat highs are the honest ceiling.** The 12 no-rise highs are unattributable per-episode; basal/ISF analyzers own slow drivers at the parameter level. No slow-driver detector. Why: per-episode blame for slow drift is the plausible-but-wrong-attribution risk the ticket warns about. Disposition: inline

**Measured (Q2 ground-it):** of the 10 digestion-window highs, 7 needed a correction bolus within 3h (minutes-to-correction 9–83, median ~62); 2 saw only further carb boluses; 1 no bolus at all. Evidence that these rises exceeded what the meal bolus covered.

**D3 (Q1). Unexplained highs get an aggregate honest count, not invented reasons.** The surface states plainly that N events had no cause detected by the app — no per-event reason class, no speculation. Why: user decision 2026-08-19; "don't make up a reason". Server-side (projection publishes, frontend renders verbatim per ADR 730). Disposition: inline

**D4 (Q2). The digestion-window bucket gets an under-dosed-meal investigation.** Grounded: 7/10 needed a correction within 3h. The work order includes investigating an attribution "meal bolus fell short" (rise plus later correction despite a counted meal bolus), under the same support-floor discipline as existing levers. Why: the one bucket where raising attribution is evidenced. Disposition: → work order

**D5. Chained outcomes stay two findings.** An under-dosed-meal high followed by stacked corrections into a low classifies as two anchored findings; existing low-side levers own the low. One bolus as evidence in both is expected (per #61 D9). New attribution is narrative-only: never staged into Plan, never a pump-profile suggestion. Disposition: → work order (stated constraint)

### Risk contract

- **Must prevent:** a plausible-but-wrong attribution presented as confident cause (advisory dosing blast radius); real patient data in any committed artifact or CI log; the new lever feeding Plan staging or pump-profile schedules.
- **Must recover:** none automatic — misattribution is prevented by support floors and review depth, not recovered.
- **Accepted failure:** the detector claims fewer highs than the measured 7/month (conservative thresholds); consequence: they fall into the honest "no cause detected" count.
- **Unsupported:** per-episode attribution of flat/no-rise highs; defensive-suspend rebounds as a cause.
- **Evidence owed:** analyzer-output tests from synthetic fixtures proving the exposure-denominated Wilson support discipline (never hand-set flags, per repo rule); a test that the unexplained count equals n minus attributed; a test that the new lever never sets Plan-staging state.

**D6 (review round 1, corrections to my own grounding).** "Eight informative runs" was mis-imported from basal's nights floor (`safety.py`); scenario levers use the #58 exposure-denominated Wilson confidence, and the new cause uses that same discipline. The unexplained count already exists as `exposures.highs.clean` (n − attributed, whole window) — the payload field is a passthrough, never re-derived. The 2 matched-but-outranked highs keep their semantics (one driver lever per episode; outranked ≠ attributed) — documented plus a regression test, `attributed` untouched. Disposition: folded into the work order

**D7 (coordinator).** "Meal bolus fell short" is a full `Lever` enum member (title, Exposure.HIGHS, recommendation, meaning in `_META`; `_OUTCOME_KIND` = high) with its recommendation authored as behavioral observation-only copy — never a pump-settings change. Why: the closed set demands complete metadata; a half-wired member neutered per-site is the shallow-module outcome. Disposition: folded into the work order

Why: advisory insulin guidance, one operator, human-merged. Disposition: copied into the work order at posting.

## Open questions

Q5 defaulted: the 2 matched-but-outranked highs are exposures-tally bookkeeping — note for implementer, decide at implementation. D5's narrative-only default assumed unless the user objects.

## Spawned tasks

_(none yet)_

**D8 (review rounds 2–3, measured).** Of the 27 non-driver highs, 7 sit in episodes whose driver carries a lever; the honest "no cause detected anywhere" count is 20 of 30, computed exposures-side as a new cross-family value (never derived in findings_projection). The new lever is a distinct claim from carb_undercount (correction-evidenced shortfall, no carb inference); preemption order (meal anchor first) is stated with an episode-level acceptance fixture; `outcomes_trend._BEHAVIOR_ORDER` includes the new member; verification covers the exploration-extract check, public-tree scan, revise-e2e drift, and the event-comparison replay. Copy wording is operator-confirmed at posting (highs-only scope explicit). Disposition: folded into the work order
