# Design — Diagnose canvas pane overprint (#359)

## ADR 359 — The two-pane split gets a measured width floor, and the canvas pane contains its own paint

**Context.** The Diagnose workspace is one grid,
`grid-template-columns: minmax(0, 1fr) var(--side, 430px)`
(`frontend/diagnose-workstation.css:167`), and stacks below
`@media (max-width: 760px)` (`:1677`). `.pane` (`:175-178`) sets `min-width: 0`
but no overflow, so the canvas track may shrink below the canvas pane's own
minimum content width while the pane keeps `overflow: visible` and paints
outside its track.

Measured through the committed browser harness — the suite's own
`openApp(..., { appSource: 'fixture', history: true })` on
`mockups/diagnose-workstation.synthetic/payload.json`, height 1024, no server:

| viewport | canvas pane right edge | pane minimum content | visibly spilling descendants | first queue rows own their hit point |
|---|---|---|---|---|
| 760 | stacked | — | 0 | yes |
| 761 | 331 | 402 | 46 | no (a chart canvas answers) |
| 768 | 338 | 402 | 41 | no (a chart canvas answers) |
| 800 | 370 | 402 | 29 | no (chart controls answer) |
| 830 | 400 | 402 | 3 | yes |
| 832 | 402 | 402 | 2 | yes |
| 900 | 470 | 470 | 0 | yes |
| 1024 | 594 | 594 | 0 | yes |

The canvas pane's minimum content width is furniture-driven and constant at
402px across the band: the header's own controls, not its title, set it — the
title already truncates under the 2026-08-19 ledger ruling. Beside the fixed
430px inspector column, the split therefore needs about 832px before it holds
its own content.

**Decision.** Two rules, each answering a different half of the defect.

1. **The split gets a floor.** The stacking breakpoint moves up to the measured
   width, so no viewport can produce a split whose canvas track is narrower than
   the canvas pane's own furniture. Below it, the narrow layout that already
   ships takes the whole band; it already sets `overflow-x: hidden` on the
   canvas pane and gives the controls touch-sized targets.
2. **The canvas pane contains its paint.** `overflow-x: clip` at every width, so
   a future furniture change or a content-driven overflow clips inside the
   canvas rather than painting over the inspector. This is earned, not
   precautionary: two elements still paint past the boundary at the first split
   width above the new floor.

**Rejected: containment alone.** Clipping without moving the floor was measured
first and is a worse surface, not a fix. With `overflow-x: clip` injected at
768px the queue rows recover their hit points, but the canvas header's own
controls sit at x≈385-402 — outside the 338px track — so they become invisible
and unclickable: a Playwright click on **All charts** at 761 and 768px is
intercepted by the inspector and times out. The reader would lose the chart
catalogue rather than gain a readable queue. Containment is the backstop; the
floor is the fix.

**Rejected: leaving 761-830 as a split and truncating harder.** Truncation
already governs the header's text (2026-08-19). What overflows here is
furniture, and shrinking a chart pane below its own controls to preserve a
side-by-side arrangement trades a usable layout for a symmetrical one.

**Accepted cost.** A desktop window between the old and new thresholds now
stacks, with the narrow layout's touch-sized controls. That layout is designed
and tested; the split it replaces was not usable at those widths.

**Verify is out of it.** `frontend/diagnose-workstation.css` is loaded on every
screen, and the widened media block contains exactly one `.vw`-affecting rule —
`:is(.dw, .vw) .panes > .pane + .pane`, which flips the inter-pane border from
left to top. That rule keeps its 760px bound so Verify renders identically;
Verify stacks on its own 900px breakpoint in `frontend/verify-workstation.css`
and its replay's S7 story runs at exactly 800px, inside the band this change
moves.

**Why a hit test and not a rectangle.** A clipped element still reports its
unclipped bounding box, so `getBoundingClientRect` comparisons pass on the
broken surface and keep passing on the fixed one. `document.elementFromPoint`
inside the row's own box is the assertion that distinguishes them, and it is
the measurement the ticket's reproduction used.

**Consequence for the ledger.** `mockups/finding-evidence-routing.behavior.md`
asserts (2026-08-19) that the canvas header "stays one line at every width the
two-pane split can produce". That sentence was true and empty: the header did
stay one line, wider than its column. Giving the split a floor is what makes it
load-bearing, and the amendment records that.
