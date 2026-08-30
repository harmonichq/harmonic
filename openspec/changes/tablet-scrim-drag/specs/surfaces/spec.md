## ADDED Requirements

### Requirement: Diagnose clock-window gestures work with direct tablet touch

The Diagnose glucose-by-time-of-day chart SHALL let a wearer use primary touch to
move the whole selected clock window from its scrim interior and to resize either
individual gate. The touch path SHALL preserve the same hit precedence, snapping,
wrapping, edge travel, plot containment, live feedback, and committed scope as the
mouse path. Sliding the scrim SHALL preserve the window width; resizing a gate SHALL
keep the opposite edge fixed. Cancellation SHALL clear transient drag state without
committing an incoherent window. Vertical touch movement SHALL NOT alter the clock
window or obstruct an already-scrollable ancestor, while horizontal drags that
begin in the glucose plot or on a gate SHALL belong to the chart. The shell's
existing no-page-scroll contract SHALL remain unchanged.

#### Scenario: A tablet wearer moves and resizes the selected window

- **GIVEN** a populated Diagnose glucose chart with a non-default clock window at
  a tablet viewport
- **WHEN** the wearer drags inside the scrim with one finger
- **THEN** both gates move together and preserve the selected duration
- **WHEN** the wearer drags either individual gate with one finger
- **THEN** only that gate moves and the opposite edge stays fixed
- **AND** every gesture remains inside the glucose plot and commits the window it
  showed live
- **AND** cancellation clears live feedback without leaving a partial gesture
- **AND** vertical touch movement leaves the clock window unchanged, does not
  obstruct an already-scrollable ancestor, and preserves the shell's existing
  no-page-scroll contract
