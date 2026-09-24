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

## ADR 135 — A drill seats its own evidence, and the field's order is the reader's

Amends the layout ADR above on one term only. "Focus changes on a click on a
slot chart and on nothing else" was written when the field held one chart per
parameter and the only way to change what you were reading was to click it.
A behavioural window publishes one comparison per finding, and the live repro
that opened this fix round showed the cost: with the 24 h window and a
behavioural finding top-ranked, the field carried several look-alike comparison
tiles, the drilled finding's own comparison was not among the seated ones, and
the inspector was reading one factor while the field showed another. Ruled by
the operator (2026-08-26): **drilling seats.** Whatever the inspector is reading
takes the focal seat and wears a visible drill mark. Pinning is unchanged and
still never moves focus.

Two consequences make the seat honest rather than merely occupied. The seat
ORDER is now persistent reader state, not a value re-derived per paint: a focus
swap returns the reordered candidate list and the surface keeps it, so the
demoted chart lands in the seat the reader took the new one from — every source
slot, not slot 1. And at the narrow breakpoint the reading order leads with the
focal tile and only then follows pin order, because a linearized field whose
first chart is not the one being read is the same defect in one column.

The registry entry, not the layout module, decides which findings row it draws
and what that tile is called. A second hard-coded kind list in the layout module
meant a fifth registry entry with a matching row produced no descriptor at all,
and one static name per kind meant several behavioural tiles were indistinguish-
able. Both are one hook on the entry now, so layout iterates entries and never
names a kind.

## ADR 135 — One shared glucose range per arrangement

Every glucose-valued chart in one arrangement receives the identical y-range:
computed once per arrangement from every displayed glucose value, snapped
outward in 20 mg/dL steps, always containing the 60–200 mg/dL envelope
(`glucoseRange` in `frontend/diagnose-evidence-charts.js`, ported verbatim
from the executed spike). Option builders never fetch and never compute a
range, which is what makes two charts in one quad incapable of sitting on
different scales. This closes #98's measured defect, where a 40–300 axis hid
cohorts spanning 100–160.

## ADR 135 — The comparison tile is a presentation adapter over the Finding case file

Issue #181 retired the standalone `/api/diagnose/event-comparison` route this
registry kind was first specified against; the meals/lows comparison now rides
the Finding case-file path exclusively. Ruled by the operator (2026-08-25): the
registry's `event-comparison` kind ADAPTS to the case-file projection rather
than keeping a client, endpoint or transport of its own. One authority for the
fact, and the tile is a pure presentation adapter over it — which is what makes
the case-file payload's seam real, the tile being its second consumer beside
the inspector's own drill.

Concretely: `eventComparisonChartOption(caseFile, range, surface)` is exported
from `frontend/diagnose-event-comparison.js` and calls the same series builders
the shipped mount calls, so there is one implementation of this draw. The tile
is handed its arrangement's glucose range; the shipped mount, alone on its own
surface, computes that range from the cohort values it is about to draw. The
tile's request coordinates are the case file's own — `projection_id`,
`finding_id`, `alignment` — fetched through the `loadCase` callback the
inspector already uses, never a second client.
