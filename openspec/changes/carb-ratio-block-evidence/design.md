# Design — the carb-ratio block shows and explains its evidence (#464)

## Safe start (revise lifecycle record)

- Declaration: `AGENTS.md` (`CLAUDE.md` symlink), "The data boundary", the QA
  copy-then-serve command: `uv run harmonic serve --no-fetch --token '' --db
  "$scratch" --port 8765` over a copy of `mockups/qa-e2e.synthetic/harmonic.sqlite`
  or a case store emitted by `scripts/gen_qa_e2e_db.py --case <name> --out <path>`.
- Data source: manufactured, generated entirely by `scripts/gen_qa_e2e_db.py`;
  provenance stamped by that generator; `--check` drift-guarded in CI.
- Router: `route.mjs --embodiment shipped --runnability runnable --declaration
  complete --data-source manufactured` → `{"mode":"revise","reason":"safe
  manufactured data source declared"}` (2026-09-24).
- Base: `59fa4737`. Its app tree (`frontend`, `ciq_autotune`, `scripts`) is
  byte-identical to `e4862000`, the commit the #442–#457 release re-froze the desk
  ledger on (193 issued · 174 active · 19 retired), so that re-freeze is the
  frozen-ledger replay against this base. Not re-run in triage.

## ADR 464 — The analyzer serves the reconciling sentence from a closed set

**Status:** accepted, 2026-09-24 (operator, scope Q4 A).

A reader who sees "over-covered" beside a chart on which most meals ran high needs
the reconciliation in words, and advisory meaning belongs to the analyzer. The
block stamper chooses one sentence from a closed set in `ic.py`, keyed on three
served facts: the block's asserted direction (raise / lower / none), whether the
tally's ran-high count exceeds its ran-low count, and that the ledger closes at
the chain's end. The frontend prints it verbatim. A second sentence composed on
the client from the same counts is the two-predicate drift #273 and #465 already
paid for, so none exists.

## ADR 464 — The panel's balance sheet is a labelled pooled quotient beside the fit

**Status:** accepted, 2026-09-24.

The shipped estimator is a carb-weighted joint fit of inverse ratios on per-block
share (ADR 117), so a block's number is not the quotient of any summed terms. The
panel still owes the reader the arithmetic. Two facts are therefore served, each
named for what it is: the fitted `estimate`, which is the block's number, and a
`pooled_ratio`, the carb-share-weighted sum of the pooled runs' carbs over their
summed effective insulin, whose terms are the row the panel prints. Per run, the
served `true_ic` *is* its terms' quotient and is pinned so by test. The ticket's
addendum said "the measured ratio is visibly their quotient"; that holds per run
and for the pooled check, not for the fit, and the panel labels which is which.

## ADR 464 — By meal is the block's default view; the chain overlay is rebuilt as run strips

**Status:** accepted, 2026-09-24 (operator, scope Q5, "handle it all in this
ticket").

The reader's first question on opening a carb-ratio block is what happened after
these meals. The whole-chain overlay cannot answer it: 42 traces of up to twenty
hours on one axis, anchored at each chain's first meal. So the tile opens on By
meal — every block-hours meal on its own five-hour clock from its bolus, through
the Pattern comparison chart the reader already knows, in ran-high / ran-low /
in-range cohorts from the same verdicts "Highs after meals" counts (scope Q2 A).

The chain view's job — showing why the ledger read what it read for each run — is
kept and rebuilt as one strip per run with its balance sheet at the edge, rather
than retired: the operator judged the overlay unfit ("sucks") and ruled the
rebuild into this ticket. This is a CHANGED behavior on the frozen ledger, not a
retirement, because the block's run evidence still ships on the tile. By clock
survives unchanged in role and gains the programmed rule, band and shared-run
marking.

## ADR 464 — New facts ride the block-evidence payload, never the findings row

**Status:** accepted, 2026-09-24.

`/api/diagnose/findings` is answered in the browser gates by a fixture-only JS
mirror held identical to the Python projection by test, and its block rows are
frozen by the findings-projection fixture. Every fact this change serves is read
on the block panel and its tile, both of which already load
`/api/diagnose/carb-ratio-block-evidence`. Widening the findings row would drag
the mirror, its generator and every frozen answer into this change for no reader
benefit, so the row keeps its shape (`support.n`, `noun`, `run_days`) and the
seriousness word the addendum asked for on the queue row renders on the panel,
where the harm evidence it qualifies is.

## ADR 464 — The outcome tally reuses the Pattern detectors' verdicts

**Status:** accepted, 2026-09-24 (operator, scope Q2 A).

"Ran high" means one thing in this app. The tally over the block's 90-day meals
runs the scenario engine's shared evaluation (`attributed_occurrences`) over the
same slice the block reads and classifies each block-hours meal by the Pattern
roster's own families — `highs_after_meals` levers → ran-high, `lows_after_meals`
levers → ran-low. A block-owned 70/180 tally would be cheaper and would be a second
definition beside the Patterns' that the reader will compare. The tally therefore
inherits #461 (Late bolus counting an in-range meal as ran-high) until #461 fixes
it in the shared verdict, which is where it belongs.

## Risk contract (copied from `docs/scope/464-carb-ratio-block-evidence.md`)

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
