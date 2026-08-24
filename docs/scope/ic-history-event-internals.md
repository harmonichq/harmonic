# Scope — #132 · Carb-ratio history By event leaks internals and overlaps the roster

Ticket: https://github.com/harmonichq/harmonic/issues/132
Worktree: `/Users/connor/worktrees/harmonic/132` · branch `codex/132-ic-history-event-internals`

## Decisions

- **Reproduced before drafting.** Synthetic fixtures only, driven through
  `openApp` (`appSource: 'fixture'`, `history: true`) with two production-shaped
  facts restored: the result cache's real generation token shape and
  second-resolution meal offsets. At 1440x900 the header prints
  `analysis q7Zt3xKm9RbVpLdA2wYcE5Hn:7`, and each `.history-run` renders
  `4 meals · +0 min, +137.31666666666666 min, +261.7 min, +398.1166666666667 min`.
  _Why:_ triage reproduces a bug report before anything is drafted. _Disposition:_ inline.
- **Both leaks are frontend-side, and neither is a contract defect.**
  `frontend/diagnose-workstation.js:1907` writes `analysis ${f.generation}` into the
  canvas persist chip; `frontend/diagnose-workstation.js:918` interpolates
  `member_offsets_min` verbatim. The server fields are correct — the offsets are
  genuinely fractional because `analyzers/ic.py:_history_run_record` divides seconds
  by 60. _Why:_ decides where the fix lands. _Disposition:_ inline.
- **Overlap mechanism measured, not guessed.** `.history-run` is
  `grid-template-columns: minmax(0, 1fr) auto`; the `auto` offsets column takes 379px
  of a 403px button, squeezing the date column to ~24px so it wraps to three lines
  under the two-line offsets text. _Why:_ the fix must address the track sizing, not
  only the string length. _Disposition:_ inline.
- **Why no gate caught it.** The committed fixture's offsets are exactly `0.0` and
  `120.0`, and its generation is the benign `findings-fixture-process:0`. Ledger
  proposition S52 pins the roster text as `2 meals · +0 min, +120 min`.
  _Why:_ the change owes evidence at a real-shaped offset, or it regresses again.
  _Disposition:_ inline.

## Open questions

1. What the By-event history header chip should say in place of the raw token.
2. The rounding rule for displayed meal offsets, and whether it lands in the
   frontend formatter or the backend projection.
3. How the roster line lays out once the offsets no longer size their own column,
   given ledger S52 requires every published offset to stay rendered.

## Spawned tasks

- Routed to `/ui-craft` (revise — shipped surface).
