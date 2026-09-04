# Findings consequence visual — scope ledger

Diagnose findings list: each finding surfaces its consequence — what the pattern
costs — directly in the findings list, via a shared visual slot each finding can
fill, instead of bare counts ("6 of 37 lows") that leave the reader to infer the
"so what" from the expanded chart.

## Decisions

- Consequence lives in the findings list itself, as a shared per-finding visual
  slot (e.g. a mini chart fragment), not (necessarily) a narration sentence.
  Why: counts without consequence read as "no shit"; the list is where the
  reader decides what to open. `inline`
- Consequence is derived from the already-computed matched-vs-comparison
  aligned series — the gap between the two traces after the event is the cost.
  No new modeling. Why: the counterfactual is already on the expanded chart,
  just never summarized. `inline`
- Event-aligned chart windows become per-finding instead of the global
  −5 h/+2 h (e.g. over-treated low reads at roughly −1 h/+2 h; five hours of
  lead-in flattens the part that matters). Why: the story starts at the event.
  `inline`

- ui-craft routed this to `revise` (shipped surface, synthetic data source),
  not lock: no mock, iterate the app branch, behavior ledger governs. `inline`
- Grounding facts (read from source, 2026-08-31): every behavioral lever gets a
  comparison cohort via `policy_for` (`analyzers/scenario/evidence_population.py`);
  the chart window is already per-exposure-family in `_WINDOWS` — MEALS (−60,
  +300), LOWS (−300, +120), CORRECTION_CLUSTERS (−300, +180), HIGHS (−150,
  +300). Item 2 is a values change to that table (lows' −300 lead-in is the
  −5 h the user objected to), not new machinery. `inline`

- Round 1 ruled: the slot is a **cost stat + gap fragment** — a leading number
  with a small matched-vs-comparison mini beneath it, gap filled. Why: the
  number answers "so what" at a glance; the fragment proves it. (User: "prob
  A", 2026-08-31.) `inline`
- Round 1 amended (user, 2026-08-31): the fragment IS the dock's existing
  per-finding event-comparison mini, reused in the rail row — "browsing these
  little charts is more insightful than anything on that right panel." The
  cost stat (Q2: peak vs mean vs separation phrasing) is deferred to a
  follow-up, added only if shape alone still leaves the "so what" gap. Data
  plumbing question dissolves: the page already fetches these series for the
  dock. `→ issue`

- Pivot (user, 2026-08-31): not a mini inside the existing rail row — the
  charts grid and the findings list merge into **one combined surface**: lead
  with the chart, finding title + impact as the card's text. Direction to be
  settled on a throwaway wireframe in `docs/scope/findings-consequence-visual/`
  (WIREFRAME — NO FIDELITY CLAIM — NOT LOCKABLE, deleted when the change
  lands). `inline`

- Direction ruled (user, 2026-09-01): **tapered urgency queue**, no further
  wireframing. The rail renders the existing ranking tiers with graduated
  detail: the top finding is a hero card carrying the full event-comparison
  chart and counts; the next tier gets a compact row with a sparkline mini;
  lower tiers collapse to expandable titles. Why: a flat list of 9 says
  "here's everything I noticed"; the taper makes the tool commit to "change
  this one thing." Supersedes the combined-surface variants (V1–V3 wireframe
  deleted; decisions survive here). Price statement deferred with Q2. `→ issue`

## Open questions

- What the shared visual fragment is (sparkline of the delta? paired traces?
  stat + fragment?) and whether a number accompanies it — divergent rounds own
  this.
- New window values per family (lows likely ~−60/+120; review the other three).
- Data plumbing: findings-list payload carries counts only; a per-finding mini
  series means either embedding a downsampled series in the findings projection
  (touches the JS mirror + frozen fixtures + drift checks) or lazy-fetching
  each finding's case file at rail render.

## Spawned tasks

- harmonichq/harmonic#302 — tapered urgency queue for the Diagnose findings
  rail, plus the per-family window retune. Discharges both `→ issue`
  dispositions above. Price statement (Q2) noted there as the follow-up.

## Triage — 2026-09-03, #302

Route: `/scope` ran with the operator's standing delegation in place of an
interview. Connor Griffin · 2026-09-03: "I want you to make your best judgment
on all of this … it should feel premium, it should tell the user the story that
they're trying to understand. It should help the user be able to diagnose
themselves when they first open the page … It should not lie, it should not
over-editorialize, but it should look premium and it should work on a tablet and
on a computer. That's it. Make your best judgments." Every decision below is the
agent's judgment recorded under that delegation; the composition decisions in
`docs/scope/diagnose-workstation-composition.md` and the #302 issue comment of
2026-09-01 are fixed points and were not re-opened.

### Decisions

1. **The hero is rank 1 by served position, and there is no "Decide now".**
   The findings projection stamps three tiers — `next_in_line` (every priced
   asserting row), `worth_a_look` (every other priced row), `noted` (unpriced) —
   and `_assign_tiers` refuses a cross-parameter headline on purpose (#41: "the
   server has no cross-parameter headline, so selecting the first such row would
   claim more than its independent assertion establishes"). The frontend must
   not invent that fourth word. The hero is the first shown priced ranked row
   in the server's order (rank 1, the row whose chart the stage already holds
   under ADR 306), and it prints its own served tier word. The taper says
   "start here"; the tier word says what the engine actually claims. `inline`
   Corrects the issue body's premise that four tiers are served.

2. **Hero = headline + facts, no chart.** Fixed by #305 Q7 and the 2026-09-01
   comment. The hero card renders the served `headline` cut at its first
   sentence end (title) with the remainder as subtitle — the same cut the stage
   card makes, composing nothing — plus the row's existing single detail line
   (counts or numbers) and its flavor tag. Its chart is the promoted stage
   chart at left. `inline`

3. **Compact rows draw the drawer's own mini.** Every remaining priced row
   (rank 2 onward, in served order) is a compact row: rank numeral, title, one
   detail line, and a small chart at the row's end drawn by the same registry
   entry `option(mode, { mini: true, … })` the drawer's mini cell draws, over
   the same `descriptor.data` the workstation already fetches for every
   descriptor whether or not the drawer is up (`fetchTile` runs over every
   descriptor in the reconcile loop). No new endpoint, no new fetch path, no
   downsampled series in the projection (ADR 306 rules the case file out as a
   projection source). A pending or stale descriptor shows the drawer's own
   pending/stale mark in the mini slot, never a blank. `inline`

4. **The `noted` tail is title-only, and drilling is its expansion.** Unpriced
   ranked rows keep the existing seam sentence as their caption and render as
   title-only lines; clicking drills exactly as every row does today. No second
   disclosure control: Watching already owns the collapsed held/blind/history
   reads and is unchanged. `inline`

5. **Tier captions are the served words, verbatim, at tier boundaries only.**
   `Next in line`, `Worth a look`, `noted` — printed once where the served tier
   changes between consecutive shown rows; the hero carries its own word in its
   kicker. No 0–100 number anywhere. `inline`

6. **Alignment windows: lows (−60, +120), correction clusters (−120, +180);
   meals (−60, +300) and highs (−150, +300) keep.** The issue's proposed values
   adopted as-is. One table (`_WINDOWS`) is the source; every other encoding is
   enumerated in the change's tasks and moves in the same chunk. `inline`

7. **Tablet is a render-matrix obligation, not a re-layout.** The workstation's
   one breakpoint is 760px; at 768–1024 the stage stays and the inspector holds
   its 430px column. The order requires rendered evidence at 1024×768 and
   768×1024 beside 1440×900, 1280×800 and 390×844, and one graceful rule: below
   a measured row width the compact row omits its mini and keeps its facts.
   Moving the breakpoint is out of scope. `inline`

8. **Premium is settled at the running app, within DESIGN.md.** Type ranks,
   spacing and the hero's card treatment are chosen in the live revise round
   against the served showcase, under the 1.5rem no-hero cap and the existing
   Title/Label/Body ranks the stage card already uses; the build records each
   choice as a dated entry in the change's design record. `inline`

9. **Price statement stays deferred** (issue body "Out of scope"). `→ issue`
   (already noted on #302 as the follow-up.)

### Shape

Chunked, three serial chunks: (1) the alignment-window retune across every
encoding; (2) the tapered rail in the shipped app with node tests; (3) the live
run — ledger amendments, replay, render matrix, evidence. Traits fired: live run
inside the ticket, lifecycle-gated surface revision, lockstep copies of one fact,
multiple deliverable artifacts. The repository's reviewer memory holds nearby
anchors that agree with splitting a shipped Diagnose revision at the live run
and with keeping analyzer-side semantics out of the surface chunk.

### Review rounds

(instrumented below as rounds run)
