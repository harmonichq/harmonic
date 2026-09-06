# Evidence-chart axis names are seated inside their own chart (#360)

## Why

The Diagnose evidence canvas names the units on every full-rank chart, and the
correction-factor chart paints both of its names outside the chart box, where the
container clips them away. Measured on the branch's declared no-fetch QA server
at 1440×900, walking every finding row in the queue and every alignment a tile
publishes, three drawn names leave their box and none of the seated ones move
(`evidence/axis-name-seat.before.txt`, exit 1):

- `Correction factor · rest windows` loses the head of its y-axis name in **both**
  alignments: the reader sees `ose change (mg/dL)` because 18px of
  `glucose change (mg/dL)` is painted left of the chart's own left edge.
- The same chart's x-axis name `insulin acted (U)` overhangs the right edge by
  43.4px in event alignment, so its last glyphs are sheared.

The cause is one seating rule, not two defects. `FULL_GRID` runs
`containLabel: false`, so nothing reserves room for axis furniture, and the
shared `axis()` helper leaves `nameLocation` at the ECharts default of `end` —
which centres a vertical axis's name on the axis end and hangs a horizontal
axis's name off it. A name wider than the grid's 34px insets is therefore
painted into space the chart does not own.

That helper is spread by the carb-ratio builder too, on both of its alignments,
so the same seat is what `minutes from first meal`, `meal start` and
`Carb ratio (g/U)` inherit. No finding row on the QA database renders a
carb-ratio evidence chart, so this change claims no measurement for those names;
it fixes them by writing the seat once, where the module already keeps one, and
checks them through the builder rather than through the capture.

The file already records this exact failure being fixed twice, both times for a
narrower case: the mini rank drops the name outright because
`"glucose change (mg/dL)" is wider than a cell's whole plot`, and the name's own
type rank came down when it sat above the grid's top and was cut off. The full
rank never got the same treatment. The basal chart is the one that did — its
x-axis name is set to `nameLocation: 'middle'` and measures fully seated — so
the canvas today asserts one unit label legibly and its correction-factor
neighbour illegibly.

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
  seat is expressed once rather than patched per builder. Both alignments of
  each chart are covered, not only the one the queue opens by default.
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
