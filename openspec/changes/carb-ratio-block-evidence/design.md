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

## ADR 464 — The backend serves the reconciling sentence from a closed set

**Status:** superseded on 2026-09-27 by "ADR 464 — Why this move is four sentences, then the case against, then the lows": the settled panel prints no reconciling sentence, so the closed sentence set is no longer served; the per-meal plain reading and its counts (ADR 464 — The outcome tally reads each meal plainly against the band) stay served and are what the case-against line prints.

A reader who sees "over-covered" beside a chart on which most meals ran high needs
the reconciliation in words, and that sentence is chosen on the server, never on
the client. The tally it depends on is the Pattern's own credited claims, formed
by `build_exposures` over the store, so the block stamper (which has no store)
cannot own it; the block-evidence preparation (`prepare_ic_block_evidence`) does,
and chooses one sentence from a closed set in `ic_block_evidence.py`, keyed on
three served facts: the block's asserted direction (raise / lower / none),
whether the tally's ran-high count exceeds its ran-low count, and that the
ledger closes at the chain's end. The frontend prints it verbatim. A second
sentence composed on the client from the same counts is the two-predicate drift
#273 and #465 already paid for, so none exists.

## ADR 464 — The panel's balance sheet is a labelled pooled quotient beside the fit

**Status:** superseded on 2026-09-27 by "ADR 464 — Why this move is four sentences, then the case against, then the lows" — the panel prints no balance sheet; each run's balance sheet is its dot's hover on the tile, and `pooled_ratio` stays served but unprinted.

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

**Status:** superseded by ADR 464 — The block's one view: the ratio strip over
the run timeline (2026-09-27). Accepted 2026-09-24 (operator, scope Q5, "handle it
all in this ticket").

The reader's first question on opening a carb-ratio block is what happened after
these meals. The whole-chain overlay cannot answer it: 42 traces of up to twenty
hours on one axis, anchored at each chain's first meal. So the tile opens on By
meal — every block-hours meal on its own five-hour clock from its bolus, through
the Pattern comparison chart the reader already knows, in ran-high / ran-low /
in-range cohorts from the same credited claims "Highs after meals" counts (scope
Q2 A). The view is served as a comparison projection assembled exactly as the
Finding case file assembles a meals-family comparison (`project_cohort` per
cohort, then `name` and `anchor`, `window_min` from the window), and drawn
through a projection-level export of the comparison chart whose case-file guard
stays on its first caller — the seam has its second caller here, and the chart's
closed style map gains the three outcome keys on existing tokens.

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

## ADR 464 — The outcome tally reuses the Pattern's credited claims

**Status:** superseded by ADR 464 — The outcome tally reads each meal plainly
against the band (2026-09-27). Accepted 2026-09-24 (operator, scope Q2 A).

"Ran high" means one thing in this app. The tally over the block's 90-day meals
reads the same `attributed_levers` the Pattern roster reads — stamped by
`build_exposures(store, window_days=90)` on the meals-family occurrences and
credited by `credited_claims` with the roster's rate levers — and classifies each
block-hours meal: `highs_after_meals` → ran-high, `lows_after_meals` → ran-low.
It lives in the block-evidence preparation, which holds the store the exposure
feed needs; `attributed_occurrences`, which returns only the primary-driver map
and has no production caller, is not the authority and is not used. A
block-owned 70/180 tally would be cheaper and would be a second definition beside
the Patterns' that the reader will compare. The tally therefore inherits #461
(Late bolus counting an in-range meal as ran-high) until #461 fixes it in the
shared claims, which is where it belongs.

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

## ADR 464 — The outcome tally reads each meal plainly against the band

**Status:** accepted, 2026-09-27 (operator). Supersedes ADR 464 — The outcome
tally reuses the Pattern's credited claims.

Rendered on the operator's own data, the credited-claim tally contradicted the
glucose on the same screen. A meal that stayed inside the band apart from one dip
below it was labelled "ran high", and a meal that peaked far above the band was
labelled "in range". A credited claim answers which lever a Pattern blames for an
Occurrence, not what the glucose did after a meal, so the reader cannot check it
against the trace and stops trusting the panel. The operator ruled the tally out.

Each meal dosed in the block's hours is now read plainly over its own post-meal
window, from its bolus to the analyzer's post-meal horizon (5 h 15 min): its peak
and its nadir, when each fell, and whether it went above the band, below it, both,
stayed in range, or had no reading. A meal whose window holds no reading is
unread, never in range. Each meal also carries its peak before the run's next
bolus (a bolus under thirty minutes later is the same meal and is skipped), since
a later meal's rise is not this meal's outcome. The band is the analyzer's own
in-range band, served once on the tally so no client restates it, and so is the
length of the post-meal window. The block's tally counts those readings; the
reconciling sentence it once keyed is retired (ADR 464 — The backend serves the
reconciling sentence from a closed set, superseded).

The 90-day exposure pass the credited claims needed is gone from the block
evidence, and so is the pooled meal comparison built on its cohorts. The tally no
longer inherits #461, because it no longer reads the shared claims.

## ADR 464 — The block's one view: the ratio strip over the run timeline

**Status:** accepted, 2026-09-27 (operator). Supersedes ADR 464 — By meal is the
block's default view; the chain overlay is rebuilt as run strips.

The carb-ratio evidence tile has one view, in two lanes sharing one time axis, and
no view toggle.

- **Lane A, the ratio strip.** Each counted meal run is one dot at its measured
  carb ratio, sized by the weight the fit gave it, filled when it counts whole and
  a ring when it counts by carb share. The programmed, recommended and estimated
  ratios are three labelled rules, and the estimate's range is a faint band.
- **Lane B, the run timeline.** Each counted run is a stem from the glucose at its
  bolus to the glucose where the run ended, by date, between the band edges. The
  lows the harm arm lists are triangles at their glucose, filled on a counted run
  and outlined otherwise.
- **Readout.** Hovering or keying to a run's dot reads out the insulin behind it:
  its ledger terms and how it ended. Hovering a low reads out its delay after its
  bolus. A selected run is ringed on both lanes and presses its lows on the panel.
- **No per-meal marks.** The tile draws runs, because runs are what the ratio
  measures.

The form was reached on a mock built from the desk's own chrome and stylesheet,
rendered over a local snapshot of the operator's data that never left the
machine, through 27 rounds of fresh cold reviewers, and then the operator's reset
to this form. The rounds would not converge on any meal-anchored view. The
estimator judges whole meal runs, and most counted runs end after a later meal, so
"what happened after breakfast" is not the quantity the ratio measures. Every
meal-anchored drawing either implied the ratio was read at a moment it was not, or
drew scaffolding around that gap. The settled surface states the gap plainly
instead: the panel says how many counted runs ended after a later meal past the
block's end.

This leaves one question for the analyzer, outside this change's boundary: whether
a carb-ratio block should be measured over a window bounded by the block's own
meals rather than whole runs. That is an estimator change, and this change touches
no estimator.

## ADR 464 — Why this move is four sentences, then the case against, then the lows

**Status:** accepted, 2026-09-27 (operator). Replaces the panel plan (scope line,
balance-sheet row, outcome tally, run roster).

Beneath the unchanged numbers-and-staging block, the panel prints three captioned
sections of one-sentence lines. A line whose served facts are empty is left out.

- **Why this move**, four lines:
  1. how many counted runs measured looser or tighter than the programmed ratio,
     and that the estimate's range leaves the programmed ratio out (the served
     side counts and direction, the programmed value, the estimate's range);
  2. one fixed sentence on what the ratio counts: every unit a run used
     (boluses, corrections, Control-IQ basal changes), with the glucose change
     converted at the correction factor, judged where the run ended;
  3. how many counted runs ended after a later meal past the block's end, and how
     many ended lower, about flat or higher than they started (the served run
     ends);
  4. the recommendation's reason, served from the analyzer's own rule: half the
     gap from the programmed ratio toward the estimate, capped when the step cap
     bound it, rounded to the pump's step.
- **The case against**, one line: how many of the block's meals on counted runs
  peaked above the band before their next bolus, and how many counting later
  meals within the post-meal window; for a raise, that a looser ratio can raise
  peaks.
- **Lows after the block's boluses**: one population, the lows the harm arm lists,
  with their range of minutes after the bolus and the served sentence on how the
  lows on counted runs bear on the move. They are grouped on counted runs, on runs
  not counted, and after a bolus that is not one of these meals, each group
  headed by its served count. Each low is a row through the shared Occurrence
  roster and opens Day at its own moment, ringed. Hovering a low selects its run
  on the tile.

The run roster and the balance-sheet row are not on the panel. The balance sheet
is per run, in the tile's hover, where the reader is already looking at that run.
The breadcrumb reads the served counted-run and meal counts once the payload
lands. The block frame publishes its subject from the block it holds, so the Day
hop works from a queue row and from View segment alike. While the evidence loads
the panel prints "Loading run evidence…"; when it fails, is stale or is malformed
it prints "Run evidence unavailable." A block that is collecting, below its floor
or unmeasured alone keeps its numbers block and gains no section.

## ADR 464 — Served facts the settled surface prints

**Status:** accepted, 2026-09-27 (operator).

The backend added exactly these facts for the settled tile and panel, and the
block-evidence projection refuses a block missing any of them:

- **Per run:** how the run ended against where it started (lower, flat or higher)
  and the flat band, served once on the block; whether the run ended after a later
  meal outside the block's hours; the weight the fit gave it; the total correction
  insulin its ledger counted, summed once on the server.
- **Per block:** how its counted runs ended (lower, flat, higher, unread for a
  counted run with no outcome read — every run of a block pooling the no-outcome
  fallback — after a later meal, of how many); the block's asserted direction (raise, lower, or none); the
  recommendation with its rule, whose value and reason sentence are served only
  when the block asserts a move and are null on a hold, so the tile draws no
  recommended rule for a block that recommends nothing; the side's direction
  beside the side counts.
- **Per meal:** peak and nadir with their minutes after the bolus, the plain
  outcome, minutes to the run's next bolus, the peak before that next bolus, and
  whether the meal is on a counted run; on the tally, the band, the length of the
  post-meal window every meal was read over, and the counts of meals on counted
  runs that peaked above the band before the next bolus and anywhere in the window.
- **Per low:** the run its bolus belongs to, its group (counted run, uncounted run,
  not one of these meals), its minutes after the bolus and that bolus's carbs; on
  the harm row, the group counts and their total, the minutes range, and the
  bearing sentence.
- **Sensor gaps.** A store reading with no glucose value is dropped once, where
  the preparation slices every meal and run window, so no window holds one; a meal
  window holding only a gap reads as unread.

The frontend prints these facts and derives none of them: no count, side, end
class, group, band, threshold, direction or sentence is formed on the client. The
estimator, the pool rule, the eight-run floor, the caps, the harm arm and the
staging predicate are unchanged.
