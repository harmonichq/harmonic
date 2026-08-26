# Design — Diagnose evidence canvas

## ADR 135 — Layout is derived from pin state, and the miniature previews the next state

The evidence canvas never exposes hand-arranged layout: the arrangement is a
pure function of pin count (0 focal, 1 split, 2 pair, 3 one-plus-two, 4 quad),
pinning never changes which chart is focal, and seats fill unpinned positions
only — a surplus seat is dropped, never evicting a pin.

The window bar's pin-cap miniature is a live schematic of the tile field in
the current arrangement's geometry, and it always previews the next state:
when the arrangement has a free cell the dashed hollow cell marks it, and when
every cell is pinned below the cap one appended dashed cell shows that the
next pin grows the arrangement. No hollow cell renders at the cap. Ruled by
the operator (2026-08-25) over the strictly literal miniature: the preview is
the affordance a future pin-placement picker will reuse, so it must not
disappear exactly when the arrangement fills.

## ADR 135 — One shared glucose range per arrangement

Every glucose-valued chart in one arrangement receives the identical y-range:
computed once per arrangement from every displayed glucose value, snapped
outward in 20 mg/dL steps, always containing the 60–200 mg/dL envelope
(`glucoseRange` in `frontend/diagnose-evidence-charts.js`, ported verbatim
from the executed spike). Option builders never fetch and never compute a
range, which is what makes two charts in one quad incapable of sitting on
different scales. This closes #98's measured defect, where a 40–300 axis hid
cohorts spanning 100–160.
