# A merged basal finding stages the whole span it names (#372)

## Why

The findings projection merges contiguous basal slots that share a register and a
direction into one row, because "a run of asserting slots is one item that stages
whole" (`ciq_autotune/findings_projection.py`, term 13). The shipped Diagnose
surface does not honour that. A merged row's Stage change writes exactly one
half-hour slot into the Plan draft, and the panel that offers the control names
only that one slot without ever saying so.

Reproduced on the committed QA showcase database
(`mockups/qa-e2e.synthetic/harmonic.sqlite`, served no-fetch): the queue row
**Basal 03:00 to 04:00 · lower** carries `members` at `start_min` 180 and 210,
and `/api/analyze` publishes `asserts_move: true`, `current: 0.6`,
`recommended: 0.48` for both slots. Clicking that row opens a panel headed
`03:00–03:30`; its Stage change leaves `/api/plan` holding one item (`key: 6`),
and the dock reads `Basal 03:00 · 0.60 → 0.48 U/hr` while the row one click away
still reads `Basal 03:00 to 04:00`. The second slot stays at the programmed rate
unless the reader notices the shortfall and hunts down its lane cell.

This is advisory dosing guidance. A reader who acts on the row's own control
programmes half the change the row asserts, and nothing on the surface tells them
so.

## What changes

- Staging a basal item fans out over the **served** member list of the finding
  that owns it, exactly as carb ratio already fans a block out over its published
  members. Membership comes from the projection row; per-slot eligibility comes
  from each slot's own backend `asserts_move` verdict. The surface re-derives no
  floor, threshold, direction or safety verdict.
- Un-staging removes exactly the set staging added, and the surface's own staged
  tally, its Stage change / Staged · Undo state, the lane's staged marks and the
  Plan badge all move with it.
- A member panel states its finding's span and that the control acts on the whole
  run, in the panel's existing reserved scope line. Its Current / Estimate /
  Recommended numbers remain that member's own, because the projection
  deliberately leaves a merged run's numbers on its members rather than inventing
  a span average.
- The dock keeps naming the staged span and prints the number pair only when every
  staged slot agrees on it — the same refusal the queue row already makes.
- A single-slot finding is unchanged in every respect: its member list is itself.

## Impact

- Frontend only. No analyzer, safety, projection or API change: the projection
  already publishes `members`, and `/api/analyze` already publishes the per-slot
  verdict.
- The shipped Diagnose behaviour ledger gains an amendment and one new replay
  story, so the merged-run staging contract is executable rather than assumed.
- The `surfaces` capability gains, as this change's spec delta, the requirement
  whose absence let this ship.
- Revision evidence (base and revision renders of the merged-row panel and dock)
  is collected against the repo's declared no-fetch QA server.

The decision and its risk contract are recorded in `design.md` as ADR 372.
