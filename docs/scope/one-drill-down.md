# Scope — one drill-down for every settings chart (#294)

Route: interview mode. Frontend-only Diagnose routing unification.

## Decisions

1. **A settings-chart click lands on whatever window that parameter's queue row
   already lands on** — brace released for basal and carb ratio, kept for
   correction factor. `inline`
   Why: the release rule is per-parameter and principled (a panel that carries its
   own span swaps the brace out; correction factor has none), so unifying the
   gesture must not re-decide which parameters own a span. Operator answer, Q1 = A.

2. **The chart route inherits the queue row's existing missing-cell guard and adds
   no new guard, message or unavailable state.** `inline`
   Why: the state was not shown to be reachable. Basal is always the full 48-slot
   schedule; I:C rows point at programmed blocks from the same analysis; retired
   I:C regimes are history rows, which carry no chart and branch before the lookup.
   Recorded as an assumption, not an operator decision.

3. **`inspectorStack` is removed under its own ticket, not this one.** `→ issue`
   Why: it has never had a call site anywhere in the repo's history — born uncalled
   in `16cfbda7` (#229) — so #294 does not make it unreachable. This repo already
   removes such helpers as separate tickets (#266 → PR #282, #264 → PR #281).
   Filed as https://github.com/harmonichq/harmonic/issues/295.

### Risk contract

- **Must prevent:** the frontend re-deriving any floor, threshold, direction or
  safety verdict; a staging control or Recommended number appearing on a chart
  route where the backend's `asserts_move` is false or missing.
- **Must recover:** nothing. No new failure mode is introduced; the routes being
  merged are both already live.
- **Accepted failure:** a chart whose parameter the standing analysis cannot show
  does nothing on click, exactly as its queue row already does.
- **Unsupported:** any change to analyzer, projection, endpoint or payload; any
  change to which parameters release a drawn clock window.
- **Evidence owed:** the shipped surface's behavior ledger
  (`mockups/finding-evidence-routing.behavior.md`) replayed, amended and
  re-frozen, covering each of basal, correction factor and carb ratio reaching its
  parameter panel by chart click, and a cross-parameter chart click not deepening
  the breadcrumb.

Why: advisory insulin-dosing guidance, so a wrong verdict on a newly reachable
panel can misadvise a dose; everything else here is navigation.
Disposition: copied into the work order at admission.

## Open questions

None. All three settled above.

## Spawned tasks

- https://github.com/harmonichq/harmonic/issues/295 — remove `inspectorStack`
  (dead since introduction), sequenced after #294.

## Review experiment (operator-directed)

The order's whole-diff depth is Full, which makes reviewer-routing stakes
load-bearing. `review-routing.md` gives load-bearing plan review no
benchmark-validated Codex route and sends it to Opus directly.

At the operator's direction, the identical cold-reader prompt was dispatched to
both Opus and Terra to test whether Codex can be trusted for load-bearing
review. Per `review-routing.md`, a Codex review admitted this way is labeled
**unvalidated**, and per `routing-table.md`'s provenance rule a field
observation is promoted to a benchmarked route only by replay against ground
truth — so this run is evidence, not a promotion.
