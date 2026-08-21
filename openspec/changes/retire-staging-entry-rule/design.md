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
