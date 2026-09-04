# Scope — 291 basal drill-down entry and inspector pane

Ticket: harmonichq/harmonic#291. Route: interview mode (a concrete author's spec
exists, untested, and partly contradicted by the shipped tree).

## Decisions

- **#291 is frontend-only.** Operator, at triage open. No engine work in this
  ticket; an engine gap becomes a separate spike ticket. → issue (spike, if a gap
  survives scoping)
- **Excluded nights are not itemised by reason.** Operator: a user does not need
  to investigate every discarded night that deeply. #290 closed with only its
  verdict-triad half delivered (#292); the exclusion-reason half was never built
  and is not built here. `inline`
- **The ticket's premise is partly wrong, and it shrinks the work.** The bare
  per-night list is only what the chart-click path renders
  (`renderParameterEvidenceDetail`, frontend/diagnose-workstation.js:698). The
  findings-row path already renders the estimate, its interval, the recommended
  value, the in-words interval-contains-programmed hedge, the verdict word and the
  support count. Unifying the entry therefore delivers the spec's top two
  priorities on its own. `inline`
- **The support floor is read, never re-derived.** `basal_support_floor` is served
  and already reaches the frontend (diagnose-workstation-data.js:83, read at
  diagnose-workstation.js:1206). The duplicated literal at
  diagnose-workstation-chart.js:318 is a known desync trap
  (docs/scope/263-findings-engine-audit.md:95) and the pane must not use it. `inline`

- **One drill-down interface, for every chart.** (Q1 = B) Operator: only one
  drill-down interface should exist across all charts, not a basal-only fix. The
  chart-click gesture and the findings-row gesture reach the same panel for basal,
  correction factor and carb ratio alike. `inline`
- **The drill-down is redesigned from scratch, not amended.** (Q3) Operator: the
  existing panel was not designed, it was agent output from a fast, distant
  iteration, and the rebuild is not beholden to it. This retires the incremental
  framing in the ticket's own priority list. `inline`
- **The surface is locked before any engine work is committed to.** (Q2, deferred)
  Operator will not fund backend features for a front end not yet agreed. The
  glucose items stay open questions the locked design answers, not scope decided
  in advance. Route: `/ui-craft` lock phase, producing wireframes/mockups the
  operator signs off. → issue (spike, only if the locked design needs served data)
- **#291 is not work-orderable yet.** Its dominant uncertainty is now what the
  surface should look like, so triage cannot post an execution lock until the
  visual spec is locked. `inline`

- **The work splits, and #291 becomes the panel redesign.** (Q4/Q5) Operator: the
  routing unification is filed as its own issue and lands FIRST; #291 is then the
  design-led panel redesign, blocked on it. Both revise the same frozen surface
  (`mockups/finding-evidence-routing.behavior.md`), so they share one behavior
  ledger and cannot run in parallel. Routing first re-freezes that ledger once and
  removes the second panel before its replacement is designed, leaving the design
  conversation one subject. → issue: filed as #294
- **#291 gets no execution lock at this triage.** Its dominant uncertainty is the
  design, the design is not locked, and it is blocked on an issue that lands
  first. UI Craft routed the surface to `revise` (shipped, offline-runnable,
  declared synthetic source), which requires the frozen ledger replayed,
  re-inventoried and re-frozen against the offline app before a replacement layout
  is discussed or a wireframe drawn. A from-scratch mock of a shipped surface is
  refused, so the sub-agent wireframe shortcut is not available. `inline`

## Re-triage — 2026-08-31, after #294 merged (PR #296)

- **#294 has landed and this branch is rebased onto it** (`c780c67`). The blocking
  prerequisite in the decisions above is discharged, and the design phase may
  start. `inline`
- **One panel across all three settings is already shipped, not owed.**
  `renderParamLevel` (frontend/diagnose-workstation.js:728) is a single component
  that basal (`renderSlotLevel`), carb ratio (`renderIcBlockLevel`) and correction
  factor (`renderIsfLevel`) all substitute words into. The redesign therefore
  changes one component and reaches all three by construction; "make it work for
  three evidence shapes" is a constraint on the design, not a build task. `inline`
- **The bare per-night list no longer exists anywhere.**
  `renderParameterEvidenceDetail` was retired by #294; grep finds no reference in
  `frontend/`. The panel today carries head + verdict, an optional scope sentence,
  Current / Estimate / Recommended, the CI line, the interval-contains-current
  hedge, the recommendation-not-between hedge, the support count, the analyzer's
  sentence, and either the stage control or a foot note saying why there is
  nothing to stage. The roster is rendered by the evidence CHART, not the panel.
  This retires description item 6 as stated: a per-night table in the panel would
  restate the nights the chart beside it already draws. `inline`
- **Every parameter already has its own served roster**, so roster-derived panel
  content needs no engine work: `/api/diagnose/basal-night-evidence` (nights),
  `/api/diagnose/isf-rest-window-evidence` (windows + steps),
  `/api/diagnose/carb-ratio-block-evidence` (runs + series). Only the GLUCOSE
  items remain unserved, exactly as recorded above. `inline`
- **The behavior ledger is freshly frozen.** #294 amended and re-froze
  `mockups/finding-evidence-routing.behavior.md` at base `b4b8a78`, 146 of 146
  stories passing, and committed before/after basal captures. The design phase's
  replay therefore starts from a current freeze rather than a stale one. `inline`

### Route

`/ui-craft revise` on the Diagnose settings drill-down panel, starting at the
behavior-ledger replay against the offline app, per the decisions above.

### Base established — 2026-08-31 (UI Craft `revise` §0-§2)

- **Safe-start declaration verified.** `CLAUDE.md`/`AGENTS.md` declare the exact
  entrypoint `uv run harmonic serve --no-fetch --db
  mockups/revise-e2e.synthetic/harmonic.sqlite`; the named source is the
  committed synthetic database generated in full by `scripts/gen_revise_e2e_db.py`
  from fixed seed 620. Route script returns `{"mode":"revise","reason":"safe
  synthetic data source declared"}`. `inline`
- **Base SHA `c780c67`** (#294's merge), with this branch rebased onto it.
  `inline`
- **The frozen behavior ledger replays 146 of 146 against this base app**, so the
  contract #294 re-froze holds on current main and the design phase starts from a
  fresh freeze rather than a stale one. `inline`
- **Base panel states captured** at 1440x900 in both themes for all three
  parameters (S121, S122, S123, S124, S126 evidence points), held in session
  scratch pending the design conversation. `inline`
- **Inventory drift, non-behavioral:** ledger entry P40's source pointers still
  read `frontend/diagnose-workstation.js:635-694` and callers `696-844`;
  `renderParamLevel` now sits at 728-786 with callers at 789-941. The behavior is
  unchanged, so this is a pointer refresh owed at the next amendment, not a
  retirement. `inline`

### Observed on the base, feeding the design round

- The panel's **conclusion is its least prominent element**: the verdict phrase
  ("suggests a tighter ratio", "corrections look stronger than needed") renders as
  the smallest dimmest text in the head, while CURRENT / ESTIMATE / RECOMMENDED
  dominate. PRODUCT.md's two-tier-disclosure principle is conclusion first.
- The panel **restates the support denominator the header prints one line above**
  ("24 meal runs · 24 meals" appears in both the crumb row and the panel body).
- A **zero-width interval prints as an interval** ("CI 4.29-4.29 g/U on the
  estimate") with no remark, on a product whose stated principle is to show
  uncertainty rather than hide it.
- `RECOMMENDED --` **holds a full prominent row when there is nothing to
  recommend**, in every held state.
- The panel occupies roughly the top third of its rail and leaves the rest empty
  in all three shapes.

### Direction — 2026-08-31, operator ruling on round 1

- **The chart is a chart; the panel certifies the information.** (Q1) Operator:
  the previous round treated chart and panel as separate items and the chart did
  not know the panel existed, so it over-editorialised. The chart keeps what is
  genuinely graphical -- the per-night bars, the confidence interval, the
  programmed rate against the estimate, and the visible fact of whether the set
  rate falls inside the interval. `inline`
- **The chart's headline sentence comes out**, and **the more/less/exactly/excluded
  tally comes out of the chart and into the panel**, where it becomes the entry to
  a drill rather than a static count. `inline`
- **The panel gains a per-night drill.** Clicking a night's row in the chart
  selects it; the panel shows that night's detail and steps night by night. The
  reader's question is "usually this slot needs 0.6 and that night it needed three
  times that -- why", so the detail must carry enough context to start answering
  it. `inline`
- **Selecting a night draws that night's trace on Glucose by time of day.**
  Operator, explicit. `inline`
- **Restraint is a constraint, not a preference.** No proliferation of new charts
  or visual elements; the screen already carries a lot of visualization. A small
  confidence-interval graphic or a small surrounding-blocks graphic is admissible,
  a new full chart is not. `inline`

### The precedent this should reuse (found on the base, not invented)

The **behavioral** branch already ships the whole interaction the direction
describes, and the parameter branch simply never received the payload to drive
it:

- grouped roster rows, each a button with `aria-pressed`
  (`renderCaseRoster` / `renderEventComparisonRoster`,
  frontend/diagnose-workstation.js:590-655);
- a selected-item detail block carrying date, verdict tag, and an `n of N`
  position with the up/down key hints -- the night-by-night stepping
  (`renderCaseSelection`, frontend/diagnose-workstation.js:656-696);
- an "Evidence facts" list under it;
- the selected occurrence's **server-owned glucose trace painted over the pooled
  envelope** on Glucose by time of day (frontend/diagnose-workstation.js:2283-2302),
  with "Clear trace" and "Open <date> in Day".

So the frontend mechanism for stepping and for the trace exists and is proven.
What does not exist is the served per-night detail for a settings parameter.

### Served-data gap, measured

`/api/diagnose/basal-night-evidence` serves per night only
`{date, delivered_rate, programmed_rate, sign, t}`, plus `roster_count`,
`directional_support_count` and a bare `excluded_night_count`. Confirmed against
the running no-fetch app:

- **no per-night glucose of any kind** -- not entry, not exit, not in-block mean;
- **no per-night exclusion reason** (bare count only, as recorded above);
- **no neighbouring-slot delivery** for a selected night;
- **and Glucose by time of day carries no per-day trace at all.** Both it and
  `/api/explore/time-of-day` are pooled percentile envelopes (bins with
  median/p10/p25/p75/p90 over N captured days). The behavioral branch's trace
  comes from its case file's own `detail.glucose`, not from the envelope feed.

The direction therefore requires the spike foreseen by decision 1: a served
per-night detail for a settings parameter, shaped like the case file's existing
per-occurrence detail so the shipped renderers and the shipped trace path are
reused rather than duplicated.

### Round 2 ruling — 2026-08-31

- **One component and one drill-down for every chart** (Q3). Operator: features may
  be customised per chart where a chart needs it, but bespoke per-chart components
  are refused, at least for now. This confirms and strengthens P40's existing
  one-panel rule rather than introducing it. `inline`
- **The other two charts are not restructured in this ticket.** Operator does not
  want #291 bogged down in correction factor and carb ratio. The settled direction
  is carried to them by comment on their existing open review tickets --
  **#206** (correction-factor rest-windows chart) and **#207** (carb-ratio
  meal-runs chart) -- rather than by new tickets. `-> comment on #206, #207`
- **No component-retirement ticket is owed.** Verified against the tree: there is
  no second panel component left to retire. `renderParamLevel` is the single
  component and #291 rebuilds it in place; `renderParameterEvidenceDetail`, the
  component that would have needed retiring, was already retired by #294. The
  operator's proposed retirement ticket has no subject. `inline`
- **The trace target is confirmed as the always-present Glucose by time of day
  chart** (Q4) -- the same pooled-envelope canvas the behavioral branch already
  paints its selected occurrence's trace onto. Same surface, proven mechanism.
  `inline`
- **The panel's per-night rows carry glucose aggregates, so divergence from the
  norm is separable from the norm needing correction.** Operator's worked example:
  the slot's typical in-block mean is 115 against a 110 target, three nights ran
  130, and those three are a big-meal carry-over rather than a basal problem. That
  requires the night's own in-block mean AND the block-level mean to compare it
  against. `inline`

### Premise correction, verified

The operator recalled "a component that lets people tab between over / under /
excluded, with table support". **No tabs exist anywhere in `frontend/`** -- zero
matches for `role="tab"`, `tablist` or `aria-selected`. What ships is verdict
GROUP HEADERS in a single scroll (`ev-group`, frontend/diagnose-workstation.js:594,
625). The table half of the recollection is correct: `.ev-row` is a five-column
grid -- `when`, `entry`, `arrow`, `worst`, `delta`
(frontend/diagnose-workstation.css:1636-1657) -- so the behavioral roster already
prints entry glucose, worst glucose and a delta per occurrence. That is the column
vocabulary the basal night rows want, and it is precedent rather than new design.

### Round 3 ruling — 2026-08-31, and the resulting slicing

- **The convergence goes first, as its own ticket, and #291 waits on it.**
  Operator: "if it means we have to pause here, start a new ticket for that work,
  and then apply the customizations in this ticket once that has landed, that's
  fine… I don't really care how we slice it." Operator handed the slicing call to
  triage and it was taken on the operator's own proposed shape, which is better
  than the recommendation it replaced: convergence-first avoids rebuilding the
  settings panel twice, which convergence-after would have required (the #53
  anchor — replacing in-flight scope is work of its own). `→ issue: filed as #298`
- **The extraction has an unusually crisp gate.** A pure extraction is proven by
  the frozen ledger replaying 146 of 146 with ZERO story amendments. An amendment
  means a behavior moved and it stopped being an extraction, so the amendment
  blocks rather than gets recorded. `inline`
- **The per-night glucose payload belongs in `analyze_basal`, not the projection.**
  `ciq_autotune/basal_night_evidence.py` opens by declaring it only copies facts
  stamped by the analyzer and `"nights"` is `night_roster` passed through verbatim,
  so the analyzer stamps the new facts and the projection stays a pass-through. It
  is backend-only and #298 is frontend-only, so the two run in parallel.
  `→ issue: filed as #299`
- **Q6 was decided by triage under a stated assumption, not by the operator.**
  #299 is filed for the night's in-block mean, its entry and exit glucose, that
  night's trace, and the slot-level mean to read them against — recommendation B
  of round 3. The operator was fatigued and handed over the slicing; this is the
  cheapest decision to correct, by comment on #299. `inline`
- **#206 and #207 are NOT commented yet.** The settled direction reaches the
  correction-factor and carb-ratio chart tickets once #291's design locks; a
  half-settled direction commented now would have to be corrected there later.
  Held deliberately. `→ comment on #206, #207, at lock`

## Slicing as it now stands

- **#298** — converge the two inspector panel families into one roster-and-drill
  component. Frontend only. Blocks #291.
- **#299** — serve per-night glucose evidence for a basal slot. Backend only.
  Parallel with #298. Consumed by #291.
- **#291** — the settings drill-down redesign: the chart sheds its headline and
  its tally, the panel gains the tally as the entry to a per-night drill, and a
  selected night draws its trace on Glucose by time of day. Waits on #298; its
  glucose columns wait on #299.

## Open questions

- Q2 (carried, now answered by the lock) do the glucose items — average in-slot
  glucose, in/below-range counts, Day-strip banding, entering-glucose trace —
  survive into the locked design, and what do they cost in served data.
- Q4 (moot under Q1 = B plus a from-scratch rebuild) the thin readout branch is
  retired by the redesign rather than decided separately.

## Spawned tasks

- #294 — the routing unification, filed and landing first. Discharged.
- `/ui-craft revise` for the Diagnose drill-down panel — the design phase #291
  now is. Starts at the behavior-ledger replay and re-freeze, after #294 ships.

## Re-triage — 2026-09-02, after #298 and #299 landed: held on #306

- **Branch merged with origin/main at `353b55e`**, taking main's deletion of the
  retired revise-e2e database (the QA showcase replaced it, #319/#321). `inline`
- **#298 shipped narrower than its issue text, and that is recorded in its own
  ADR 298.** The shared roster renderer (`frontend/occurrence-roster.js`) has two
  Finding callers; the settings drill (`renderSlotLevel` → `renderParamLevel`)
  still renders no roster, no selection and no trace. #291 is therefore the
  renderer's third caller AND the night roster's author, not merely its click
  wiring. `inline`
- **#299's facts are served and stubbed.** Each roster night carries
  `glucose_mean`, `glucose_entry`, `glucose_exit` and a `glucose_trace` of
  `{t, minute, bg}` points spanning the preceding hour and the slot; the roster
  carries `roster_glucose_mean`. Verified live on the QA showcase
  (`/api/diagnose/basal-night-evidence?slot=11`: 30 nights, 19-point traces) and
  in the generated replay stub `frontend/__fixtures__/basal-night-evidence.json`
  (7 nights, 19-point traces). The trace path at
  `frontend/diagnose-workstation.js` (`envelope.labels.map` over
  `detail.glucose` by `t.slice(11, 16)`) consumes that shape unchanged. `inline`
- **The trace target survives #306.** Glucose by time of day is the canvas's
  first slot; #306's active-chart rule governs the second slot and the drawer,
  so a selected night's trace lands on an always-present chart under either
  order. `inline`
- **#291 does not depend on #306's code, only on its sequence.** Both revise the
  same frozen ledger (`mockups/finding-evidence-routing.behavior.md`) and the
  same workstation module, so they are serial either way; which goes first was
  put to the operator. `inline`
- **Operator ruling (Q1 = A): hold #291 until #306 lands.** "I'll do 306 and
  then I'll come back to this." No execution lock is posted; the parent's order
  of work stands as written. `inline`
- **UI Craft route re-confirmed: `revise`** — shipped, runnable, complete
  declaration (`AGENTS.md` QA copy-then-serve command), synthetic source
  (`mockups/qa-e2e.synthetic/harmonic.sqlite`, generated by
  `scripts/gen_qa_e2e_db.py`). `inline`
- **This session's own replay did not complete**: it was started against a
  scratch copy of the showcase on port 8767 and aborted when that server was
  stopped underneath it. The merged base's 146 of 146 rests on the #298 and #299
  merge records, not on a run from this session. The next triage replays first.
  `inline`
- **Slicing expectation, for the next triage.** Two rubric traits fire —
  lifecycle-gated surface revision and a live run inside the ticket — so the
  order chunks, serial, split at the live run: (1) roster, selection, detail
  block and trace with node tests and the route-stubbed browser suite; (2) ledger
  amendment, new replay stories, the no-fetch run and its corrections, and the
  render matrix. The nearest reviewer-memory anchors agree with a serial split
  at the run. `inline`

### Frontier carried to the next triage (unanswered)

- **Q2 — roster grouping.** A: three group headers (ran above / ran below / ran
  as set) with excluded nights as a count line only. B: one flat list, newest
  first. Recommendation A: the tally becomes the entry to the drill through the
  shared renderer's own groups; excluded nights carry no per-night facts, so they
  cannot be rows.
- **Q3 — the selected night's detail block.** A: date, delivered vs programmed
  rate, that night's in-slot mean against the roster mean, entry to exit glucose,
  n of N, Clear trace, Open in Day. B: trace and pressed row only.
  Recommendation A: mirrors the Finding selection block and answers the
  operator's "is this night unusual or is the slot wrong" example.
- **Defaults assumed unless overruled:** the parent #305 risk contract carries
  over unchanged; the chart keeps its headline and tally until #306 moves them;
  arrow-key stepping and Open in Day follow the Finding roster exactly.

## Triage — 2026-09-03, after #306 landed: frontier settled, change authored

- **Branch merged with origin/main at `88fddd5`** (main tip `705a876`, #306 via
  PR #325). `inline`
- **Base replay green from this session:** `app: 151 of 151 stories passed`
  against the merged base through the declared no-fetch command on a scratch
  copy of the QA showcase, port 8767; 33 retirement sanctions printed. `inline`
- **#306 binds the drill pane:** no drill level repeats the served headline; the
  stage card title is its only home; the tile's verdict rail keeps the direction
  counts. Carried into the change's proposal and spec delta. `inline`
- **Q2 = A (operator, "your recs").** The roster groups nights under three
  headers, ran above / ran below / ran as set, with excluded nights as a count
  line only. `→ ADR 291` (openspec/changes/basal-night-drill/design.md)
- **Q3 = A (operator, "your recs").** A selected night shows a detail block in
  the Finding selection block's shape: date and span, delivered vs programmed,
  in-slot mean vs roster mean, entry→exit glucose, n of N, Clear trace, Open in
  Day. `→ ADR 291`
- **Defaults adopted without objection:** the parent #305 risk contract copied
  unchanged into the change's design record; the chart keeps its verdict rail;
  arrow-key stepping and Open in Day follow the Finding roster exactly. `inline`
- **The active change is `openspec/changes/basal-night-drill/`** (proposal,
  tasks, design with ADR 291 and the safe-start declaration, surfaces delta),
  validated strictly. `inline`

### Plan review — round 1 (cold Opus, read-only, 2026-09-03)

Verdict BLOCKED, 4 blocking + 1 note. Reproduced against the checkout:
- O1 `authoring` confirmed: the lock's drift-check list omitted
  `gen_qa_e2e_db.py --check` (AGENTS.md lists eleven). Mechanical fix.
- O2 refuted: the workstation browser suite opens through the replay module's
  `openApp`, whose route handler serves `/api/diagnose/basal-night-evidence`
  from the generated fixture in fixture mode and accepts an `evidenceScenario`
  override. Not forwarded; the draft now names that mechanism explicitly.
- O3 `authoring` confirmed: the stub fixture has no `sign: -1` night (6 above,
  1 as-set). Draft corrected; ran-below stories go through `evidenceScenario`.
- O4 `authoring` confirmed: night 2026-01-07 has a 12-point trace and null mean
  and exit. Pinned tasks 1 and 4 and scenario 1 amended: null prints as `—`
  (the Finding block's convention). Re-pinned.
- N5 note accepted: chunk 1 context names the options-object extension of
  `renderSlotLevel` and `chartDescriptor(chartId)` as the lookup.
Injected blockers: 0.
- **Operator handed the remaining judgment to triage (2026-09-03):** "make it
  pretty, premium, tell the story, help the user diagnose on first open, no
  lies, no over-editorializing, works on a tablet and a computer."
  Translated into the pinned change: the roster and detail block use the shipped
  design system only with the Finding roster's row as the exact sibling; one
  replay story and the render matrix run at the 1024×768 tablet viewport with a
  no-overflow assertion; the served facts print as served, null as `—`, and no
  drill level repeats the headline. `→ ADR 291` (amended in place)

### Plan review — round 2 (cold Opus, read-only, 2026-09-03)

Verdict BLOCKED, 4 blocking + 3 notes. Reproduced against the checkout:
- O1 `authoring` confirmed: a lane click calls `pickCell(cell)` with no row id, so
  `chartDescriptor(chartId)` had no producer. Fix: look the basal tile up by
  `kind` and `coordinates.slot === cell.i` (spiked in Node against the
  descriptor shape `frontend/diagnose-canvas-state.test.js:97`).
- O2 `authoring` confirmed: the roster cap needs `shownCount`/`onMore`; added to
  the options object with slot-frame expand state, plus a Node case.
- O3 `authoring` confirmed: a basal tile exists only for a slot with a findings
  row, while the analysis publishes all 48 slots. Ruling (triage, under the
  operator's delegated judgment): tile copy when present, otherwise one request
  through the tile's own fetch, kept on the slot frame; "no second way" becomes
  "one fetch function". Task 1, scenario 2 and ADR 291 amended.
- O4 `authoring` confirmed: sub-order 2 may now touch
  `frontend/diagnose-workstation.test.js` for assertions its own corrections
  invalidate.
- N5 accepted: nights with a null served programmed rate get their own header,
  never ran-as-set (analyzer skips them, `basal.py:358`). Task 1 and
  requirement 1 amended.
- N6 declined: the drafting-conventions line is the lock template's literal, read
  by the ticket skill from its own install; a machine path never enters a
  tracker comment.
- N7 accepted: the pytest skip count is being measured by the coordinator before
  posting; the Expectation quotes the measured figure.
Injected blockers: 0.
