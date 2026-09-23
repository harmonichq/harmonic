# #432 meal Occurrence facts

## Status

**Triage source for #432.** An ordinary ticket change on the shipped desk. The
desk's frozen behavior ledger (`mockups/harmonic-v2-desktop.behavior.md`) and its
replay (`frontend/desk-behavior.replay.mjs`) stay the contract. This change adds
fail-first stories S148–S150 beside them and amends S25 and S107 under Connor's
dated sanction for this release (see `design.md`).

## Why

In a Diagnose Finding case file about meals, every Occurrence row reads
"— · Completed carb bolus". The leading slot is glucose at the anchor, and a meal
anchor is a bolus, which has no glucose by construction. Selecting an Occurrence
repeats the dash, prints a fixed sentence about the canvas, and lists only how many
glucose readings and event markers the trace holds. The meal's carbs, its dose, how
high glucose went afterwards, and why the Occurrence was or was not matched are all
missing, although the analyzer already computed every one of them.

Reproduced in-process on 2026-09-23, over the real exposure builder and case-file
projection, on a scratch copy of the committed QA showcase and on emitted
`scripts/qa_e2e_cases.py` case stores:

- showcase: 32 of 32 meal Occurrences and 2 of 2 correction clusters in the
  exposure feed carry no anchor glucose; `finding:meal_bolus_short` serves 32
  rows, every one with a null anchor glucose and the same label; its selected
  detail carries no reason field; 3 of the 32 meal episodes' "worst" reading is
  below 70, so that value is a low, not a peak;
- `pattern-near-tie`: `pattern:highs_after_meals` serves 3 rows, all null;
  `finding:carb_undercount` 3 of 3 null;
- `behavioral-correction-stacking`: `finding:correction_stacking` 7 of 7 null.

The gates never saw it because three fixtures hand-set a meal glucose the pipeline
never produces: the Pattern case-file unit tests, the workstation synthetic
case-file capture, and the manufactured exposure rows behind the event-comparison
capture's Pattern populations.

## What changes

- Every case-file Occurrence serves its anchor bolus's dose and carbs. A meal row
  also serves the meal's post-meal arc reading in the direction its case file
  judges: the Arc peak for a high outcome, the Arc nadir for a low one, with the
  minutes from the bolus. The arc comes from the Outcomes trend's existing arc
  owner.
- A selected Occurrence serves why it was judged: the cause that drove its episode,
  when one did, and each of the case file's habits' recorded verdict at that
  anchor, in the analyzer's own words.
- The exposure feed serves the anchor bolus's dose and carbs, so the Pattern roster
  can carry them.
- Meal rows read as their carbs, dose and arc reading; correction-cluster rows as
  their dose. The selected detail prints those facts and the served reason. The
  fixed canvas sentence and the count-only lines are retired.
- The three fixtures are regenerated through the real anchor path, with no meal or
  correction-cluster glucose the analyzer did not produce.

## Not in this change

No classifier, cap, floor, admission, staging, verdict, cohort or count changes;
verdicts and counts stay exactly as served. Eating-sequence rows, which also lead
with a dash, are outside #432's checklist. The lows labelled Outranked (a separate
issue) and the Highs-after-meals count reconciliation (a separate issue). The
event-comparison capture's exploration-only views. No pump write, real-data read or
vendor fetch.

## Impact

- Backend: `ciq_autotune/explore_exposures.py`, `ciq_autotune/finding_case_file.py`,
  `ciq_autotune/outcomes_trend.py`.
- Frontend: `frontend/diagnose-workstation.js`,
  `frontend/finding-case-file-validation.js`.
- Generated evidence: `.claude/qa/gen_synthetic_fixtures.py`,
  `mockups/diagnose-event-comparison.synthetic/generate.mjs` and `project.mjs`,
  and every committed artifact whose generator drifts.
- Contract: the desk behavior ledger, its replay modules and the replay driver's
  pinned inventory.
