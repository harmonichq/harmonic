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

- **UI Craft route: `revise`.** `route.mjs --embodiment shipped --runnability
  runnable --declaration complete --data-source synthetic` returned
  `{"mode":"revise","reason":"safe synthetic data source declared"}`. Safe start is
  AGENTS.md's declared `uv run harmonic serve --no-fetch --db
  mockups/revise-e2e.synthetic/harmonic.sqlite`, whose database is generated
  entirely by `scripts/gen_revise_e2e_db.py`; the fixture-mode browser harness
  (`openApp` with `appSource: 'fixture'`) needs no server at all. Frozen contract:
  `mockups/finding-evidence-routing.behavior.md` stories S48–S54, replayed by
  `frontend/diagnose-workstation-behavior.replay.mjs`. _Disposition:_ inline.
- **Past settings are leaving the findings screen — filed as #166.** Owner ruling
  2026-08-24: "I actually want to drop past settings from the main findings screen."
  #166 owns what a past setting is for, where it is reported, and the fate of this
  evidence surface. _Why:_ it unsettles this ticket's premise and #145/#135 both
  touch it. _Disposition:_ -> issue (#166, filed).
- **#132 proceeds as containment anyway.** Owner ruling 2026-08-24: "Sure, why not,
  it's a cheap fix." The token is on a clinician-facing surface today, and the
  offsets formatter travels with the roster wherever past-setting reports land.
  _Disposition:_ inline.
- **The header chip is emptied in this mode, not re-worded.** Owner ruling
  2026-08-24 (Q1 = B). _Why:_ #166 may retire the surface, so new copy is investment
  that may not survive; the scope slot beside it already reads "3 meal runs", so the
  chip carries no job here. _Disposition:_ inline.
- **Offsets read as whole minutes with one trailing unit.** Owner ruling 2026-08-24
  (Q2 = A). Rounding lands in the frontend formatter; the published contract keeps
  full precision. _Why:_ the chart's x-axis is "minutes from first meal", so minutes
  keep the roster in register with the plot it selects into. _Disposition:_ inline.
  Spiked and run before drafting:
  `[0, 120] -> "2 meals · +0, +120 min"`;
  `[0] -> "1 meal · +0 min"`;
  `[0, 137.316…, 261.7, 398.116…] -> "4 meals · +0, +137, +262, +398 min"`;
  `[0, 90.5] -> "2 meals · +0, +91 min"`.
- **The roster line stacks: date above, meals and offsets wrapping beneath.** Owner
  ruling 2026-08-24 (Q3 = A). _Why:_ the date is the run's identity and must not be
  the thing squeezed; a two-column fix re-collides as soon as a run has more meals.
  _Disposition:_ inline.
- **S52 is amended, not retired.** Its subject — every server-published meal offset
  renders as a member of its one run — is unchanged; only the copy the assertion
  reads changes, from `2 meals · +0 min, +120 min` to `2 meals · +0, +120 min`.
  _Why:_ revise mode requires a shipped-behavior change to amend the frozen ledger,
  dated and sanctioned, never quietly. _Disposition:_ inline (amended in the change).

### Risk contract

- **Must prevent:** any change to a published number, direction, interval, support
  count or staging verdict; any new frontend-derived threshold or floor; secret or
  internal-identity exposure on a clinician-facing surface.
- **Must recover:** nothing — this change adds no failure path.
- **Accepted failure:** a run with many meals still produces a tall roster line;
  it wraps and stays legible rather than being truncated, because S52 requires
  every published offset to render.
- **Unsupported:** re-deciding where past settings live — #166 owns that.
- **Evidence owed:** the frozen S48–S54 replay green against the built app with S52
  amended; rendered before/after at 1440x900 and at the 1024px tablet width the
  header's one-line ruling was made at.

_Why:_ the surface is advisory dosing evidence, and the only real hazard is a
display change quietly becoming a data change. _Disposition:_ copied into the work
order at admission.

## Open questions

None — all three routed decisions are settled above.

## Spawned tasks

- Routed to `/ui-craft` (revise — shipped surface). Route returned; contract recorded.
- #166 filed: decide where past settings are reported.
