# #342 — impact comparison on local history

Research date: 2026-09-05. Code: `667fbc5` (application base `aeb37c6`).
Status: exploratory findings, not an execution lock or an admitted ranking change.

## Finding

The new candidates overlap existing meal findings often enough that their pricing
needs an explicit shared basis. This experiment did not validate a forecasting
model that can choose which behavior change would have the largest benefit.
Do not promote the fitted coefficients into attribution or a dose recommendation.

The grounded next proposal is to use the existing observed-burden impact and
Priority machinery, with explicit sequence occurrence identity, eligible exposure
counts and a non-duplicated outcome interval. Observed burden is not avoided burden.
How that price participates in single-episode attribution still needs a concrete,
reviewed design; this note supplies no arbitrary lever precedence.

## Authorized data boundary

The operator explicitly approved a WAL-safe full database snapshot for local,
read-only analysis and deletion of the temporary copies. The host-side temporary
copy was removed immediately after transfer. The local database was opened only
with `Store.open_readonly`. No server or vendor fetch was started. All row-level
working data stayed in private session scratch; this document contains aggregates
only. The final cleanup is recorded in the scope ledger.

The snapshot contained 54,337 CGM rows, 57,782 basal rows, 1,917 bolus rows and
93 manual-carb rows. No false-low readings were removed by the shipped invalidation
path on this snapshot. The shared sequence builder produced 526 sequences;
496 had the start/end CGM context required by the exploratory model. The other
30 were excluded from both its overlap table and predictive sample.

## What the existing code does

- `ciq_autotune/analyzers/scenario/priority.py`: both flavors call
  `priority_score`; Priority is `round(100 * sqrt(impact * recurrence))`.
  Behavioral impact comes from `Confidence.effect`, recurrence from its Wilson
  lower bound. The tuning flavor maps its insulin currency to the shared axis.
- `ciq_autotune/analyzers/scenario/engine.py::_score_pattern`: observed behavioral
  effect is mean normalized severity over unique occurrence representatives.
- `ciq_autotune/analyzers/scenario/severity.py`: severity integrates
  hypo-weighted out-of-range burden plus the existing nadir-depth term, then
  applies the existing soft normalization. It does not estimate an intervention.
- `ciq_autotune/analyzers/scenario/attribute.py::attribute`: episode ownership
  currently chooses the first actionable driver in anchor order. The first meal
  classifier match wins within the meal helper. It does not compare Priority.
- `ciq_autotune/analyzers/scenario/model_view.py::_anchor_state`: another matched
  anchor is `outranked` when it is not the driver.
- `ciq_autotune/findings_projection.py::_occurrence_verdict`: a finding's own
  classifier match remains row-relative `fired`, even when another lever owns
  the episode. This is distinct from the model-view anchor state. The projection
  ranks rows using already-computed Priority; it does not estimate a price.

The operator's intended impact-based outranking is recorded in the scope ledger.
The distinctions above identify integration work, not grounds to ask the operator
to invent a precedence list or to contradict that direction.

## Detector support and overlap

The shipped report was evaluated over windows ending at the snapshot's latest
CGM reading, using its existing definitions and exclusions:

| Window | High-carb evidence | Repeat-eating evidence |
| --- | --- | --- |
| 30 days | supported | insufficient |
| 90 days | supported | insufficient |
| 180 days | supported | supported |

These are aggregate detector verdicts, not a new Pattern or a forecast.
The study's full-history empirical quintiles are separate from those window-local
report evaluations; their classifications must not be substituted for the fixed
Diagnose window's classifications.

The following counts refer to candidate sequences among the 496 usable rows.
They do not assert that every candidate met the cohort support floor or that every
co-occurrence belongs to the same segmented episode. The survey retained all
matches from the existing carb-undercount, late-bolus and meal-over-delivery
classifiers for meal anchors inside each sequence, before attribution:

| Candidate | Sequences | With any of those meal matches | Undercount | Late bolus | Meal over-delivery |
| --- | ---: | ---: | ---: | ---: | ---: |
| Highest carb fifth | 97 | 49 | 14 | 19 | 30 |
| Three-plus windows | 97 | 51 | 20 | 18 | 29 |
| Both | 68 | 37 | 13 | 16 | 21 |

Match columns overlap. This is a meal-classifier collision survey, not an audit
of every low, correction or missed-meal lever. Undercount used the engine's
representative ISF helper over historical 30-day bins. Those bin endpoints may
follow an individual event; these verdicts are descriptive only and were excluded
from forecasting. No dose-stamped or measured setting values are published here.

The shipped interval eligibility rules excluded 87 sequence-period pairs for CGM
coverage, 64 for manual-carb contamination and 404 for next-sequence overlap.
These are sequence-period exclusions, not unique sequences. After required model
context and complete outcome horizons, 461 rows had in-sequence outcomes, 339 had
4-hour outcomes and 208 had 6-hour outcomes.

## Held-out predictive experiment

A small stdlib ridge regression predicted the existing normalized glucose burden
for each post-sequence interval. Three expanding chronological training splits
used the first 50%, 65% and 80% of eligible rows; each predicted the next held-out
block. A training row whose outcome could reach the first test sequence was
removed, using a six-hour separation. Scaling and the high-carb threshold were
fit on training rows only. A deterministic linear-system check verified the
scratch solver on a known solution.

The stronger context baseline used time of day, start/end glucose, the recent
end-glucose change, sequence duration and last-bolus IOB/setting context with
missingness indicators. Added features were highest-fifth membership, repeat
eating, then the already-observable late-bolus verdict. The undercount verdict
was excluded: it reads the later peak and would leak outcome information.

For ridge penalty 10, adding the two sequence features changed held-out mean
squared error by **+0.87% at four hours** and **+0.65% at six hours** relative to
that context baseline; positive means worse. This is no evidence of improvement.
The held-out sample counts were 170 and 104 respectively.

Sensitivity checks used penalties 1, 10 and 100, bounded predictions to [0,1],
and compared both the end-context baseline and a weaker baseline containing
only time of day and starting glucose. Across those variants, sequence-only
changes ranged from about **1.2% improvement to 1.1% worsening**. The largest
coefficient among high-carb, repeat and late bolus changed across folds and
context choices. Those coefficients are associations, not estimated causal
benefits and not production impact scores.

This is retrospective held-out prediction, not a deployable real-time forecast:
a sequence's final bolus is only identifiable after the chaining gap elapses,
and outcome eligibility itself excludes subsequent eating. End-context adjustment
also conditions on possible mediators of the eating behavior. The two baselines
therefore test different predictive questions, not interchangeable causal effects.
No uncertainty interval for the small prediction-error differences was estimated;
they should not be described as statistically established gains or losses.

## Matched comparisons

For repeat eating, comparisons matched carb quintile, six-hour time-of-day band
and the set of existing meal-classifier matches. For high-carb, they matched
repeat status, the same time bands and meal matches. Both sides needed at least
eight observations, preserving the existing support floor.

No post-4-hour or post-6-hour cell met that floor for either candidate after those
matches. No repeat cell met it in-sequence either. Only one in-sequence high-carb
cell remained, with 8 reference and 11 exposed sequences. Such sparse overlap
cannot support a general conditional winner. Conditioning on outcome-derived
undercount/over-delivery matches also makes these descriptive comparisons, not a
causal identification strategy.

At the coarser match used by the existing repeat detector, only carb quintile four
had both single-window and three-plus-window samples above eight in the model
sample: 18 versus 26 in-sequence, and 14 versus 19 at four hours. No quintile met
both floors at six hours. The observed burden contrast changed sign between the
in-sequence and post-four-hour intervals. Summing the nested 4h and 6h outcomes
would count the same glucose twice and is not a valid price.

## Consequences for triage

1. Retain the shared observed-impact/Priority machinery as the starting point;
   this research supplies no validated replacement model.
2. Specify each new lever's unique sequence occurrence, recurrence denominator,
   source-window eligibility and outcome ownership before implementing its price.
   Do not copy one entire episode's burden into every competing explanation and
   call those separate estimates of benefit.
3. Preserve the detector-owned support floors. The 30-day repeat result here is
   a legitimate absence; do not widen the shipped window to force a finding.
4. Keep the operator's impact-based outranking direction. A concrete proposal must
   explain how pre-attribution prices are obtained without circular dependence on
   the winning occurrence counts, and how ties/unsupported comparisons preserve
   honest evidence. That design is not settled by this experiment.
5. Build and review the charts through the frontend chart harness using independently
   generated synthetic fixtures, then verify the shipped Diagnose integration.

No production code, detector thresholds, attribution policy or chart changed.
No execution lock has been posted. The initial real-data investigation is complete;
triage still owes a grounded pricing/ownership design and its mandatory review.
