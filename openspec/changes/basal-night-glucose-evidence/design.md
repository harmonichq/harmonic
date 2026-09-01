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
  trace-over-envelope path on Glucose by time of day, which consumes the case
  file's `detail.glucose` shape — sparse `{t, minute, bg}` points, `t`
  absolute wall-clock and `minute` relative to slot start (negative across the
  lead) — so the night trace serves that exact shape and #291 wires only the
  night-selection click. On midnight: a lead point before midnight carries the
  prior date in `t`, which makes date-aware matching possible — but the
  shipped envelope match is date-blind (it compares clock labels only), so
  #291 owns matching on the full timestamp; `t` is the enabling fact, not by
  itself the guarantee.
- **Denominator is what-happened, not the estimate's population:** the
  per-night mean counts every CGM reading in the half-open window
  [slot start, slot end), not the clean-window minutes the estimate used — the
  contaminated nights are the ones the divergence reading exists to show.
- **Accepted payload growth:** the facts ride every slot's evidence
  (48 slots x up to ~30 roster nights x ~19 trace points, roughly a megabyte
  across the analysis payload and its committed fixtures). The projection may
  not compute, so on-demand assembly is rejected; bounding to "slots a reader
  opens" is impossible because every slot is served from the same cached
  payload.
- **Edge semantics** (operator delegated): entering/leaving glucose is the
  reading nearest each window boundary within the analyzer's existing staleness
  cap; the trace leads the window by 60 minutes (the event chart's −60
  precedent) to answer "was I drifting up beforehand".
- **Nulls, never membership changes:** a roster night without usable in-window
  CGM serves null glucose facts; which nights are informative is decided
  exactly where it is decided today.
