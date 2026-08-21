# Correction-factor staging predicate

## ADR 13 — Correction factor joins the staging invariant without joining basal safety

**Context.** Correction factor has a deliberate evidence regime. Recurring correction-caused lows may assert a weaker direction without naming a new value; a stronger direction requires observed silence and persistence; numeric moves use a half-gap step capped to twenty percent. ADR 25 correctly separated that direction from stageability, and ADR 42 correctly allowed the queue register to assert independently of whether a programmable value exists.

The missing fact is stageability itself. `analyze_isf` leaves the existing row verdict unset, while Diagnose and Plan independently treat a non-null recommendation as permission. That is the second-predicate defect the safety specification forbids.

The split is harmful in a reachable state. With no programmed correction factor, the analyzer returns the robust per-night median as a measured number with no direction. That number has no relative cap because there is no current value. `/analyze` answers from the in-process result cache while `/pump-settings` reads the latest store state on each request. If a settings snapshot lands out of process, the browser can see pump segments beside the stale analysis row and fan the uncapped measured number across them into the Plan.

A smaller edge has the same shape: a valid strengthen signal can produce a half-gap that rounds back to the current value. Direction plus a number is therefore insufficient unless the number also names a real move.

**Decision.** Correction factor exposes one module-level staging predicate. It returns true only when all three facts hold:

1. a current programmed correction factor exists;
2. the analyzer names a direction; and
3. the recommended value exists and differs from current.

`analyze_isf` calls the predicate on the final post-harm-gate values and stamps its one result row with the boolean. Other producers of analyzer-shaped correction-factor rows call the same predicate rather than transcribing it. The findings projection carries that verdict beside its independent direction-derived register. The queue, Diagnose detail and Plan treat only an exact true verdict as actionable; an absent verdict fails closed.

When no current programmed correction factor exists, the analyzer emits `recommended = null`. The pooled Estimate and the per-night median in evidence remain available as measurements; neither is promoted into an advisory recommendation.

The predicate decides staging only. It does not decide direction, queue register, ranking, or which evidence is persuasive. The correction-factor analyzer keeps its own half-gap cap, recurrence rules, harm ordering, observed-silence requirement, and two-decision-point strengthen requirement. It does not route through basal `cap()`, acquire basal support floors or `Status`, or enter the consolidated pump-profile schedule.

**Held presentation.** With no programmed correction factor, Diagnose shows the Estimate, confidence interval, support, and analyzer annotation. The shared parameter-panel geometry remains intact: its Recommended row stays in place but carries no numeric value, and no stage control appears. The uncapped per-night median remains backend evidence rather than being presented as advice. A legacy payload with no explicit verdict follows the same fail-closed presentation even if it carries a stale `recommended` field.

A rounded strengthen step that lands back on the programmed value follows the same non-actionable geometry while preserving its strengthen direction and analyzer annotation. Its held copy says that the conservative step rounds to the factor already programmed; it never borrows the weaken path's recent-low explanation.

**Consequences.** The one staging question now has one backend owner across basal, carb ratio, and correction factor, while their three evidence regimes remain distinct. Direction-only correction-factor rows may still appear in the asserting queue and affect priority without becoming programmable. The existing cache gap remains documented and outside this change, but it can no longer turn a directionless measurement into a Plan change.

## Safe-start provenance — the `/ui-craft` revise lane (#13)

- **Declaration path:** `AGENTS.md`, section “The data boundary”.
- **Command:** `uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite`.
- **Data source:** the explicitly named committed SQLite database. It is generated entirely by `scripts/gen_revise_e2e_db.py` from manufactured inputs and carries synthetic provenance.
- **Surface contract:** `mockups/finding-evidence-routing.behavior.md` and `frontend/diagnose-workstation-behavior.replay.mjs`, exercised against the built app. No lock manifest or replacement mock exists for this shipped surface.

Normal `harmonic serve`, every live fetch, and personal data are forbidden during execution. Before design changes, replay and re-inventory the frozen behavior contract against the exact ticket base. The pull request carries paired build-side renders from base and revision worktrees using the same manufactured data.
