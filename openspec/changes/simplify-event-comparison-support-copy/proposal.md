# Proposal — simplify By-event comparison support copy

## Why

The By-event key repeats Comparison support as engine vocabulary beside a mark
that already carries the state, while a withheld five-minute point can announce a
cohort-level fact that is false for a Supported cohort.

## What changes

- Keep the event count and say only when a cohort line is thin, too sparse to
  average, or has nothing to draw.
- Make withheld point readouts describe the point rather than the whole cohort.
- Keep the server-owned Comparison support facts and chart behavior unchanged.

## Boundaries

No event membership, support threshold, projection payload, analyzer, or safety
predicate changes. The By-event canvas gains no caption or explanatory paragraph.
