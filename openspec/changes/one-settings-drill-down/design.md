# Design — one drill-down for every settings chart

## ADR 294 — The chart route is the row route, reached by chart identity

The behavioral branch already resolves a chart click by finding the findings row
whose id equals the chart's own id and handing it to the row route. Evidence
chart descriptors are generated one per findings row and carry that row's id as
their chart identity, so the same resolution is available for every settings
kind and no new mapping is invented. Extending that branch, rather than teaching
the generic chart level to render a parameter panel, keeps one answer to "which
level does a chart belong to" and leaves the row route the single place a
parameter panel is opened.

The alternative — enriching the thin readout until it matched the panel — was
rejected because it would have produced a second implementation of the panel,
diverging from the row route's the first time either moved.

## ADR 294 — The clock-window rule stays per-parameter, not per-gesture

Basal and carb ratio release a drawn clock window when their panel opens;
correction factor does not. That split is principled rather than accidental: a
basal slot and a carb-ratio block each carry their own span, which the panel
substitutes for the reader's brace, and correction factor has no span of its own
to substitute. Unifying the gesture therefore inherits each parameter's existing
behavior unchanged. Making the rule uniform across settings charts would have
changed shipped behavior on a route this work never named, and would have
re-decided which parameters own a span under cover of a routing change.

## ADR 294 — Retirement is bounded by reachability, not by association

The thin readout's level, its breadcrumb title and its level metadata are shared
with the behavioral placeholder, which still needs the generic chart level. Only
what genuinely becomes unreachable is removed: the readout function itself, the
styles no other rule reaches, and the settings entries in the level-metadata map.
The generic level survives with its behavioral use intact.

`inspectorStack` is deliberately out of scope. It maps a settings descriptor to
the generic chart level and so looks like part of this retirement, but it has
never had a call site anywhere in this repository's history — it was introduced
already uncalled — so this change does not make it unreachable. It is removed
under its own ticket (#295), on the same footing as this repository's other
dead-helper removals.
