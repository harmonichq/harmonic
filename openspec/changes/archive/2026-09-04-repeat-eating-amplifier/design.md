# Design — repeat-eating amplifier detector

## ADR 276 — One matched-carb repeat-eating judgment from shared evidence

- `build_report` remains the only public analyzer entry. It assigns pooled
  quintiles once over all constructed sequences before eligibility, then reuses
  each sequence's assigned quintile and the single `_metrics` output for both
  detectors. The repeat-eating detector does not re-rank, re-measure, or run a
  second exclusion pass. Its `exclusions` block therefore carries the same three
  counts as `high_carb_sequence.exclusions`.
- Every eligible sequence is banded from `EatingSequence.window_count`: exactly one
  window is `1`, exactly two is `2`, and three or more is `3+`. The report always
  serves fifteen matrix rows in `(carb_quintile, band)` order for the three measured
  periods. Only matched-quintile `3+` versus `1` cohorts enter the fifteen
  comparisons; `2` is descriptive evidence and cannot support a comparison or
  finding.
- A comparison is supported only when both cohorts meet `minimum_bucket_n` and its
  differences are repeat minus reference. It is adverse when repeated sequences
  have lower median TIR or higher median glucose SD. The headline mirrors #275's
  two tiers: select the largest TIR drop first; only if none exists, select the
  largest SD rise. Ties prefer `post_4h`, then `post_6h`, then `in_sequence`, and
  then the lower quintile number. The fixed summary names the served metric and
  states association only, never cause, a carb limit, an eating-frequency
  prescription, or a setting change. Without an adverse supported comparison,
  status is `insufficient` and finding is null.
- No route or new entry point is introduced: the existing `build_report` call now
  replaces its repeat-eating skeleton. The generator retains its production-shaped
  path through the shared synthetic stream builder and `build_report`; regenerating
  the committed fixture, retaining both parity assertions, and passing `--check`
  keep the lockstep generator-to-fixture fact coherent.
