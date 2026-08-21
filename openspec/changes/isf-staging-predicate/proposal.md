# Correction-factor staging predicate (#13)

## Why

Basal and carb ratio publish one backend verdict that every staging consumer reads. Correction factor does not: its analyzer leaves `SegmentEstimate.asserts_move` unset, while Diagnose and Plan independently treat any `recommended` value as stageable.

That split reaches a harmful state. When analysis has no programmed correction factor, the analyzer returns a measured overnight number without a direction or relative cap. `/analyze` is cached while `/pump-settings` reads the store live, so a later settings snapshot can make pump segments available while the cached row still carries that uncapped measurement. The browser then fans it across the pump profile as a Plan change.

## What changes

- The correction-factor analyzer publishes one boolean staging verdict on its result row.
- The verdict is true only when a current programmed value exists, a named direction exists, and the recommendation names a different value.
- The findings projection, queue, Diagnose detail, and Plan read only that verdict for actionability. A missing verdict fails closed while the measured evidence and independent direction-derived queue register remain visible.
- A no-programmed row keeps its Estimate, interval, support, annotation, and measured backend evidence, but serializes no `recommended` value; its shared Recommended row stays reserved with no numeric value, and no stage control appears.
- Direction, queue register, priority, evidence, caps, and recommendation rules remain separate and unchanged.

## Impact

- The serialized analysis shape becomes explicit for correction factor: analyzer-produced rows carry a boolean `asserts_move` rather than `null`.
- Generated analysis and Diagnose fixtures move with their producers and remain drift-checked.
- The shipped Diagnose behavior contract gains the held-row case where a number exists but the backend verdict is false.
- The result-cache invalidation gap remains outside this change; the unsafe staging outcome is closed at the backend verdict.

Decision and safe-start provenance are recorded in `design.md` as ADR 13.
