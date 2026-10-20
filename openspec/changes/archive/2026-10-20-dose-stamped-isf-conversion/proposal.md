# Convert glucose misses with the dose-stamped ISF (#563)

## Why

Three parts of the engine turn a meal's glucose miss into insulin units by
dividing it by an ISF: the carb-ratio ledger's per-meal balance, its chained
meal runs, and the carb-undercount classifier. All three read one value per
window from `settings.effective_isf`, which prefers the ISF analyzer's fasting
estimate and falls back to the median programmed ISF only when there is no
estimate. The preference cites a decision record that no longer exists.

The fasting estimate is not trustworthy enough to carry that weight. No passive
method identifies ISF under Control-IQ, because Control-IQ delivers insulin in
response to glucose. The served estimate is a pooled slope that a few nights can
dominate, and carb-free evidence reads weaker than it, so it leans toward
stronger corrections. A too-strong ISF makes every meal's glucose miss look like
more insulin than it was, and moves the carb-ratio estimate further from its
programmed value.

One value per window is also wrong for a timed schedule. The pump records the
ISF it used on every bolus (a **Dose-stamped setting**), so each meal can be
converted with the correction factor in force when it was eaten, as each meal
already supplies its dose-stamped carb ratio.

The estimate also fails silently. An estimate of exactly zero, which a flat
fasting history produces, is read as "no ISF", and the carb-ratio ledger then
drops its glucose-travel term for every meal.

## What changes

- One settings module, `IsfSource`, answers "which ISF converts this meal?":
  the meal bolus's dose-stamped ISF; without a stamp, the programmed ISF segment
  in force at the bolus's time of day in the latest snapshot captured at or
  before it; without either, no ISF, so that meal is not converted. A second
  adapter returns a fixed value, for a retained comparison that captured one.
- The carb-ratio ledger (segment rows, meal runs, blocks, the block estimator
  interface the admission bar calls) converts each meal or run with its own
  ISF from the source.
- The carb-undercount classifier converts each meal's rise the same way, and the
  scenario engine and every reader of it pass a source instead of one number.
- No conversion runs the ISF analyzer. `effective_isf` and the two private
  wrappers that re-ran the analyzer are deleted.
- A comparison retained before this change keeps executing with the ISF it
  captured, so a Trial's or Focus's saved comparison does not move or become
  unavailable. A comparison captured after it converts with the dose-stamped ISF.
- The ISF analyzer, its Overview card, Queue row, staging and settling gate are
  unchanged. Removing them is #564.
- No staging predicate changes. A result moves only because its ISF input moved.

The work lands in two slices (tasks.md): the carb-ratio ledger first, then the
scenario engine. Between them, carb undercount still reads the old value.

## Risk contract

- **Must prevent:** a meal converted with anything but its stamp, its as-of
  programmed segment, or nothing; after slice 2, any conversion that reads the
  ISF analyzer's estimate, and a second implementation of the ISF choice; a
  staging verdict changed by anything other than the conversion value; a
  retained comparison whose result moves or which stops reading; silent incorrect success (a fixture or
  QA expectation re-baselined without its generator, or derived from output at
  assertion time); any real value committed.
- **Must recover:** nothing automatic. Results are recomputed from recorded data
  on the next read; no stored row changes.
- **Accepted failure:** an unstamped bolus within one fetch of a profile edit
  converts with the segment the previous snapshot held, because snapshots are
  captured per fetch. An unstamped meal before the first snapshot is not
  converted: its run is unconfirmed and its carb undercount unjudged, which can
  thin a long history's confirmed runs. Between slice 1 and slice 2,
  `settings.effective_isf` and its estimate-first read survive for carb
  undercount only; slice 2 deletes them. A store with neither stamps nor any
  snapshot now runs the ledger's start-glucose and rescue reads, which today
  switch off with the ISF, while its runs stay unconverted.
- **Unsupported:** inferring a setting before the first snapshot; correcting a
  stamp the pump recorded; any change to the ISF analyzer or its surfaces.
- **Evidence owed:** a test through `analyze()` showing two stores that differ
  only in their fasting nights produce identical carb-ratio rows and blocks,
  which fails on the base commit, and a store whose fasting estimate is zero
  still converting its meals; QA cases with a two-segment ISF schedule, an ISF
  changed mid-window and unstamped meals (with and without an as-of snapshot),
  with literal expectations; a carb-undercount case whose verdict depends on the
  segment; a retained comparison reading the same before and after; every drift
  check, QA case and contract test green; the five QA budgets re-measured
  without raising a limit; the staging movement on the operator's snapshot
  recorded as counts in ADR 563.
