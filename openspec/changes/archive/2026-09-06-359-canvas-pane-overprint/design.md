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

**Verify is out of it — by splitting that rule, not by pinning it.**
`frontend/diagnose-workstation.css` is loaded on every screen, and the widened
media block contains exactly one `.vw`-affecting rule,
`:is(.dw, .vw) .panes > .pane + .pane`. Only its `border-top` half is live. The
`border-left: 0` beside it is inert: `frontend/theme.css:150` restates
`border-left: 1px solid var(--wk-rule)` for the identical selector at identical
specificity and loads after the Diagnose sheet (`frontend/index.html:1344`
against `:23`). Measured on the unchanged tree, the second pane's computed
`border-left-width` is `1px` at 760, 800, 900 and 1024px on both screens, inside
the media block as well as outside it. Describing the rule as a "border-left to
border-top flip" is half wrong, and the carve-out must not be reasoned from it.

Pinning that whole rule at 760px would be a new defect. The `border-top` it
draws is the stacked layout's only horizontal divider, so Diagnose between 761
and 831px would stack with no line between the panes it has just stacked —
measured on the unchanged tree, the second Diagnose pane computes
`border-top-width` `1px` at 760px and `0px` at 761, 800, 830, 831, 832 and
900px, so a pinned rule leaves the whole newly stacked band reading `0px`. The
rule is therefore **split**: `.dw .panes > .pane + .pane` travels into the
widened block and keeps Diagnose's seam wherever Diagnose stacks, and a
`.vw`-only copy of the same declarations, verbatim, stays behind in its own
`@media (max-width: 760px)` block. Splitting rather than editing is what makes
the carve-out auditable — nothing but the selector changes — and the inert
`border-left: 0` is carried along rather than cleaned up, because removing it
would be a second, unrelated edit to the Verify-facing copy.

Verify's rendering is then unchanged by construction, and the measurement says
what is being preserved: on the unchanged tree Verify's second pane reads
`border-top-width` `1px` at 760px and `0px` at 800, 900 and 1024px, with
`border-left-width` `1px` throughout. Verify already stacks from 900px down on
its own `frontend/verify-workstation.css:225` breakpoint, so between 761 and
900px it stacks with no seam today. That is a pre-existing Verify quirk;
preserving it exactly is this ticket's business, fixing it is not.

**The Verify replay could not see any of that, so it gains one assertion.** The
replay's S7 story runs at exactly 800px, inside the band this change moves, but
it asserts only that the inspector's box sits below the canvas pane's box and
that `.main-content` scrolls
(`frontend/verify-660-story-behavior.replay.mjs:225-239`). Both hold whether or
not the shared rule was widened, because Verify's own 900px breakpoint had
already stacked it — the one rule that can reach `.vw` is invisible to the story
offered as its guard, and a hand-split selector is exactly the edit most likely
to get it wrong. S7 therefore gains one assertion on the second pane's computed
`border-top-width` (must stay `0px`) and `border-left-width` (must stay `1px`),
so the carve-out is observed rather than asserted.

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

**Shipped threshold: `@media (max-width: 831px)`, from the measurement below.**
Re-measured at implementation through the same fixture harness
(`openApp(..., { state: 'typical', history: true, appSource: 'fixture' })` on
`mockups/diagnose-workstation.synthetic/payload.json`, height 1024, no server),
before and after the change:

| viewport | canvas pane right edge (before) | pane minimum content | stacked after | second Diagnose pane `border-top-width` before → after |
|---|---|---|---|---|
| 760 | stacked | — | yes | `1px` → `1px` |
| 761 | 331 | 402 | yes | `0px` → `1px` |
| 768 | 338 | 402 | yes | `0px` → `1px` |
| 800 | 370 | 402 | yes | `0px` → `1px` |
| 830 | 400 | 402 | yes | `0px` → `1px` |
| 831 | 401 | 402 | yes | `0px` → `1px` |
| 832 | 402 | 402 | no | `0px` → `0px` |
| 900 | 470 | 470 | no | `0px` → `0px` |
| 1024 | 594 | 594 | no | `0px` → `0px` |

The inspector column measures a constant 430px and the canvas pane's minimum
content a constant 402px across the band, so 832px is the narrowest viewport the
split can hold and 831px is the widest that must stack. The `border-top-width`
column is what separates a split selector from a pinned one: a pinned rule would
have left the whole newly stacked 761-831px band reading `0px`, and it reads
`1px`.

The containment backstop is proven the same way the defect was, by hit test
rather than by rectangle. At 832px four descendants still report unclipped boxes
reaching x=422 against a pane whose right edge is 402 —
`span#rd-p-n.rd-pair`, `span#rd-n.v` and the two-element `b.t` pair in the pane's
footer — but with `overflow-x: clip` in place `document.elementFromPoint` at
x=408 over each of them returns `div#level.level` and `div#watch-dock.watch`,
neither of which is inside the canvas pane. The pane's computed `overflow-y`
stays `visible`, confirming that `clip` did not force a scrollport the way
`hidden` would have.

The regression case brings each row into view before it hit-tests, and that is
a measurement too. The findings queue is its own scrollport — `#level` computes
`overflow-y: auto` — and the stacked layout hands it far less height than the
split does: at 800px the port is 251px tall over 452px of rows, so the second
row begins below its own fold and a point at its midpoint lands on the watch
dock beneath the queue rather than on any pane. That is a scroll position, not
another pane's paint, and reading it as overprint would have made the case fail
on the fixed surface for a reason the defect has nothing to do with. Scrolling
each row into its port first leaves the case red on the unchanged stylesheet at
exactly 761, 768 and 800 — `canvas`, `canvas`, then `button.tile-pin` and
`span.tile-rail` — so the horizontal defect is still what the case measures.
