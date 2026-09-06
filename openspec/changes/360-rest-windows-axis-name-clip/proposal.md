# Evidence-chart axis names are seated inside their own chart (#360)

## Why

The Diagnose evidence canvas names the units on every full-rank chart, and on
two of the four kinds those names are painted outside the chart and clipped away.
On the declared no-fetch server, at 1440×900, walking every finding row in the
queue reports four clipped names and no seated failure
(`evidence/axis-name-seat.before.txt`):

- `Correction factor · rest windows` loses the head of its y-axis name: the
  reader sees `ose change (mg/dL)` because 18px of `glucose change (mg/dL)` is
  painted left of the chart's own left edge.
- The same chart's x-axis name `insulin acted (U)` overhangs the right edge by
  43.4px, so its last glyphs are sheared.
- `Carb ratio · meal runs` overhangs worse: `minutes from first meal` runs 72px
  past the right edge, on both the ranked I:C row and the watched one.

The cause is one seating rule, not four defects. `FULL_GRID` runs
`containLabel: false`, so nothing reserves room for axis furniture, and the
shared `axis()` helper leaves `nameLocation` at the ECharts default of `end` —
which centres a vertical axis's name on the axis end and hangs a horizontal
axis's name off it. A name wider than the grid's 34px insets is therefore
painted into space the chart does not own.

The file already records this exact failure being fixed twice, both times for a
narrower case: the mini rank drops the name outright because
`"glucose change (mg/dL)" is wider than a cell's whole plot`, and the name's own
type rank came down when it sat above the grid's top and was cut off. The full
rank never got the same treatment. The basal chart is the one that did — its
x-axis name is set to `nameLocation: 'middle'` and measures fully seated — so
the canvas today asserts one unit label legibly and three illegibly.

This misleads a reader of advisory evidence: a chart whose y-axis reads
`ose change (mg/dL)` names no unit at all, and the correction-factor tile is
where a wearer reads dose against glucose response.

## What changes

- **Every axis name the evidence canvas draws at full rank is seated inside its
  own chart box.** The names themselves are unchanged — `glucose change
  (mg/dL)`, `insulin acted (U)`, `minutes from first meal`, `meal start`,
  `Carb ratio (g/U)`, `mg/dL` all keep their exact strings — and the fix is to
  where they are painted, not to what they say.
- **One seating rule, applied where the module already shares one.** The
  correction-factor and carb-ratio charts read the same `axis()` helper, so the
  seat is expressed once rather than patched per builder. Both of each chart's
  modes are covered, not only the mode the queue opens by default.
- **Nothing else on the canvas moves.** The grid keeps the canvas-wide spine
  inset and the right inset it reserves for the last axis label, the legend keeps
  its seat, the mini rank keeps carrying no axis name at all, and the basal
  chart's already-seated name stays where it is.

## Boundaries

Frontend only, and inside the Diagnose evidence canvas only. No analyzer,
projection, endpoint or payload change; no safety verdict, floor, threshold or
direction is read, re-derived or gated on. No axis name string changes, no new
chart, no new module. The glucose-by-time-of-day strip is a different module and
is untouched. The behaviour ledger's terms are unchanged: no story asserts or
depends on where a name lands, and this change restores the names the builder
already sets rather than adding behaviour.
