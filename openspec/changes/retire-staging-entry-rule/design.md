# Design — Retire the dead staging-entry style (#39)

## ADR 39 — The retired level-one staging entry owns no CSS

**Decision.** Delete the `button.entry` selector family from
`frontend/diagnose-workstation.css` and the matching `.entry .sub` arm from
`frontend/theme.css`. Retain the evidence-table `.ev-row .entry` cell and its
compact-box regression. No replacement selector or emitter is introduced.

**Context.** The rule originally styled three per-parameter staging rows at
Diagnose level one. The shipped workstation now states that those rows were
retired by the unified, server-owned findings queue: settings and habits
interleave in one ranked list, every queue row drills to its item detail, and
staging lives there through `.stagebtn`. The frozen app replay's S24 story
asserts that `#level` contains zero `.entry` tier rows. A repository-wide source
inventory finds no `button.entry` emitter; the only literal shipped `entry`
class is the evidence table's inline glucose cell.

**Why deletion, not reservation.** A reserved selector would describe a second
level-one route that the current surface contract explicitly forbids. Restoring
that route would be a new behavior decision and must arrive with its emitter,
ledger story, and UI lifecycle evidence rather than dormant CSS.

**Consequences.** The stylesheet once again maps only rendered components. The
compact evidence-cell regression becomes the closed inventory for both sides of
the old collision: the live cell remains unboxed and the retired selector cannot
return. Live parameter detail, basal-lane navigation, staging, and Plan behavior
do not change.

Decision: harmonichq/harmonic#39, 2026-08-21.

## Triage review rounds

- **Preflight:** the shipped emitter and selector inventories were generated from
  the ticket worktree. The existing compact-cell test passed, while a throwaway
  two-assertion absence test failed on both retired selector owners. The four
  frontend CI commands passed on the ticket base and both generated artifacts
  reported current.
- **Cold panel 1:** three independent lenses found one authoring blocker and zero
  injected blockers. The draft called a two-command subset the complete frontend
  job; the verification source now names all four committed commands.
- **Delta recheck:** the objecting reviewer reproduced the corrected CI wiring
  and the two-stylesheet box scan, then countersigned. The grounding/execution and
  risk/cost lenses also countersigned with no blocking objections.

## Implementation evidence

The closed source-inventory regression failed first against the ticket base,
listing every `button.entry` selector and the shared theme's `.entry .sub` arm
while the compact evidence-cell assertion stayed green. After the retired rules
were deleted, both focused assertions passed: the inline glucose cell remains the
only shipped literal `entry` emitter, `.ev-row .entry` remains its only production
style owner, and no box-producing selector in any stylesheet source loaded by the
shipped app reaches it. Targeted review strengthened that source set from the two
former owner files to every CSS file under `frontend/` plus the app's inline style
blocks, so a future stylesheet cannot restore the retired selector outside the
inventory.

All four commands in the frontend CI job pass: 375 frontend tests and the local
screenshot-wrapper test are green, and both generated-artifact checks report
current. The S24 replay and behavior ledger remain byte-unchanged.

## Implementation review rounds

- **Targeted round 1:** the Spec axis met all 16 criteria. The Standards axis
  checked 18 items and found one actionable inventory escape: a future loaded
  stylesheet outside the two former owner files could restore `button.entry`
  without failing the regression. The test now derives every local stylesheet
  link and inline style block from the shipped app, and the complete frontend
  verification remains green.
- **Discarded as contrary to the order:** one Standards observation asked to
  rewrite the historical exploration sentence that says the #31 scoping repair
  stays. The locked order explicitly preserves exploration wording and makes ADR
  39 plus the ADR 31 amendment the current ruling, so changing that artifact
  would erase history and exceed this ticket.
- **Targeted round 2:** both axes found that the first inventory expansion parsed
  stylesheet links with an order-sensitive, double-quote-only regular expression.
  A valid attribute reorder or single-quoted link could therefore load CSS the
  test did not read. The final implementation removes link parsing entirely and
  recursively inventories every CSS file under `frontend/`, while retaining the
  app's inline style blocks. The ticket's two-round review cap prevents a third
  adversarial round; the complete verification was rerun after this fix.
