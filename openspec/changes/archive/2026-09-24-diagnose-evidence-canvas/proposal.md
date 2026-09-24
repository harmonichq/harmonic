# Diagnose evidence canvas (#135)

## Why

The Diagnose workstation's glucose-by-clock chart owns the whole canvas while
the evidence behind every recommendation — the nights behind a basal slot, the
rest windows behind a correction factor, the meal runs behind a carb ratio —
ships on three feeds with no frontend consumer at all. A reader cannot hold a
chart against the slicer, compare two kinds of evidence side by side, or work
the evidence with the advisory layer switched off.

## What changes

- The glucose chart condenses to a full-width strip that keeps every slicing
  control (clock presets, draggable window with brace grips, the ADR 130
  midnight unroll).
- Beneath it, a tile field renders one chart per basal slot and carb-ratio
  block the reader currently has, derived solely from the findings payload,
  plus the ISF rest windows and the meals/lows event comparison — through a
  stateless four-kind chart registry.
- One click swaps a slot chart into the focal position; pinning holds up to
  four charts against the slicer, and layout is always derived from pin count
  (focal, split, pair, one-plus-two, quad) — never hand-arranged.
- Every glucose-valued chart in an arrangement draws on one computed range
  (fitted, snapped outward in 20 mg/dL steps, always containing 60–200).
- Alignment becomes a per-chart property; the global ALIGN control is retired.
- The carb-ratio block-evidence feed gets its client, whose 409
  `analysis_generation_mismatch` recovers through the single generation
  authority and redraws the affected tile with the server's own wording.
- Explore mode, seating policy, the explorer drawer, fullscreen, drill
  provenance, and the un-trace fix follow (chunk 3); the behavior-ledger
  amendment, replay stories, and browser evidence close the work (chunk 4).

## Boundaries

No analyzer, staging predicate, API endpoint, backend projection, or cache key
changes. The single `api.py` exception is `/assets/*` routes for the new
modules. No lock manifest exists or may be created for this shipped surface;
the contract is the frozen behavior ledger and its replay.
