# Design — Diagnose Dark tonal ladder (#255)

## ADR 255 — One warm ladder owns Dark material depth

**Decision.** Dark derives the desk, chart well, chart field, pane sheet, rail,
rules, edges, and inks from the operator-approved ladder recorded in issue #255.
The app (`--wk-*` and compatibility tokens), chart (`--mk-*`), and cockpit
(`--ck-*`) namespaces express roles from that ladder rather than independent
palettes. The desk remains `#0f0d0b`; the ordered anchors are chart well
`#14120f`, field `#1e1a17`, sheet `#221e1b`, rail `#2b2622`, quiet rule
`#3f3833`, edge `#453d35`, and inks `#f2ede2` / `#cfc8bd` / `#a49c90` with nav
ink `#c6bfb3`. Burnt orange remains interaction/high signal and forest green
remains data-only.

**Why.** The current independently tuned namespaces place most Dark grounds
within a few lightness points and invert the well/sheet relationship. One
ordered ladder makes the role relationship inspectable and prevents namespace
drift without creating another design system.

**Sanction.** Connor Griffin, issue #255, 2026-08-29: operator-approved live
prototype, warm direction selected over neutral and evergreen.

## ADR 255 — Spotlight elevation is shadow-only

**Decision.** Rescind the Dark spotlight plate that mixes the rail toward text.
The spotlight, fullscreen chart, and explorer chart sit on the shared chart well;
only the existing shadow distinguishes spotlight rank. The one-shadow rule
continues to forbid a second elevation tier.

**Why.** The lifted plate is the grey canvas the operator rejected. Rank remains
visible without turning the chart ground into a brighter material.

## ADR 255 — Vessel edges do not borrow gridline ink

**Decision.** Rescind the `--ck-hair` / `--ck-tile-edge` alias to `--mk-line` for
chart vessels. Gridlines remain quiet; every chart vessel gets one 1px
`#453d35` ring and 4px radius. The focal vessel differs by shadow only. The
glucose vessel runs flush into the Findings divider, and header rules do not
double the vessel's top seam.

**Why.** Gridlines must recede inside a plot while vessel edges must separate
adjacent materials. One ink cannot do both jobs on the new Dark well.

## ADR 255 — Dark wells sit below sheets

**Decision.** Rescind the Dark mapping in which `--wk-surface-sunken` is lighter
than `--wk-surface`. Wells and fields are darker than pane sheets. The hero
glucose chart and basal slots share one vessel because they share an x-axis;
their key is a body-ink caption, not a separate card. Findings shares the hero
well ground so the two linked control surfaces read as one instrument.

**Why.** A lighter “sunken” value makes charts float and turns the workstation
into stacked grey plates.

## ADR 255 — Glucose targets are boundary rails, not filled slabs

**Decision.** Rescind the filled 70–180 mg/dL `markArea` in the named Diagnose
evidence charts and the existing desktop Day chart builder. Render dashed 70 and
180 rails using the established hero-chart grammar. Do not change range values,
data, labels, or the separate mobile Day hero builder.

**Why.** On a true dark well the translucent fill reads as another grey material
rather than as a reference range. Rails state the same boundary without covering
the evidence.

## ADR 255 — Overlapping meal runs remain strands

**Decision.** Rescind the additive `.48` / `.28` meal-run opacity pair in the
carb-ratio evidence chart. Use the operator-approved `.34` / `.20` pair while
preserving solid/dashed membership, symbols, ordering, and data.

**Why.** The prior alpha blooms where runs overlap and makes density look like a
filled region. The lower pair keeps individual paths readable.

## ADR 255 — Dock materials derive from roles, not issue literals

**Decision.** Rescind the `#161311` and `#1b1816` Diagnose dock literals inherited
from #215. The canvas, pane header, Findings, chart tray, and CHARTS handle derive
from the ladder's well/field/sheet/rail roles. The tray owns the inset ring; the
handle owns the rail treatment that caps it.

**Why.** Literals from an earlier canvas round preserve the old ladder after the
theme source moves and recreate per-surface drift.

## UI Craft revision provenance

- **Base:** generated fact F1.
- **Safe-start declaration and synthetic source:** generated fact F2.
- **Surface contract:** `mockups/finding-evidence-routing.behavior.md` with
  `frontend/diagnose-workstation-behavior.replay.mjs`.
- **Route:** UI Craft `revise` (`shipped`, `runnable`, complete declaration,
  synthetic data source).
- **Prototype authority:** issue #255's operator-approved live prototype. The
  prototype's uncommitted control-checkout edits are not an implementation input;
  the issue's recorded decisions and current ticket base are.

## Current-base reconciliation

Generated facts F1 and F3 show that this ticket starts after #256. Its
selection-independent basal paint, passive-state distinctions, and final-pixel
chart legibility remain binding. Issue #255 changes material hierarchy around
them; it does not revert their semantics or browser protections.

Generated facts F4–F6 identify the two extract paths. The finding-evidence
exploration consumes the live stylesheets and has a source-owned inline extract;
its existing check remains required. The evidence-canvas exploration contains a
hand-maintained “verbatim” theme block in its template and a generator that only
compares the template to its generated HTML. This change must make shipped-source
drift fail closed before regenerating the artifact.

## Evidence contract

Use the exact no-fetch server and generated synthetic database from F2. Capture
the same populated Diagnose states on the base and revision at the wide desktop
geometry already used by the adjacent #253/#256 evidence, in Dark. Cover the
opening focal chart, the shared hero/basal vessel, the Findings boundary, docked
charts, raised/hidden/mounted dock treatments, fullscreen, explorer, and the
carb-ratio meal-run chart. Record commands, dimensions, synthetic provenance,
browser-console result, and a visual verdict. Light is a non-regression check,
not a retheme evidence target.

No frozen behavior story changes are intended. Replay the existing ledger
unchanged against base and revision; if implementation discovers a behavior
change is necessary, stop and return to triage rather than silently amending it.
