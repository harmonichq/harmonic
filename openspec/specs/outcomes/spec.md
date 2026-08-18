# Outcomes

## Purpose

The outcomes layer surfaces two stories side by side: *how the user is doing right now* (the glycemic panel and clean rates over a selected flat window) and *whether a recent setting or behavior change is working* (a watched Trial or Focus, and trend series showing pre-change and post-change. It is independent of Harmonic's own analysis; it reads the glycemic data and the scenario engine's own lever attribution to show observed glycemic quality and whether changes are tracking in the right direction.

## Requirements

### Requirement: Outcome summary reports glycemic metrics and derived clean rates over a single flat window.

The summary is one snapshot over a user-selected window (14, 30, or 90 days) — not a trend, not indexed to prior windows. It reports two layers. *Metrics* are the 2019 consensus glycemic panel: Time in Range (70–180 mg/dL), Time Below Range at two levels (<70 and <54), Time Above Range at two levels (>180 and >250), mean glucose, GMI (A1c-analog), and coefficient of variation. The panel is honest about data quality: when coverage falls below the consensus gate (≥14 days AND ≥70% CGM active), it computes over the *real* span and labels the shortfall as "12 days @ 61%" rather than fabricating a representative number. *Clean rates* are derived "wins" — the fraction of each behavioral exposure (meals, lows, correction clusters, highs) that drew *no* negative lever attribution, inverse to the pattern rates. Clean rates carry Wilson confidence intervals so a thin meal count surfaces a wide range instead of a false precision.

### Requirement: Watching a change means auto-detecting a Trial or pinning a Focus, moving through phases until resolution.

A **Trial** is a pump-programmable setting (basal slot, ISF, I:C, target, or whole-profile) the user has changed and the system auto-detects from the settings snapshot diff or dense feed. A **Focus** is a behavioral lever the user pins by hand. Both enter a *Maturing* phase while post-change data accrues, then *complete* and are ready to judge. The app enforces exactly one active watched change: a Trial takes precedence, and launching one mid-Focus preempts and drops the Focus (the drop is real — the user re-pins if the intent still holds). Resolution happens when the Trial completes post-data accrual or when the user resolves the Focus manually.

### Requirement: Verdict availability is gated on data accrual, not model sufficiency.

A Trial is *Maturing* while the target metric's post-change **data-day** accrual is incomplete — not calendar days, but actual data days. An I:C trial (target = post-meal arc) matures on meal days; a TIR trial on CGM days. A meal-less stretch keeps the Trial maturing rather than prematurely trusting a delta the data cannot support. Once the rolling window's worth of post-change data days are observed, the Trial moves to *complete* and is ready for a before/after read — the verdict that the change helped (or didn't) can only be formed then. A Focus has no data gate; its adherence is tracked by re-running the same behavioral detector that raised the lever, and its outcome reads off the existing clean-rate series.

### Requirement: Trend series show rolling-window glycemic and behavioral movement, with documented uncertainty bounds.

The trend is a sequence of equal-width windows (index-aligned oldest to newest) tiling the full selected span. For each window, the payload carries one row per glycemic metric (TIR, TBR, post-meal arc peak/nadir) and one per behavioral exposure (clean rate of meals, lows, etc.). A reader may see that "pre-bolusing improved by 2 meals" or "overnight lows trended down" — the relative direction and the series shape. What a reader *cannot* infer: that the absolute glycemic target is now "good" (no baseline to compare against), or that a setting change *caused* the observed movement (correlation, not causation). The app stamps this limitation explicitly: "Observed movement does not establish that the setting caused it."
