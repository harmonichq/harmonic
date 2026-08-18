# Behavioral layer

## Purpose

The behavioral layer detects *actionable patterns* — habits and mistakes the user can change — distinct from *settings parameters* (basal, ISF, I:C, target). A behavioral pattern is a decision point in how someone uses their pump (when they bolus, how they treat lows, how they respond to highs), while settings parameters are configuration values the pump enforces automatically. The layer segments the timeline into episodes, attributes each to a single cause from a closed taxonomy, and surfaces ranked patterns so a user sees their most-impactful behavioral opportunities.

## Requirements

### Requirement: Patterns are detected by instance classifiers that judge one behavior at a time.

Each behavioral classifier (late bolus, missed meal, carb undercount, etc.) is a pure function that inspects *one concrete occurrence* — "is this meal bolus late?" — and returns a judgment, a one-line reason, and an honesty tier. The scenario engine layers these instance verdicts into episodes, attributes each episode to its earliest actionable driver, and groups episodes by lever into patterns. A single dinner that trips multiple classifiers into three separate instance matches becomes one attributed episode, not three: co-occurring behaviors are narrated as consequences of the earliest cause, never as separate advice.

### Requirement: A pattern asserts only when enough evidence backs it.

Before a detector can assert a behavioral lever in an episode, three gates must open: the behavior must produce a matched verdict (not just a near-miss), the verdict must rest on sufficiently firm evidence (observed, not inferred from absence), and the downstream lever must clear its own eligibility bar. Seven silence reasons name why an instance did *not* assert — insufficient data, no trigger, under threshold, an upstream cause already explains it, a high baseline, an earlier bolus owns the rise, or the outcome never arrived in time. The silence reason is machine-readable; the human detail still carries the numbers. When an episode finds no assertable lever, it generates no pattern contribution and produces a silence reason instead.

### Requirement: Behavioral and settings levers rank on a single 0–100 Priority axis.

Both flavors compose Priority identically as `100 · √(impact · recurrence)`, a geometric mean where one weak factor drags the score low. Behavioral impact is the hypo-weighted effect size of the bad outcome (0–1 range); settings impact is insulin-unit currency — basal/ISF/I:C changes priced through a shared soft-saturation curve so a 0.3 U/day move reads the same impact whether it moves basal or ISF. Recurrence is a Wilson lower bound that fuses "how often" and "how sure" into one unified confidence-adjusted rate, measured over each lever's own exposure denominator (meals for meal levers, lows for low levers, correction pairs for stacking, etc.). Because behavioral and settings impact live on the same axis without a hard ceiling, a strong recurring habit can outrank a thin setting change.

### Requirement: Exposure and Cause are different lists; the layer names both.

Exposure is the denominator an episode counts against — "all meals," "all lows," "all correction pairs," "all highs" — paired to each lever by its nature (a meal lever like carb undercount exposes against meals; a low lever like over-treated low exposes against lows). A Pattern groups episodes by their attributed Lever and scores against that lever's exposure. Cause is an internal construct for attribution — the early driver logic that picks the one lever each episode will carry — but a Cause is never surfaced as something a user changes. The recommendation always flows from the attributed Lever, never from the internal cause reasoning.

### Requirement: The layer refuses to assert on insufficient evidence and surfaces why.

No judgment fires without a verdict grounded in data — either observed (a hard fact from the feed, like a bolus of 10 U) or inferred (shape-derived and hedged, like "likely rescue carbs, but we didn't see them"). A classifier never returns "this might maybe be late" — it returns matched=false with the specific silence reason (insufficient data / no trigger / under threshold / upstream cause / prior high baseline / owned by prior bolus / horizon expired). When enough clean windows exist to measure a pattern's rate via Wilson bounds, the bounds are wide enough to name the uncertainty honestly; when data is too thin, the pattern collapses behind an expander so no single rate gets fabricated from noise.
