# Proposal — per-night glucose evidence for a basal slot

## Why

A basal slot's reader must separate divergence from the norm from the norm
needing correction: the 05:30 slot typically runs 115 against a 110 target,
three nights ran 130, and those three were a big-meal carry-over rather than a
basal problem. No surface can say that today, because no per-night glucose is
served for a basal slot at all — the night roster carries only rates and a
sign, and the glucose charts are pooled percentile envelopes with no per-day
trace.

## What changes

- `analyze_basal` stamps new evidence facts onto each `night_roster` entry: the
  night's mean glucose within the slot window; the glucose entering and leaving
  the window (via the model's staleness-capped nearest-reading lookup, null
  when none qualifies); and that night's CGM trace from 60 minutes before slot
  start through slot end, served as the case file's `detail.glucose` shape — a
  sparse list of `{t, bg}` points carrying absolute wall-clock timestamps at
  the CGM's own cadence — which is exactly what the shipped
  trace-over-envelope path consumes, so #291 wires only night selection. Lead
  points before midnight carry the prior date in `t`; nothing infers a date
  from a clock time.
- Per slot, once: the roster-level mean in-block glucose — every night counts
  once, the mean of the per-night means, so the norm and the deviations read in
  the same units.
- The night-evidence projection copies the new facts through verbatim, exactly
  as it copies everything else; nothing is derived downstream of the analyzer.
- A roster night without usable in-window CGM serves nulls; roster membership
  never changes on account of glucose.

The per-night mean counts every CGM reading in the half-open window
[slot start, slot end) — what happened, not the estimate's cleaned minutes —
because the contaminated nights are exactly the ones the divergence reading
must show. Accepted cost: stamping rides every slot's evidence, growing the
analysis payload and its committed fixtures by roughly a megabyte
(48 slots x up to ~30 roster nights x ~19 trace points); the projection may
not compute, so on-demand assembly is not an option.

## Boundaries

The analyzer keeps ownership of every judgment: no change to `asserts_move`,
`safety_status`, roster membership, the eight-night floor, or anything else in
AGENTS.md "Safety invariants". Per-night exclusion reasons stay deferred per
issue #290's close — the bare count stays. Backend only: no frontend change
beyond the regenerated committed fixture. #298 runs in parallel and shares no
files.
