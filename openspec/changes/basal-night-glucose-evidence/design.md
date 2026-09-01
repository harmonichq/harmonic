# Design — per-night glucose evidence for a basal slot

## ADR 299 — Glucose evidence is analyzer-stamped, night-mean-normed, trace-now

Decisions from the 2026-08-31 scoping session (operator-settled where marked):

- **The facts are stamped in `analyze_basal`, not the projection.** The
  night-evidence projection's own contract is that it only copies facts the
  analyzer stamped; adding judgment there would put glucose semantics downstream
  of the analyzer, the exact drift the safety invariants forbid.
- **The slot norm counts every night once** (operator): the roster-level figure
  is the mean of per-night in-window means, so the norm and the per-night
  deviations share units and a gappy night cannot tilt the norm.
- **The trace ships now, not with #291** (operator): its consumer is the shipped
  trace-over-envelope path on Glucose by time of day — the same served shape the
  Finding case file uses — so serving it is not building ahead of an unsettled
  design; #291 wires only the night-selection click.
- **Edge semantics** (operator delegated): entering/leaving glucose is the
  reading nearest each window boundary within the analyzer's existing staleness
  cap; the trace leads the window by 60 minutes (the event chart's −60
  precedent) to answer "was I drifting up beforehand".
- **Nulls, never membership changes:** a roster night without usable in-window
  CGM serves null glucose facts; which nights are informative is decided
  exactly where it is decided today.
