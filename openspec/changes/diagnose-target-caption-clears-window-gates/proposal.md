# The target caption clears the drawn-window gates (#370)

## Why

On Glucose by time of day, the target band carries a knock-out caption reading
`TARGET 70–180 mg/dL`. The chart module states the rule it is built to
(`frontend/diagnose-workstation-chart.js:1026-1032`): *"A label must never be
struck by linework."* Two crossers were accounted for — the dashed 180 rule the
caption sat on, and the 3-hourly gridlines — and both are drawn into the ECharts
canvas, so the caption's opaque pad in the panel's ground colour visibly breaks
them.

A third crosser was never accounted for, and the pad cannot defeat it. The
drawn-window brace is a **DOM overlay**, not canvas: `.brace` is an absolutely
positioned layer at `z-index: 4` over the chart element, carrying a
full-plot-height 1px `.edge` line at each window gate and a 7×22px **opaque**
`.grip` pill centred on it. Being a DOM sibling painted above the canvas, it wins
against every ECharts `z` unconditionally.

The result is a wrong clinical number rather than obviously-broken glyphs. On the
Overnight preset — which is pressed on cold load — the 06:00 gate lands inside the
caption and its opaque grip hides the final `0`, so the caption reads
**`TARGET 70–18 mg/dL`**: a plausible upper bound a reader has no reason to
discount.

Measured against the sweep's shared synthetic revise-e2e server, the collision is
horizontal. The caption is anchored to the plot's left edge and its
glyph run is a fixed ~99px; the second gate's x moves with the plot's width:

| viewport | chart width | gate B x | caption glyph run | struck |
|---|---|---|---|---|
| 390 | 390 | 110.8 | 39–137.8 | yes |
| 768 | 399.6 | 113.2 | 39–137.8 | yes |
| 900 | 470 | 131.0 | 39–137.8 | yes |
| 1100 | 670 | 181.5 | 39–137.8 | no |
| 1440 | 1010 | 267.4 | 39–137.8 | no |

`docs/scope/target-caption-overprint.spike.mjs` regenerates that table from the
chart module's own exports, and it reproduces the reported boundary exactly.

The vertical overlap is width-independent and is what makes the grip — rather
than only the hairline edge — the crosser: the grip band is pinned at chart-local
y 42–64 (`paintBrace`'s `gripTop = plotTop + 22`, `.grip` 22px tall) while the
caption sits at 57.3–69.3 whenever the axis tops out at 220. On a dataset whose
axis reaches 260 the caption drops to 74.7–86.7 and clears the grip band, which is
why the same widths do not reproduce it there. The defect is a function of the
axis maximum and the plot width together, not of the data.

The Overnight preset is where a reader meets this on cold load, but it is not
the only window that strikes, and the sideways room runs out before the widths
do. Sweeping every window the brace can draw, the worst case is an entirely
ordinary daytime one: at 390px with the 08:00–16:00 window `[480, 960]` the plot
box is `{left: 34, width: 304}`, the gates land at 136.40 and 238.80, and once
each grip's opaque half-width is removed the plot is carved into clear regions of
98.4 / 94.4 / 95.2px — against a caption box of 108.8px
(`estimateTextPx('TARGET 70–180 mg/dL', 10)` = 98.8px plus `padding: [2, 5]`).
**No horizontal slot fits.** At the 768px viewport, where this layout gives the
chart 399.6px, the largest region is 101.6px and none fits either. Sliding the
caption sideways is therefore not a fix: at two of the five
evidence widths, on a window a reader can draw with the grips the frozen ledger
pins, there is nowhere sideways to go.

## What changes

- **The caption keeps its shipped placement and gains a vertical escape.** It
  stays the band's top-left knock-out caption exactly as today whenever no gate
  would strike it — every width at or above ~1100px on Overnight, and every
  window whose gates fall clear — so the shipped look, and every description of
  it, is unchanged where it is already correct. Only when a drawn gate would land
  inside the caption's glyph run does the caption move, and then it moves *down*,
  not sideways.
- **Down, because that axis cannot run out of room.** The occluder is
  height-pinned: `paintBrace` sets `gripTop = Math.min(plotTop + 22, …)` with
  `PLOT_TOP = 20` and `.grip` is 22px tall, so the opaque grip band never reaches
  below chart-local y 64 at any width or any window, while the target band's own
  floor sits near y 122. A caption whose box top lands at or below y 64 clears
  every grip unconditionally, with no dependence on how much horizontal room the
  window happened to leave. The residual crosser at that position is the 1px
  `.edge` — a hairline across the glyphs rather than a hidden digit, so it cannot
  produce a wrong number — and it is accepted rather than chased.
- **The module decides when to move from the gate geometry it already owns.**
  `paintBrace` places both gates with `xAtMinute`, which this chart module
  exports; `renderCanvas` already receives the same window range and pan offset
  the brace draws from. The predicate therefore reuses the module's own
  `plotBox` / `xAtMinute` / `estimateTextPx` idiom — the same fit-or-move
  reasoning the window label already uses a few lines above — and introduces no
  second copy of the overlay's geometry.
- **The rule comment is corrected.** The comment enumerating the two crossers now
  names the third and says why the pad cannot answer it, so the next reader does
  not re-derive that a DOM overlay outranks a canvas `z`.

## Boundaries

Frontend only, and one module: the target-band caption inside `renderCanvas`.
No backend, projection, endpoint or payload change, and no frontend gate that
re-derives a backend verdict (`AGENTS.md`, "Safety invariants").

The brace overlay is **not** touched. Its grips are pinned by frozen
behaviour-ledger row P02 (two grab handles, 7×22, `title="Drag to resize"`), and
P16 and P56 pin its re-seating and its two-edge draw; moving them is an
unsanctioned change to a frozen contract, and they live in a Vue component no node
test loads. The fix belongs to the label that must clear, not to the furniture it
must clear.

The Verify surface's identical caption
(`frontend/verify-workstation-chart.js:108`) is out of scope: that surface draws
no brace, so the crosser does not exist there. Sibling ticket #366 (the window
label parked off the plot) touches the same file's `markPoint` and is triaged
separately.
