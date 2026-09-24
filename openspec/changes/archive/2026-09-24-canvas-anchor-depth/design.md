# Design — canvas-anchor-depth

## ADR 215 — The strip and Findings are anchors; the tile field is the only inset

**Ruling.** On the Diagnose canvas the glucose-by-clock strip and the Findings
pane bleed to the canvas edges, carry no radius, edge ring or shadow, and are
divided by the theme's own hairline. The machined-edge idiom — 1px inset edge
ring, faint top highlight, pooled shadow — belongs to the tile field and its
tiles alone, and the tile field's padding is the only gap between a panel and a
canvas edge.

### Context

The canvas revision recorded with #135 gave both panes the machined edge and
floated them on a gutter of trench. That made two things true at once: the panes
became visual peers of the tiles they contain, and every surface on the canvas
sat at one depth. Nothing said "this is the ground you read from, and that is a
tray of evidence seated below it".

### Decision

Depth is spent once, on the level that is actually subordinate. `.panes` loses
its gutter and its outer padding, so both anchors run to the edges; the panes
lose the ring, radius and shadow; the tile field keeps its inset padding, its
trench substrate and gains an inset top shadow so the step below the strip is
lit rather than merely darker.

With the gutter gone the two anchors abut, so the seam returns to theme.css's
own `.panes > .pane + .pane` hairline. The `#135` block therefore declares no
`border` at all — a higher-specificity `border: 0` there is what silently
removed the divider in the first build of this change.

### Consequences

- The idiom's tokens (`--ck-tile-edge`, `--ck-tile-top`, `--ck-tile-shadow`) now
  have exactly one consumer, `.evidence-tile`. Do not restore a second.
- Verify's `.vw` dock and any `.dw` with no tile field are untouched: the rules
  stay scoped by `.dw:has(.tile-field)`.
- The dark tile field takes `--wk-canvas` rather than `--ck-trench`. Dark's
  settled sunken token is LIGHTER than the panel it recesses into, which is
  right for the instrument rail's schematic cells and the Charts drawer and
  wrong for a substrate that must read as the floor. `--ck-trench` itself is not
  re-pointed, because those two surfaces and their ink (`--ck-trench-quiet`) are
  derived from it.
- Light needs no such exception: its trench is already the darker of the two.

## ADR 215 — The dark grounds are one hue family at deliberately low chroma

**Ruling.** Every dark ground and rule is derived at a single hue (OKLCH 60°)
with chroma rising from .005 at the deepest ground to .015 at the strongest
rule, each value holding its ORIGINAL lightness to three decimals. Term 12's
warm family stands; what changes is that it is now measurably one family.

### Context

Term 12 describes one warm hue family. Measured, the shipped dark grounds sat at
chroma .003–.009 with the hue wandering 48° to 78° across the set — nearly
achromatic AND incoherent, which is why the frame read as dirty grey rather than
as a warm desk one step from black.

### Decision

Re-derive the whole set from one hue, and hold every lightness. Depth on this
surface is made of lightness steps, the top highlight and the pooled shadow, so
a change confined to hue and chroma cannot move the tonal range, the stacking
order, or a contrast ratio: every ink/ground pair in `frontend/index.html` and
`frontend/theme.css` holds to within .05, re-measured.

The ceiling on chroma is a review finding, not caution. Three settings were
built and looked at in the running app:

- **80°, chroma .011–.028** — the light theme's own ground register. Rejected:
  at that chroma the desk shares the burnt-orange signal's family and the whole
  frame reads as pumpkin.
- **110°, chroma .008–.024** — stone, chosen to step the hue off orange.
  Rejected: it reads olive. This is term 10's phosphor warning arriving from the
  ground rather than from the line, and it is the strongest evidence that term
  10 is about the whole surface, not only about a green line on a green-black.
- **265°, chroma .008–.023** — slate, complementary to the signal and nowhere
  near the forest greens. It solved both failures and was rejected as a bigger
  identity change than this canvas is entitled to make.

What all three agreed on is that the family must be coherent; how much chroma it
carries is a small dial, and the setting that survived review is a low one.

### Consequences

- Term 11 is intact: this is chroma on the grounds at the register light already
  uses, not chroma on the marks. The inks, signals and chart marks are untouched.
- The measured ratios quoted in `theme.css` comments were re-measured; one moved
  (the cockpit bar's signal on its panel, 5.07:1 → 5.05:1) and was corrected.
- Two mockups embed this palette and are generated artifacts:
  `diagnose-evidence-canvas.exploration` (its template carried a hand-written
  copy of the dark tokens, which was stale and is now synced) and
  `finding-evidence-routing.exploration` (extracts `index.html` directly). Both
  were regenerated in this change and both `--check` guards pass.
- Slate remains the live option if the desk is ever allowed a bigger identity
  change; it is the only one of the three that leaves both the orange signal and
  the forest marks entirely alone.
