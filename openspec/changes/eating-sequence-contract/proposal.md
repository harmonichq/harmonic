# Proposal — lock the eating-sequence aggregate detector contract (#274)

## Why

Eating-sequence findings need one stable, aggregate-only contract before their
two detector implementations can begin. Without it, a later detector can make
its own decision about sequence membership, carb grouping, thin evidence, or
the public payload, and Diagnose could present a hollow report as a successful
one. This change locks the detector-owned boundaries without building a
detector, API producer, projection, or chart.

## What changes

- Add an `eating-sequences` capability specification for eating windows and
  sequences, eligibility, user-relative quintiles, aggregate metrics,
  insufficiency, scopes, intervals, and the two later finding conditions.
- Add a frozen `EatingSequenceConfig` beside the analyzers and a separate
  `eating-sequence-report-v1` contract module with immutable report rows,
  deterministic quintile assignment, median aggregation, complete
  serialisation, and an all-insufficient empty report.
- Add a deterministic synthetic event-stream test helper plus public-interface
  tests for the contract. The helper manufactures bolus, CGM, and Carb log
  streams; it is not a committed event fixture or a substitute for #275's
  generator-owned JSON capture.

## Boundaries

This is advisory-only aggregate reporting. It does not stage a Plan item, feed
the Consolidated profile or a deliverable schedule, create a `TuningLever`,
affect Priority, or import or couple to `safety.py`. It does not construct
windows or sequences from store events, apply CGM eligibility, implement either
detector, add an API/cache producer, project into Diagnose, or build a chart.
Those follow in #275–#278. #275 owns the committed JSON fixture, its generator,
and its drift check because a committed fixture must have its producer in the
same change.

## Risk contract

- Must prevent: secret exposure; any record-level value from a real snapshot
  (glucose, doses, event timestamps) appearing in a commit, ticket, PR body,
  CI log, or worker prompt — row counts, quantile summaries, correlations, and
  wall times only; silent incorrect success (a report that runs green on zero
  qualifying sequences must say so through `insufficient` with n = 0).
- Must recover: nothing automatic.
- Accepted failure: light or null findings; the report serves its insufficiency
  state and no headline.
- Unsupported: live database access, `harmonic fetch` / normal `serve`, staging
  any recommendation into the Plan.
- Evidence owed: public-interface tests for quintile determinism, insufficiency
  semantics, serialisation completeness and the aggregates-only boundary; every
  later detector ticket tests analyzer output built from synthetic streams,
  never hand-set flags.
