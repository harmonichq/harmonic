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

A tier caption prints once where the served `tier` of consecutive shown
**priced** rows changes; the hero's kicker carries its own tier. The tail
prints no caption — the seam sentence already labels it. The server stamps
slugs (`next_in_line`, `worth_a_look`, `noted`), not display words, so the rail
carries one pinned map `TIER` beside its existing `FLAVOR` map whose domain is
exactly those three slugs and whose range is DESIGN.md rule 4's words —
`Next in line`, `Worth a look`, `noted` — and nothing else; an unknown slug
renders no caption and no kicker word rather than a guess. The frontend
derives no rank, tier, floor, direction or threshold: `queueRows` keeps walking
the server's order and the new weight is a function of `priority == null`,
position among shown priced rows, and the served `tier` slug.

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
furniture: when its own host element measures narrower than the named constant
`MIN_ROW_MINI_WIDTH` (provisional 120px in sub-order 2, ruled at the running
app in sub-order 3 and recorded under `## Live-round rulings`), the row omits
the chart, marks `data-mini="omitted"`, and keeps its facts. The host is
measured, not the row and not the field: `measureFieldNarrow`'s 280px is the
floor for a plot that fills the tile field and says nothing about a row-end
mini, and a row is only ever measured while the rail is painted and visible.
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
trace follow the table automatically. `ciq_autotune/event_comparison.py` also carries `VIEW_CONFIG[...]["window"]`
literals, but they are dead: the standalone `/api/diagnose/event-comparison`
route is retired (`tests/test_findings_projection.py`
`test_retired_behavioral_event_comparison_route_is_not_served` pins the 404),
the only reader of that key is `_build_catalog_capture`, which nothing calls,
and the live readers of `VIEW_CONFIG` (`EVENT_CHARTS`, `finding_case_file.
_event_anchor`) read `factors`, `anchor_kind` and `anchor_label` only. So
`_WINDOWS` is already the one live Python source of the alignment fact; the
dead literals are left untouched rather than wired to a table nothing reads
through them (a test of that wiring would compare a constant to its own
definition — the silent-green shape the risk contract forbids). The
committed encodings that restate the old values — three Python tests, the
`#677` capture generator and its fixture-only projector `project.mjs`, the S13
replay story, and three generated artifact sets — are enumerated in `tasks.md`
§1 and move in the same chunk. `tasks.md` itself quotes the old values in prose
and is a sanctioned residue.

**Why.** The story of an over-treated low is the drop into it and the divergent
recovery; five hours of lead-in flattens both (operator, 2026-08-31). Two hours
before a correction pair is enough to show the first correction that makes the
second one stacking. The table was already per exposure family (issue body,
verified at triage); this is a values change, not new machinery.

## Render matrix

Before/after renders from the base and the revision served on the same showcase
copy, at 1440×900, 1280×800, 1024×768, 768×1024 and 390×844, dark only (#304),
stored under `openspec/changes/tapered-urgency-queue/evidence/renders/`. The
window is the showcase's **24 h** queue (no `start_min`/`end_min`), the one
served window that ranks every weight. Dumped at triage on 2026-09-03 from the
declared no-fetch serve of `mockups/qa-e2e.synthetic/harmonic.sqlite`
(`GET /api/diagnose/findings`), `id register tier priority`:

```
basal:180-240              assert   next_in_line  55
finding:over_treated_low   finding  worth_a_look  22   (event chart)
finding:correction_on_iob  finding  noted         null (event chart)
finding:meal_bolus_short   finding  noted         null
ich1_WzAsMTQ0MCwiMTIiXQ    history  noted         null
```

So the 24 h root renders one hero (basal, its chart on the stage), one compact
row with a mini, one `Worth a look` caption, two title-only tail rows and a
collapsed Watching of one read. The four presets rank at most one priced row
(Overnight: the basal hero alone; Afternoon: `over_treated_low` as hero;
Morning and Evening: no priced row, no hero), so they are not matrix states.
States: `queue-root`, `watching-expanded`, `drill-compact` (the compact row
drilled, its chart on the stage), `drill-tail` (a tail row drilled). A sift
cannot hide the showcase hero (the basal row carries no chips), so hero
promotion under a sift is proven by the node test in `tasks.md` §2, not by a
render. The replay's own row mix is neither: `frontend/diagnose-workstation-behavior.
replay.mjs` answers `/api/diagnose/findings` from the fixture-only mirror
(#735) over one of two input sets, dumped at triage on 2026-09-03 with
`node --input-type=module` calling `projectFindings(inputs, null, null)` from
`mockups/findings-projection.mirror.mjs`, `id register tier priority chips`:

- Default (a story opened without `history` or `findingsInputs`; inputs are
  `payload.analyze`/`exposures`/`scenarios` plus the fixture's `event_charts`):
  four unpriced finding rows and nothing else — no hero, no compact row, no
  caption:

  ```
  finding:over_treated_low   finding noted null ["highs"]              (event chart)
  finding:correction_on_iob  finding noted null ["lows","corrections"] (event chart)
  finding:missed_meal        finding noted null ["highs"]              (event chart)
  finding:late_bolus         finding noted null ["highs","meals"]      (event chart)
  ```

- Fixture inputs (a story opened with `history: true`, or passing
  `frontend/__fixtures__/findings-projection.json`'s `inputs`): the frozen
  `windows.global` rows:

  ```
  ic:720                     assert  next_in_line 66   ["highs"]
  basal:30-90                assert  next_in_line 39   ["highs"]
  basal:330-360              assert  next_in_line 39   ["highs"]
  finding:over_treated_low   finding worth_a_look 28   ["highs"]         (event chart)
  finding:carb_undercount    finding worth_a_look 21   ["highs","meals"] (event chart)
  finding:correction_on_iob  finding noted        null ["lows"]          (event chart)
  finding:correction_stacking finding noted       null ["lows","corrections"] (event chart)
  ich1_WzAsNzIwLCI2Il0       history noted        null []
  ```

  So a story that needs the hero, a compact row, the one `Worth a look`
  caption or the tail opens with the fixture inputs; a sift selecting only
  `meals` hides every other priced row and promotes `finding:carb_undercount`
  to hero, which is the hero-promotion story.

## Live-round rulings

Appended by the executing session, one dated entry per ruling on the hero's
card treatment, type ranks and spacing, each within DESIGN.md's 1.5rem no-hero
cap and the stage card's existing Label/Title/Body ranks.

## Base story counts

Recorded by the executing session against the base worktree before any product
code changes.
