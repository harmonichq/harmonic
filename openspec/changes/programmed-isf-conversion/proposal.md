# Convert glucose misses with the programmed correction factor (#563)

## Why

Several parts of the engine turn a glucose miss into insulin units by dividing
it by one ISF: the carb-ratio ledger's glucose-travel term, the carb-undercount
classifier, the scenario engine's attribution, the outcomes summary, the event
comparison, the finding case file, the model view and the exposures explorer.
All of them read that ISF through one helper, which prefers the ISF analyzer's
fasting estimate and falls back to the median programmed ISF only when there is
no estimate. The preference cites a decision record that no longer exists.

The fasting estimate is not trustworthy enough to carry that weight. No passive
method identifies ISF under Control-IQ, because Control-IQ delivers insulin in
response to glucose. The served estimate is a pooled slope that a few nights can
dominate, and carb-free evidence reads weaker than it, so it leans toward
stronger corrections. A too-strong ISF makes every meal's glucose miss look like
more insulin than it was, and moves the carb-ratio estimate further from its
programmed value.

The estimate also fails silently. An estimate of exactly zero, which a flat
fasting history produces, is read as "no ISF", and the carb-ratio ledger then
drops its glucose-travel term for every meal.

## What changes

- One settings read, `programmed_isf(snapshots)`, gives the median of the
  latest snapshot's active ISF schedule, or nothing without a schedule. It
  replaces the measured-first helper.
- Every glucose-to-insulin conversion reads it: the carb-ratio segment rows and
  blocks in `analyze()`, the scenario engine, the outcomes summary, the event
  comparison, the finding case file, the model view and the exposures explorer.
  None of them runs the ISF analyzer any more to obtain a conversion value.
- The outcomes trend and the follow-up comparison already used the programmed
  median through their own copy of it; they now read the same settings helper,
  with no change in what they serve.
- The ISF analyzer, its Overview card, its Queue card, its staging and its
  settling gate are unchanged. Removing them is #564.
- No staging predicate changes. The carb-ratio, carb-undercount and attribution
  results that move do so because their ISF input moves.

## Risk contract

- **Must prevent:** a glucose-to-insulin conversion that reads the ISF
  analyzer's estimate; a staging verdict changed by anything other than the
  conversion value; a second implementation of the programmed-ISF read;
  silent incorrect success (a generated fixture or expectation re-baselined
  without its generator); any real value committed.
- **Must recover:** nothing automatic. Results are recomputed from recorded data
  on the next read; no stored row changes.
- **Accepted failure:** on a schedule with several ISF segments, a meal is
  converted with the schedule median rather than the segment in force at the
  meal. This is the value every caller already fell back to, and the one the
  outcomes trend has used since #131.
- **Unsupported:** per-meal or per-segment ISF conversion; using the dose-stamped
  ISF on a bolus; any change to the ISF analyzer or its surfaces.
- **Evidence owed:** a test through `analyze()` showing two stores that differ
  only in their fasting nights (so their ISF estimates differ) produce identical
  carb-ratio rows and blocks, which fails on the base commit; the same pair
  showing identical scenario-engine attribution; the settings helper's own
  tests (median, none without a schedule, no estimate parameter); every drift
  check, QA case and contract test green after regeneration; the staging
  movement recorded in ADR 563.
