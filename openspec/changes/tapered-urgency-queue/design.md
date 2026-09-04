# Design — the tapered urgency queue (#302)

Safe start for every serve in this change: the QA copy-then-serve command in
`AGENTS.md` "The data boundary" (`cp mockups/qa-e2e.synthetic/harmonic.sqlite`
to scratch, then `uv run harmonic serve --no-fetch --token '' --db "$scratch"
--port <n>`), whose database `scripts/gen_qa_e2e_db.py` generates in full from
the case catalog. Every source is synthetic; no operator or patient data is
read. This shipped-surface revision creates no lock manifest; the behavior
ledger `mockups/finding-evidence-routing.behavior.md` and its app-only replay
`frontend/diagnose-workstation-behavior.replay.mjs` remain the contract. UI
Craft routed it `revise` (embodiment shipped, runnable, declaration complete,
data source synthetic) at triage on 2026-09-03.

Every decision below was taken by the triaging agent under the operator's
delegation of 2026-09-03 ("make your best judgment on all of this … it should
not lie, it should not over-editorialize, but it should look premium and it
should work on a tablet and on a computer"), recorded in
`docs/scope/findings-consequence-visual.md`. The composition fixed points
(#305; the #302 comment of 2026-09-01) were not re-opened.

## ADR 302 — The rail tapers by served position and prints only served tiers

**Decision.** The un-drilled rail renders the findings projection's rows in
the server's order at three weights, chosen by served facts alone:

- **Hero** — the first shown priced ranked row (`register` `assert` or
  `finding` with a non-null `priority`, after any sift): a card whose title is
  the served `headline` cut at its first sentence end and whose subtitle is the
  remainder (the same cut the stage card makes; one-sentence headlines have no
  subtitle), followed by the row's existing single detail line (the number pair
  or the support/appearance counts) and a kicker carrying the flavor word and
  the row's served tier word. It draws no chart: under ADR 306 the stage already
  holds this row's chart, and nothing renders twice.
- **Compact** — every further priced ranked row: rank numeral, title, flavor
  tag, one detail line, and a mini chart at the row's end (ADR below).
- **Tail** — every unpriced ranked row (`tier` `noted`): title-only line under
  the existing seam sentence `Not recurring often enough to rank yet.`, drilling
  on click as every row does. Held, blind and history reads stay collapsed
  behind `Watching · N reads` exactly as shipped.

A tier caption prints the served tier word verbatim — `Next in line`,
`Worth a look`, `noted` — once, where the tier of consecutive shown rows
changes; the hero's kicker carries its own. The frontend derives no rank, tier,
floor, direction or threshold: `queueRows` keeps walking the server's order and
the new weight is a function of `priority == null`, position among shown priced
rows, and the served `tier` string.

**Why.** The projection stamps three tiers and refuses a fourth on purpose
(`_assign_tiers`, #41: "the server has no cross-parameter headline, so selecting
the first such row would claim more than its independent assertion
establishes"). A hero labelled "Decide now" would be a verdict the engine never
published — the must-prevent line. Position is already the whole ranking
statement (slice-2 ruling; S118), so spending the most space on position 1 says
"start here" without claiming more than rank. The issue body's four-word tier
set is corrected to the three the server serves; DESIGN.md's vocabulary rule
stays a cap on what may be said, not a promise that all four are said.

## ADR 302 — Compact rows draw the drawer's own mini from data already fetched

**Decision.** A compact row's chart is the registry entry's own mini option —
`DIAGNOSE_EVIDENCE_CHARTS` `entry.option(mode, { data, range, mini: true,
window, caseFile, surface })`, the call the drawer's `mini` seat makes — mounted
on a small host inside the row and fed the descriptor's `data` the workstation
already fetched: `fetchTile` runs over every descriptor in the reconcile loop
whether the drawer is up or hidden, so no request is added and no series is
added to the projection (ADR 306: the Finding case file is not a projection
source). A descriptor whose runtime is pending or stale shows the drawer's own
pending or stale mark in the mini slot, never an empty box. The mini is
furniture: below a measured row width it is omitted and the row's facts stay.
Row minis are mounted after the row is in the DOM (ADR 215 amendment) and
disposed when the queue repaints, the same discipline the drawer cells follow.

**Why.** The operator's finding (2026-08-31): "browsing these little charts is
more insightful than anything on that right panel." The dock already draws
exactly those charts at cell size; a second renderer, a second fetch, or a
projection-side sparkline would be the duplicate implementation the charter
forbids, and the last would need a store the projection does not have.

## ADR 302 — Lows align at −60/+120, correction clusters at −120/+180

**Decision.** `_WINDOWS` becomes `LOWS: (-60, 120)`,
`CORRECTION_CLUSTERS: (-120, 180)`; `MEALS: (-60, 300)` and `HIGHS: (-150,
300)` are unchanged, as are the two lever-specific policies (`MISSED_MEAL`,
`MEAL_BOLUS_SHORT`) at (−60, 300). The served case-file `window_min` and every
trace follow the table automatically; the committed encodings that restate the
old values are enumerated in `tasks.md` §1 and move in the same chunk.

**Why.** The story of an over-treated low is the drop into it and the divergent
recovery; five hours of lead-in flattens both (operator, 2026-08-31). Two hours
before a correction pair is enough to show the first correction that makes the
second one stacking. The table was already per exposure family (issue body,
verified at triage); this is a values change, not new machinery.

## Render matrix

Before/after renders from the base and the revision served on the same showcase
copy, at 1440×900, 1280×800, 1024×768, 768×1024 and 390×844: the queue root in
a window that ranks every weight (hero, at least one compact row, at least one
`noted` row, Watching collapsed), the Watching expansion, a sift that empties
the hero, and a compact row's drill. Dark only (#304). Stored under
`openspec/changes/tapered-urgency-queue/evidence/renders/`.

## Live-round rulings

Appended by the executing session, one dated entry per ruling on the hero's
card treatment, type ranks and spacing, each within DESIGN.md's 1.5rem no-hero
cap and the stage card's existing Label/Title/Body ranks.

## Base story counts

Recorded by the executing session against the base worktree before any product
code changes.
