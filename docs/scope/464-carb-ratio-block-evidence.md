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

- Q1 A — convergent design: run list through the basal slot's night-roster mechanism
  with its Day hop, scope line in the correction factor panel's measured-in idiom,
  meal-anchored view through the Pattern comparison chart builder; no wireframe
  round. Why: every element has a shipped sibling. `inline` (operator, 2026-09-24)
- Q2 A — the outcome tally reuses the Pattern detectors' per-meal verdicts over the
  block's 90-day meals; one meaning of "ran high" app-wide, inheriting #461 until
  fixed. Why: one fact, one implementation. `inline` (operator, 2026-09-24)
- Q3 A — attributed printed lows render as rows, one per low, each opening Day at
  that moment, through the same roster mechanism. Why: the move is partly
  harm-driven. `inline` (operator, 2026-09-24)
- Q4 A — the analyzer serves the reconciling sentence from a closed set chosen on
  served facts; the panel prints it verbatim. Why: advisory meaning stays in the
  analyzer. `→ ADR` (operator, 2026-09-24)
- Q5 — By meal (each block-hours meal on its own five-hour clock from its bolus,
  through the Pattern comparison chart builder) is the block's default view. The
  chain-trace Event view is REBUILT in this ticket as per-run strips: one row per
  run sorted by measured ratio, pooled first and excluded dimmed with their served
  reason; each row a CGM strip from the block's meal in hours with filled
  block-hours meal marker, open later-chain markers, lows/highs and correction
  ticks; the run's balance sheet (bolus, corrections, basal withheld, glucose
  travel → ratio against programmed) at the row's edge; roster-row and strip
  selection are one selection and both open Day. By clock keeps each run's ratio
  against programmed and the estimate band. Why: operator, 2026-09-24 ("handle it
  all in this ticket"). `→ ADR`
- Every new served fact rides the block-evidence payload
  (`/api/diagnose/carb-ratio-block-evidence`), never the findings row. Why: the
  findings row is mirrored in fixture-only JS for the browser gates and frozen by
  the findings-projection fixture; widening it would drag the mirror, its
  generator and every frozen answer into this change for no reader benefit — the
  panel is where the facts are read. The addendum's "queue row's seriousness"
  item is therefore scoped to the panel. `inline`

### Risk contract

- **Must prevent:** real health data in any commit, fixture, screenshot, log or
  comment; a served count, reason, side or sentence re-derived in the frontend;
  any change to the estimator, pool rule, floor, caps, harm arm, `ic_asserts_move`
  or the move's direction; silent incorrect success (a green step that ran zero
  assertions).
- **Must recover:** none automatic.
- **Accepted failure:** the block-evidence request fails or returns a stale
  generation → the panel keeps its numbers-and-staging block and prints one
  "Run evidence unavailable." line; no roster, tally or lows render from a payload
  not received. A worker sandbox that cannot launch Chromium → the browser legs run
  in the coordinator and are recorded there.
- **Unsupported:** blocks in `collecting` / `below-floor` / `unmeasured-alone`
  state carry no ledger, tally or lows section beyond what they serve today; the
  meal-anchored view is not offered for blocks with no meals dosed in their hours.
- **Evidence owed:** served per-run reason from analyzer output built from N
  synthetic runs (never hand-set `in_pool`); served tally and sentence from a
  manufactured spike-then-low block; projection copies `current`, estimate,
  `side_k/side_n`, `whole_runs`, `fractional_run_ownership`, harm lows; chart key
  never names an excluded non-directional run "Directional-only"; x-axis bound
  equals served bounds; roster row count equals served roster length; Day hop
  lands with the moment ringed from both entry paths; fixture `--check` green;
  replay stories for every added behavior at both viewports.
- Why: advisory insulin-dosing guidance on one person's own data; wrong evidence
  misleads a real dose decision, and the repo's data boundary is absolute.
- Disposition: copied unchanged into the work order.

## Open questions

Rounds 1–2 settled 2026-09-24 (Q1–Q5 above). Frontier empty.

## Spawned tasks

(none)

## Plan review rounds (one panel, Opus cold reader, resumed on deltas)

| Round | Blockers | Tag | Outcome |
|---|---|---|---|
| 1 | 5 (tally authority; glossary extract guard; scan ack digest; comparison-chart guard on the reuse seam; desk browser suite) + 1 note | authoring | all reproduced; fixed at `097fe784` |
| 2 | 4 (cohort contract; http-api delta; ADR bodies; two-population median) | 1 injected by fix 4, 2 injected by an aborted edit script, 1 authoring | reproduced |
| 3 | same 4 | coordinator process defect: edit script aborted, chain still dispatched | edits re-applied and verified; `336e3d1b` |
| 4 | 1 (key printed `usable_count`, withheld cohort undrawn) | injected | fixed at `686c1734` |
| 5 | 0 | — | **countersigned** |

Injected blockers did not climb across rounds once the edit gate was fixed; no rewrite-clean signal. Round ledger with corrections and re-check results: session scratch `plan-review-mechanical-fixes.md` (not committed).
