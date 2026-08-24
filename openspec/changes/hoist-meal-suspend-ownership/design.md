## ADR 121 — Capture-scoped meal-suspend ownership

**Status:** accepted, 2026-08-23.

`MealSuspendOwnership` precomputes ADR 681's eligible comparison meals and
their owned suspend anchors from one supplied bolus sequence, basal sequence,
and `ScenarioConfig`. It is the ownership rule, not a second classifier: the
existing classifier still judges each owned anchor and returns the first matched
verdict, otherwise the first verdict.

`classify_meal_owned_suspend` accepts the optional keyword-only interface
`ownership: MealSuspendOwnership | None = None`. A direct caller without an
ownership object builds one from that call's own bolus and basal sequences, so
episode-padded model-view and attribution contexts retain their current
contract.

Event-comparison capture builds one ownership object immediately after sorting
its capture streams and supplies that same object to every meal route. An
ownership object is never reused with different streams: a bounded capture owns
only the bolus and basal rows it supplied, including any required lead-in.

**Measured exposure shape.** Before: **98.20s**. After: **37.93s**.
`classify_meal_owned_suspend` is no longer the leader (**4.41s** cumulative);
the new leaders are `builtins.sorted`, `model.__init__`,
`classify_carb_undercount`, and `classify_late_bolus`.
