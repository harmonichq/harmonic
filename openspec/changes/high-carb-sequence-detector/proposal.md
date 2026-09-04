# Proposal — eating-sequence primitives and high-carb detector

## Why

The eating-sequence contract already makes its aggregate report shape and evidence
floor explicit, but it has no event-stream producer, no conclusion drawn from a
supported high-carb cohort, and no cached Diagnose read. This change makes the first
detector useful without turning an association into insulin-setting advice.

## What changes

- Build the report from bolus, CGM, and Carb-log events through a pure public entry,
  with a read-only store wrapper using Diagnose's fixed 30-day source window.
- Populate the high-carb sequence Q5-versus-Q1–Q4 comparisons and, only when the
  pinned evidence and worse-outcome condition hold, its aggregate-only advisory
  finding. Keep `repeat_eating_amplifier` as the complete insufficient skeleton for
  #276.
- Serve the versioned report as a token-gated, fixed-window cached Diagnose product,
  warm it after fetches, and freeze a populated synthetic report through the
  production-shaped builder → `build_report` → generator path and drift gate.

## Risk contract

This is aggregate-only, advisory evidence. It must not recommend a pump setting,
carb limit, or causal explanation; it must not enter Plan, Priority, the Consolidated
profile, `AnalysisResult`, or `safety.py`. Carb logs are exclusion signals only.
All judgments, including construction, eligibility, support, comparison status, and
the headline, belong to the analyzer; the API and fixture only project its report.
All tests and committed evidence use manufactured event streams whose values cannot
be rounded real readings. The store wrapper is read-only.

The implementation must prove, through `build_report` and builder-made streams:

- 30-minute eating-window chaining, 3-hour sequence chaining, and ignored
  correction-only boluses;
- quintiles assigned before eligibility; the exact 70% coverage boundary; separate
  Carb-log contamination and next-sequence-overlap exclusion; and in-sequence's
  exemption from the post-horizon overlap rule;
- evening membership by first-bolus hour, and pooled assignment/boundaries filtered
  identically into evening rather than re-ranked;
- supported and non-firing Q5 comparisons, withheld evening headlines when pooled is
  insufficient, and a complete zero-sequence skeleton with `n = 0`;
- cache delivery with `input_data_age`, fixed-window refusal, generator parity and
  provenance, and a green `--check`.

No test may hand-set an analyzer verdict: every asserted result is built from the
required synthetic population.

## Boundaries

No frontend module, finding projection, tuning result, safety rule, Plan, Priority,
or Consolidated profile changes. This ticket does not implement the repeat-eating
amplifier (#276) or a rendered Diagnose experience (#277–#278).
