# Scope — #298 one inspector drill-down component

Routed from `/ticket triage 298` to interview mode: a concrete plan exists in the
ticket body, and triage grounding contradicts its central premise.

## Decisions

### Grounding that reframed the ticket (facts, not decisions)

- The settings inspector levels (`slot`, `block`, `isf`) render only the
  numbers-and-staging block and return early. They list no occurrences, hold no
  selection, step through nothing and paint no trace.
- The finding inspector level (`factor`) renders head, verdict band, one of two
  occurrence rosters, and a selection detail block.
- The two families therefore share no rendered section today. The ticket's
  "same behavior written twice" between families does not hold against the tree.
- The duplication that is real sits inside the finding family: the verdict roster
  and the meal-comparison roster build the same grouped-occurrence idiom twice.
- #294 (merged) already converged the routing; #291 is the redesign that would add
  a settings roster, and it depends on an exclusion-reason payload from #290 that
  does not exist yet.
- Base delta `c780c67..HEAD` is archive-only, so the ticket's stated 146/146
  behavior-ledger green carries to this branch base.

## Open questions

- none — Q1 resolved below.

### Q1 resolved (operator, this session)

#298 delivers the intra-family extraction: one occurrence-roster module serving
both the verdict roster and the response-comparison roster (the two real callers
today), with #291's settings-side roster as the planned third caller. The
cross-family panel the ticket body describes is not built — its second caller
does not exist yet. No visual or behavioral change; the frozen 146/146 ledger is
the acceptance instrument. `inline`

### Risk contract

- Must prevent: silent incorrect success (an extraction that changes rendered
  behavior while the replay stays green); any re-derived safety judgment in the
  frontend; real data in fixtures or logs.
- Must recover: none — no state is written.
- Accepted failure: the replay finds a divergence and blocks the pull request;
  the fix is manual.
- Unsupported: any payload shape the shipped projections do not already serve.
- Evidence owed: `mockups/finding-evidence-routing.behavior.md` replay at
  146/146 with zero story amendments against the built app; the fast gate's
  frontend suites green.

Why: frontend-only refactor of an advisory-dosing surface; the ledger replay is
the strongest no-change instrument the repo owns. Disposition: inline (copied
into the work order).

## Spawned tasks

- none yet
