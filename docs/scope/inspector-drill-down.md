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

## Review rounds

- Round 1 (cold Opus, BLOCKED, 5 blockers, all `authoring`): (1) fast-gate test
  parses `renderCaseRoster` span out of the workstation module — allowlist and
  guard-move missing; (2) exploration `build.mjs` lifts the function verbatim
  under a CI `--check` — regeneration missing; (3) verification narrower than
  pinned task "fast gate, drift checks, browser gates" and omitted the only two
  instruments of the comparison roster; (4) spec delta demanded identical cap
  behavior the two lists do not share today (published vs routed counts, one
  shared expansion state) — must-prevent violation as drafted; (5) front door
  underspecified: caller-owned data attributes, headers, empty states unnamed.
  All five reproduced against the tree before fixing.
- Round 2 (same reviewer, BLOCKED, 1 blocker + 1 note, both `injected` by round-1
  fixes): the moved ADR 79 guard as re-worded proved less than the original
  (recount only committable at call sites once the count is a parameter); the
  regenerated extract's export surface has hand-written out-of-allowlist
  consumers. Both reproduced, fixed at 7bd1534.
- Round 3 (same reviewer): COUNTERSIGNED.

- Supersession (lock 2, this session): `start` under lock 1 found the built app
  404ing `/assets/occurrence-roster.js` — api.py serves frontend modules through an
  explicit per-file route whitelist, and `tests/test_frontend_asset_routes.py`
  (served == reachable import graph) fails 2 of 4 live on the branch. Lock 1's
  closed `Expected diff` excluded `ciq_autotune/api.py`, an `authoring` blocker the
  three review rounds missed because none opened the route guard. Fix: one route
  in api.py; the existing guard is the test. Proposal boundary and tasks amended,
  lock 2 posted over the re-pinned commit.

### Q2 resolved (operator, lock-2 session)

The verdict-list empty state ("No occurrences in this verdict.") is supported by
the case-file contract but posed by no committed fixture, so UI Craft's
before/after render for it cannot be captured. Operator accepted the evidence
gap: omit that render, state the omission in the PR evidence, add no fixture (a
zero-count case would regenerate the payload the frozen 146-story replay judges
the change by). Its empty-before-header ordering is held by the roster module's
node test. `inline`

- Lock-2 review (Terra, routine route): round 1 BLOCKED, 2 `authoring` (no
  generated-facts appendix; UI Craft render evidence absent) — both fixed; rounds
  2–4 each 1 `injected` blocker narrowing the render matrix (empty states and
  narrow viewport; capture driver is the replay's fixtures not SQLite; the
  verdict empty state is supported, not unsupported) — the last reached the
  three-panel cap and resolved as Q2 above.

## Spawned tasks

- none yet
