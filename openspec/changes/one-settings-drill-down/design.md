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

## ADR 294 — The clock-window rule stays per-parameter, and the chart gesture adopts it

Basal and carb ratio release a drawn clock window when their panel opens;
correction factor does not. That split is principled rather than accidental: a
basal slot and a carb-ratio block each carry their own span, which the panel
substitutes for the reader's brace, and correction factor has no span of its own
to substitute. Unifying the gesture adopts each parameter's existing rule rather
than inventing a third one, and does not re-decide which parameters own a span.

Adopting it is a change to the chart gesture, not a no-op. `releaseWindow` has
exactly two call sites, in the basal-slot and carb-ratio-block pickers, and no
chart-click path reaches either today, so a settings chart click currently leaves
a drawn brace standing for all three parameters. After this change basal and carb
ratio release it there too. The alternative — leaving the chart route alone —
would have kept the same panel scoped to two different windows depending on which
control the reader clicked, which is the two-meanings-per-gesture defect this work
exists to remove, in window form.

That change lands on a locked term. Frozen story S21 (`LOCK:diagnose-workstation:7`,
`LOCK:diagnose-workstation:9`) states that a drawn window survives drilling and
popping and that only a lane click releases it. That sentence already
under-describes shipped behavior: S21 exercises a behavioral finding drill, which
does not release, while a basal queue-row drill reaches the slot picker and
releases the brace today. The re-freeze reconciles the sentence with the drills
that actually release, under an attributed operator ruling, rather than leaving a
contract that contradicts both the shipped row route and the new chart route.

Sanction: ConnorGriffin — 2026-08-31 — ruled option A: the chart route releases
the brace for basal and carb ratio, matching their queue rows, and S21's
lane-click exclusivity is corrected to describe which drills actually release.

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
