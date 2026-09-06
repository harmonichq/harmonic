# Design — Evidence-chart axis names are seated inside their own chart (#360)

## ADR 360 — Anchor a full-rank axis name to its axis rather than relocating it

### Context

The Diagnose evidence canvas paints four of its full-rank axis names outside the
chart box. Measured on the declared no-fetch server at 1440×900, over every
finding row (`evidence/axis-name-seat.before.txt`, exit 1):

| chart | axis | name | overhang |
|---|---|---|---|
| Correction factor · rest windows | y | `glucose change (mg/dL)` | 18px left |
| Correction factor · rest windows | x | `insulin acted (U)` | 43.4px right |
| Carb ratio · meal runs | x | `minutes from first meal` | 72px right |

`FULL_GRID` reserves 34px on each side and runs `containLabel: false`, so ECharts
reserves nothing for a name; the shared `axis()` helper leaves `nameLocation` at
the default `end`, which centres a vertical axis's name on the axis end and hangs
a horizontal axis's name past it.

The tree already holds a working seat for this: two charts set
`nameLocation: 'middle'` with a gap — the basal editorial chart here, and the
inspector's meal chart in `frontend/diagnose-workstation-chart.js`. The obvious
move was to adopt that idiom across the canvas.

### Decision

Keep `nameLocation: 'end'` on the evidence canvas's full-rank axes and anchor the
name to the axis it labels: a vertical axis's name starts at the axis instead of
straddling it, and a horizontal axis's name ends at its own axis end and sits
with its tick labels rather than on the zero rule.

### Why not the `middle` idiom

It was tried against the live chart before this record was written, and it does
not transplant onto this canvas without moving geometry that is deliberate:

- A vertical name at `middle` is rotated and seated a gap out from the axis. At
  a 26px gap it measured at x = −1.2 — still clipped, because this grid's left
  inset is the canvas-wide spine (`GRID.left`, 34px) that exists so a tile's
  numbers begin where the strip's do. Seating it would mean widening that inset
  and breaking the spine alignment for every tile.
- A horizontal name at `middle` measured at y = 443 in a 459px chart, which is
  inside the box but underneath the on-chart legend, whose seat is `bottom: 0`.

The two charts that do use `middle` have neither constraint: the basal chart
carries no legend at that seat, and the inspector chart is not on the canvas
spine. So `middle` is not a shared idiom this canvas declined to adopt; it is the
right seat for a different geometry.

Anchoring, by contrast, measured fully seated with no geometry moved: the
vertical name at x = 34, flush with the spine, and the horizontal name ending at
the axis end and dropping to the plot bottom directly above its own tick labels.

### Consequences

- The seat is expressed once, in the helper both affected builders already
  spread, so the canvas has one implementation of where a name goes rather than
  one per chart.
- The grid, the legend, the spine, the mini rank's nameless axes, and every axis
  name string are all unchanged, which keeps this a placement fix and keeps the
  diff inside one module.
- The rule is measurable rather than eyeballed: the committed driver reports
  every drawn name's overhang and exits nonzero on any, so a later change that
  widens a name or narrows an inset fails loudly instead of shearing a unit off
  a dosing-evidence chart.
- The basal chart keeps its `middle` seat. Two seatings now coexist on purpose,
  and this record is why.
