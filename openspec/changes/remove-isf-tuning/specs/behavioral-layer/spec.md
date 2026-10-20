## MODIFIED Requirements

### Requirement: Behavioral and settings levers rank on a single 0–100 Priority axis.

The system SHALL satisfy the following:

Both flavors compose Priority identically as `100 · √(impact · recurrence)`, a geometric mean where one weak factor drags the score low. Behavioral impact is the hypo-weighted effect size of the bad outcome (0–1 range); settings impact is insulin-unit currency — basal and I:C changes priced through a shared soft-saturation curve so a 0.3 U/day move reads the same impact whether it moves basal or the carb ratio. Recurrence is a Wilson lower bound that fuses "how often" and "how sure" into one unified confidence-adjusted rate, measured over each lever's own exposure denominator (meals for meal levers, lows for low levers, correction pairs for stacking, etc.). Because behavioral and settings impact live on the same axis without a hard ceiling, a strong recurring habit can outrank a thin setting change.

#### Scenario: Behavioral and settings levers rank on a single 0–100 Priority axis.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies
