# The carb-ratio block shows and explains its evidence (#464)

## Why

Diagnose serves a carb-ratio move — a raise from the programmed ratio, "meals look
slightly over-covered", "8 meal runs · 49 meals" — and the reader cannot check it
or understand it. The block panel prints the numbers and a staging control and
stops; the lead chart overlays every touching run's whole-day glucose trace on one
axis, keys every excluded run as "directional-only", bounds nothing, reads out
nothing, and draws nothing against the programmed ratio. Replayed on the operator's
own snapshot (counts only): 42 runs touch the served morning block, 25 are pooled
and only 2 are whole morning runs — the rest are all-day chains credited to the
morning by carb share, summing to the "8"; each pooled run's ledger closes a median
of 13 hours after breakfast; read plainly over the five hours after each of the 49
morning meals, 28 ran high, 10 ran low and 16 stayed in range, dip first and spike
later; and the harm arm pins 8 printed lows on 7 days to those meals, gates and
nudges the block, and stamps `recurring_low` — none of which reaches the screen.

The operator's reaction: "the graph isn't telling me anything, and the pane doesn't
tell me why." The estimator is not in question. What it decided is not shown.

## What changes

- **The block-evidence payload carries every fact the reader needs, and the
  frontend derives none of it.** Per run: the served reason it is or is not in the
  pool (one closed set), its carb-share ownership, its ledger terms (bolus,
  corrections, basal withheld or added, glucose travel) and its side of the
  programmed ratio. Per block: the programmed ratio, the estimate and band, the
  whole and fractional support, a carb-share-weighted pooled balance sheet with
  its quotient beside the fitted estimate, the per-meal outcome tally from the
  Pattern detectors' own verdicts over the block's 90-day meals, one served
  sentence reconciling the verdict with the tally, the harm arm's attributed
  printed lows with its gate, nudge and seriousness, and a per-meal CGM series
  from each block-hours meal.
- **The chart tile gets three views, By meal first.** By meal (default) overlays
  each block-hours meal on its own five-hour clock from its bolus, through the
  Pattern comparison chart, in ran-high / ran-low / in-range cohorts. Runs
  replaces the chain overlay with one strip per run: sorted by measured ratio,
  pooled first, excluded dimmed with their reason; each strip a CGM trace from
  the block's meal in hours with the block meal filled and later chain meals open,
  lows and highs marked, correction ticks, and the run's balance sheet and ratio
  against programmed at its edge. By clock keeps each run's ratio by meal start
  with the programmed rule, the estimate band and shared-run marking. Every key
  names what is drawn; every axis is bounded to served evidence; every point and
  strip has a hover and keyboard readout.
- **The block panel explains its verdict.** A scope line saying the ledger closes
  at the end of each meal chain and how many pooled runs are shared with the
  neighbouring block; the balance sheet; the outcome tally and the served
  reconciling sentence; the attributed lows as rows opening Day, with the
  seriousness word; and a run roster through the shared occurrence-roster
  mechanism, grouped pooled and excluded-by-reason, each row opening Day at the
  run's first meal, selection shared with the Runs view. The Day hop works when
  the block was opened from its queue row and from "View segment".
- **"Meal run" is defined for the reader** in the desk glossary and CONTEXT.md.
- **Evidence is generated and replayed.** The block-evidence fixture generator
  gains shared runs, a no-outcome run, an earlier-ratio run, a spike-then-low
  chain and two attributed lows; a manufactured QA case carries the same states
  to the browser; the desk behavior ledger gains a story per added or changed
  behavior and is replayed at both viewports on the built app.

## Impact

- Capabilities: `parameter-analysis` (served block explainability facts),
  `http-api` (the block-evidence payload, schema v2), `surfaces` (the tile's
  three views and the panel's evidence sections), `qa-e2e-database` (the new
  manufactured case).
- No change to the estimator, the pool rule, the eight-run floor, the caps, the
  harm arm, `ic_asserts_move`, or any move's direction or value.
- Related: #437 (open) owes the same key and readout on the Pattern comparison
  charts and is not folded in; #461 (open) is inherited by the outcome tally
  through the shared verdicts and fixed there, not here; #435 (open) lists
  below-floor blocks on this same panel.
