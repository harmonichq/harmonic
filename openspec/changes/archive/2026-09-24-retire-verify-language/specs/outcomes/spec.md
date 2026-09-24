## MODIFIED Requirements

### Requirement: Trend series show rolling-window glycemic and behavioral movement, with documented uncertainty bounds.

The system SHALL satisfy the following:

The trend is a sequence of equal-width windows (index-aligned oldest to newest) tiling the full selected span. It is `summarize_trend`'s payload, rendered by the CLI's `outcomes-trend` command; `/api/outcomes/trend` serves none of these series, only the watched change. For each window, the payload carries one row per glycemic metric (TIR, TBR, post-meal arc peak/nadir) and one per behavioral exposure (clean rate of meals, lows, etc.). A reader may see that "pre-bolusing improved by 2 meals" or "overnight lows trended down" — the relative direction and the series shape. What a reader *cannot* infer: that the absolute glycemic target is now "good" (no baseline to compare against), or that a setting change *caused* the observed movement (correlation, not causation). The app stamps this limitation explicitly: "Observed movement does not establish that the setting caused it."

#### Scenario: Trend series show rolling-window glycemic and behavioral movement, with documented uncertainty bounds.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies
