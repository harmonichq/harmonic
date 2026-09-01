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
  the window (the reading nearest each boundary within the analyzer's existing
  staleness cap, null when none); and that night's CGM trace across the window
  plus a 60-minute lead, served as five-minute `{minute, bg}` bins with minutes
  relative to slot start — the same shape the Finding case file's trace already
  ships, so the shipped trace-over-envelope path draws it unchanged when #291
  wires night selection.
- Per slot, once: the roster-level mean in-block glucose — every night counts
  once, the mean of the per-night means, so the norm and the deviations read in
  the same units.
- The night-evidence projection copies the new facts through verbatim, exactly
  as it copies everything else; nothing is derived downstream of the analyzer.
- A roster night without usable in-window CGM serves nulls; roster membership
  never changes on account of glucose.

## Boundaries

The analyzer keeps ownership of every judgment: no change to `asserts_move`,
`safety_status`, roster membership, the eight-night floor, or anything else in
AGENTS.md "Safety invariants". Per-night exclusion reasons stay deferred per
issue #290's close — the bare count stays. Backend only: no frontend change
beyond the regenerated committed fixture. #298 runs in parallel and shares no
files.
