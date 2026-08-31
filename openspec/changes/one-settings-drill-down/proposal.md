# Proposal — one drill-down for every settings chart

## Why

Opening a setting from its findings-queue row reaches that parameter's own panel
— current, estimate, interval, recommended, the served verdict word, the support
count, the analyzer's sentence, and the staging control. Clicking that same
setting's evidence chart reaches somewhere else: a generic chart level whose thin
readout prints three counts and a flat roster, shared by basal, correction factor
and carb ratio alike.

So one gesture means two things, and the chart click is the one that loses the
verdict. A reader who arrives at a setting by its evidence rather than by its rank
is shown less about it, for no reason they can see.

## What changes

- Every settings evidence chart opens the same panel its findings-queue row
  opens: the basal slot panel, the correction factor level, the carb-ratio block
  panel. This extends the routing the behavioral branch already uses — look the
  row up by the chart's own identity and take the row route — rather than adding
  a third path.
- A settings-chart click stays one level deep. Clicking a chart while another
  parameter's panel stands replaces that level instead of stacking under it, the
  rule the behavioral branch already holds.
- Each parameter's chart route inherits its row route's clock-window behavior
  unchanged: a drawn brace is released for basal and carb ratio, whose panels
  carry their own span, and kept for correction factor, which has none.
- The thin chart evidence readout is retired, along with the styles and level
  metadata nothing else reaches. The generic chart level itself stays: the
  behavioral placeholder still uses it.

## Boundaries

Frontend only. No analyzer, projection, endpoint or payload change. The frontend
re-derives no floor, threshold, direction or safety verdict on the new route; it
reads the backend's `safety_status` / `asserts_move` exactly as the row route
already does. Which parameters release a drawn clock window is not re-decided
here. #291's panel redesign builds on the panel this leaves behind and lands
after it.
