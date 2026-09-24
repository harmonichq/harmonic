# High-carb sequence response comparison

## Why

The current High-carb sequence chart scatters time-in-range and glucose-spread aggregates across separate panels. Connor wants to see how much worse glucose outcomes are after higher-carb eating and approved using the existing Pattern response-comparison chart. That chart shows glucose over time, an event anchor, comparison curves and the target range.

## What Changes

- Give High-carb sequence a coherent, snapshot-bound glucose response comparison for the detector's highest-carb fifth versus its reference sequences.
- Reuse the shipped response renderer, its range handling and its accessible readout. Keep the aggregate comparison as supporting evidence.
- Name the event, period and full source population explicitly, including when the selected comparison concerns eating itself rather than the period afterward.

The acceptance contract is in `specs/surfaces/spec.md`; design, risk and execution boundaries are in `design.md`. No treatment recommendation or analyzer decision changes.

## Impact

Three serial implementation chunks: coherent backend evidence; shared surface integration; generated fixtures and rendered proof. One implementation pull request, merged by a human. Repeat eating retains its existing chart and behavior. Other v2 desk changes remain on #404.
