# Eating-sequence findings in Diagnose (#342)

## Why

The merged eating-sequence report can identify supported high-carb and repeat-eating
associations, but neither participates in Diagnose's ranked findings or its chart
registry. The operator approved observed-burden impact pricing on 2026-09-05 after a
local study failed to establish a reliable forecasting winner.

## What Changes

- Add two behavioral levers and sequence-owned evidence populations.
- Compare candidate observed impact before single-episode attribution, retaining
  losing matches as evidence and counting each outcome only under its winner.
- Serve their Patterns, Priority, occurrences and cohort charts through Diagnose.
- Build the chart through the existing frontend harness on manufactured data and
  prove its integration in the shipped tile with the frozen behavior replay.
- Replace the planned separate aggregate section and the prohibition on behavioral
  finding/Priority coupling. Preserve every setting and safety-path exclusion.

## Impact

Behavioral evaluation and its projections, generated fixtures, the chart registry,
the chart harness, and their specifications. No pump-setting computation or staging,
new section, stage/dock/drawer redesign, live fetch, or forecasting model.
