# Proposal — repeat-eating amplifier detector

## Why

The eating-sequence report already serves the complete repeat-eating amplifier
shape, but its matrix, comparisons, exclusions, and finding are the
all-insufficient skeleton. This change makes that second detector report whether
repeated eating is associated with less stable glucose at matched carb load,
without turning that association into advice about insulin settings or eating.

## What changes

- Populate `repeat_eating_amplifier` in the existing `build_report` call, using
  the existing pooled per-sequence quintile assignment and one eligibility pass.
- Serve all fifteen `(carb quintile, window-count band)` matrix rows and compare
  `3+` with `1` for each quintile and measured period; the `2` band remains
  descriptive only.
- Surface only an adverse supported aggregate association with the fixed TIR or
  glucose-spread template, regenerate the existing synthetic fixture through its
  existing generator, and retain its parity and drift checks.

## Risk contract

This is aggregate-only, advisory evidence. It must not recommend a pump setting,
carb limit, eating-frequency prescription, or causal explanation; it must not
enter Plan, Priority, the Consolidated profile, `AnalysisResult`, or `safety.py`.
Carb logs are exclusion signals only. All judgments, including band membership,
eligibility, support, comparison status, and the headline, belong to the analyzer;
the fixture only projects its report. All tests and committed evidence use
manufactured event streams whose values cannot be rounded real readings.

The implementation must prove, through `build_report` and builder-made streams:

- window-count bands at 1, 2, 3, and 4, with 3 and 4 both served as `3+`;
- every matrix row in `(carb_quintile, window_count_band)` order and its true
  per-row qualifying `n`;
- a supported adverse `3+`-versus-`1` comparison that produces the fixed TIR
  template, and an SD-only adverse comparison that produces the fixed SD template;
- a populated `2` band with at least eight sequences while `3+` is thin, which
  produces no finding;
- `post_4h` preferred over `post_6h` for an equal TIR drop;
- a supported non-adverse comparison that remains visible while status is
  insufficient and finding is null;
- identical exclusion blocks for the high-carb and repeat-eating detectors; and
- the complete all-insufficient repeat-eating skeleton for an empty source window.

No test may hand-set an analyzer verdict: every asserted result is built from the
required synthetic population.

## Boundaries

No new entry point, API route, findings projection, frontend module, Plan, Priority,
Consolidated profile, tuning result, or safety rule changes. #277 owns projection
and #278 owns charts.
