# Scope — 291 basal drill-down entry and inspector pane

Ticket: harmonichq/harmonic#291. Route: interview mode (a concrete author's spec
exists, untested, and partly contradicted by the shipped tree).

## Decisions

- **#291 is frontend-only.** Operator, at triage open. No engine work in this
  ticket; an engine gap becomes a separate spike ticket. → issue (spike, if a gap
  survives scoping)
- **Excluded nights are not itemised by reason.** Operator: a user does not need
  to investigate every discarded night that deeply. #290 closed with only its
  verdict-triad half delivered (#292); the exclusion-reason half was never built
  and is not built here. `inline`
- **The ticket's premise is partly wrong, and it shrinks the work.** The bare
  per-night list is only what the chart-click path renders
  (`renderParameterEvidenceDetail`, frontend/diagnose-workstation.js:698). The
  findings-row path already renders the estimate, its interval, the recommended
  value, the in-words interval-contains-programmed hedge, the verdict word and the
  support count. Unifying the entry therefore delivers the spec's top two
  priorities on its own. `inline`
- **The support floor is read, never re-derived.** `basal_support_floor` is served
  and already reaches the frontend (diagnose-workstation-data.js:83, read at
  diagnose-workstation.js:1206). The duplicated literal at
  diagnose-workstation-chart.js:318 is a known desync trap
  (docs/scope/263-findings-engine-audit.md:95) and the pane must not use it. `inline`

- **One drill-down interface, for every chart.** (Q1 = B) Operator: only one
  drill-down interface should exist across all charts, not a basal-only fix. The
  chart-click gesture and the findings-row gesture reach the same panel for basal,
  correction factor and carb ratio alike. `inline`
- **The drill-down is redesigned from scratch, not amended.** (Q3) Operator: the
  existing panel was not designed, it was agent output from a fast, distant
  iteration, and the rebuild is not beholden to it. This retires the incremental
  framing in the ticket's own priority list. `inline`
- **The surface is locked before any engine work is committed to.** (Q2, deferred)
  Operator will not fund backend features for a front end not yet agreed. The
  glucose items stay open questions the locked design answers, not scope decided
  in advance. Route: `/ui-craft` lock phase, producing wireframes/mockups the
  operator signs off. → issue (spike, only if the locked design needs served data)
- **#291 is not work-orderable yet.** Its dominant uncertainty is now what the
  surface should look like, so triage cannot post an execution lock until the
  visual spec is locked. `inline`

- **The work splits, and #291 becomes the panel redesign.** (Q4/Q5) Operator: the
  routing unification is filed as its own issue and lands FIRST; #291 is then the
  design-led panel redesign, blocked on it. Both revise the same frozen surface
  (`mockups/finding-evidence-routing.behavior.md`), so they share one behavior
  ledger and cannot run in parallel. Routing first re-freezes that ledger once and
  removes the second panel before its replacement is designed, leaving the design
  conversation one subject. → issue: filed as #294
- **#291 gets no execution lock at this triage.** Its dominant uncertainty is the
  design, the design is not locked, and it is blocked on an issue that lands
  first. UI Craft routed the surface to `revise` (shipped, offline-runnable,
  declared synthetic source), which requires the frozen ledger replayed,
  re-inventoried and re-frozen against the offline app before a replacement layout
  is discussed or a wireframe drawn. A from-scratch mock of a shipped surface is
  refused, so the sub-agent wireframe shortcut is not available. `inline`

## Open questions

- Q2 (carried, now answered by the lock) do the glucose items — average in-slot
  glucose, in/below-range counts, Day-strip banding, entering-glucose trace —
  survive into the locked design, and what do they cost in served data.
- Q4 (moot under Q1 = B plus a from-scratch rebuild) the thin readout branch is
  retired by the redesign rather than decided separately.

## Spawned tasks

- #294 — the routing unification, filed and landing first. Discharged.
- `/ui-craft revise` for the Diagnose drill-down panel — the design phase #291
  now is. Starts at the behavior-ledger replay and re-freeze, after #294 ships.
