# Scope ledger — #464 Diagnose carb-ratio block evidence

Opened 2026-09-24 by `/ticket triage 464` → `/scope` → interview mode.
Base: `59fa4737` (app tree byte-identical to the #458 re-freeze commit `e4862000`;
the archive commit touched only `mockups/` path repoints). Worktree
`/Users/connor/worktrees/harmonic/464`, branch `464-carb-ratio-block-evidence`.

## Decisions

- One ticket, not two. The checkable items (run list, key, axis, readout, counts,
  programmed-ratio overlay) and the explainable items (ledger, harm lows, outcome
  tally, meal-anchored view) ship together. Why: operator, 2026-09-24 ("it's just
  one ticket"). `inline`
- Surface lifecycle `revise`. `route.mjs --embodiment shipped --runnability runnable
  --declaration complete --data-source manufactured` → `revise`, "safe manufactured
  data source declared". Why: the desk ships the surface; the QA copy-then-serve
  command is the declared safe start. `inline`
- Frozen-ledger replay against the base is evidenced by the #442–#457 release's
  2026-09-24 re-freeze (193 issued · 174 active · 19 retired) on the same app bytes;
  it is not re-run in triage. Why: `git diff --stat e4862000 59fa4737 -- frontend
  ciq_autotune scripts` is empty. `inline`

## Open questions

Round 1 asked 2026-09-24 (Q1 direction, Q2 outcome-tally definition, Q3 harm
lows presentation, Q4 reconciling sentence). Round 2 pending on Q1: the
meal-anchored view's placement.

## Spawned tasks

(none)
