# Left-column pattern — triage and review ledger

Ticket: #306 (child of #305 by prose; GitHub holds no parent link and #305
carries no `epic` label, so this runs as an ordinary ticket with its own
OpenSpec change). Blocked-by #304 is merged (#314, archive #316).

## Grounding (verified live in this triage, 2026-09-02)

- Base: `origin/main` at 112ea3a6 (archive of qa-e2e coverage eras, #323).
  Worktree `/Users/connor/worktrees/harmonic/306`, branch `306-left-column-pattern`.
- The composition doc #305 cites, `docs/scope/diagnose-workstation-composition.md`,
  has never been committed on any branch (`git log --all` empty); it sits
  untracked in the operator's control checkout. #305's body is the only
  durable record of the direction.
- Shipped canvas (ADR 215 + amendment): one focal chart ("spotlight",
  `#tile-focal`) over a dock strip of minis (`#tile-row`) with two resting
  states, `docked` and `hidden`, plus the explorer and fullscreen.
  `dockWant` boots `'docked'` (`frontend/diagnose-workstation.js:1089`); a
  resize crossing `DOCK_FLOOR` (376px) flips it both ways (`:3851`).
- Active-chart rule, shipped half: a drill seats the drilled chart on the
  stage (`seatDrill`, `:2077-2080`); the default focal is `recommendedFocalId`
  (rank-1 event chart) else rank-1 candidate (`:1444-1448`). Gap: `popTo`
  re-runs `seatDrill(null)` on return to root, which clears the drill mark but
  never re-seats rank-1, so the stage keeps the last drilled chart.
- Chart click is one level (ADR 294, `chartClickRoute`): a ranked or Watching
  chart click drills its findings row, and the drill seats it. Only the
  explorer pick (`:2923`) and pinned-then-vanished charts move the stage
  without a drill.
- Dock echo: the strip holds the whole ordered set, the stage's chart
  included, marked `data-selected` (ledger: RETIRED S113 under ADR 215,
  sanction "The dock is the whole ordered set, spotlight included"). 23
  replay locators are scoped to `#tile-row .evidence-tile`; S114 already
  brings the dock up when it finds `data-dock="hidden"`.
- Basal headline: composed in the frontend from served counts
  (`frontend/diagnose-evidence-charts.js:469-475`) and drawn INSIDE the chart
  as a 21px ECharts graphic at the deck (`:536-538`); the DOM nameplate
  (`.tile-head h3`) is "Basal HH:MM" from `nameFor` (`:873`), styled 10px
  uppercase micro-caps (`diagnose-workstation.css:1070`). Only basal has an
  authored sentence; ISF, carb ratio and event comparison carry nameplates.
- Drill pane: the basal slot panel head is time range + verdict + "N nights
  of steady data" (`renderSlotLevel`); no level repeats the headline today.
- Design rule: DESIGN.md no-hero rule caps any heading at 1.5rem.
- UI Craft router: `{"mode":"revise","reason":"safe synthetic data source declared"}`.
  Safe start (AGENTS.md "The data boundary", since #321): copy
  `mockups/qa-e2e.synthetic/harmonic.sqlite` to scratch, then
  `uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765`;
  database generated entirely by `scripts/gen_qa_e2e_db.py` from the case
  catalog `scripts/qa_e2e_cases.py`, which triggers every backend finding, so
  every chart family is reachable in one served app. `.claude/launch.json`
  `harmonic-nofetch` runs the same command.
- No existing ticket covers the drawer-as-picker interaction (issue search
  2026-09-02: picker/drawer/dock/filmstrip).
- Contract: `mockups/finding-evidence-routing.behavior.md` (active S01–S116,
  S118–S126) + `frontend/diagnose-workstation-behavior.replay.mjs` (125 story
  exports). Browser suites pinning dock/stage: `diagnose-workstation.browser.test.mjs`
  (#215 fullscreen-from-dock, contrast, material states),
  `diagnose-canvas-composition.browser.test.mjs`. Fast tests:
  `diagnose-canvas-layout.test.js`, `diagnose-canvas-state.test.js`,
  `diagnose-evidence-charts.test.js`, `diagnose-findings-queue.test.js`.
- Drift gates that read touched files: `mockups/finding-evidence-routing.exploration/build.mjs --check`
  extracts `WINDOWS` from `diagnose-workstation.js` and imports
  `diagnose-findings-queue.js`; `mockups/diagnose-evidence-canvas.exploration/generate.py --check`
  reads `index.html` `:root` and `theme.css`.
- Spec home: `openspec/specs/surfaces/spec.md` (Dark material hierarchy names
  the spotlight and dock; basal tile requirement names the finding statement).
- Siblings: #302 (tapered queue; hero row chartless by the active-chart rule)
  and #291 (night-selection wiring) build on this ticket. #302's hero row
  will need the same headline sentence.
- Reviewer memory: store present; nearest anchors are shipped-Diagnose
  revisions split at the live browser run, recorded under-sliced when the
  browser matrix stayed attached to implementation.
- No standing-decisions source configured. No `Harden:` line → Profile none.

## Decisions

- Classification `code`; surface lifecycle `revise`; route verified above. inline
- Risk contract: inherited verbatim from #305 (below). inline

### Risk contract

- **Must prevent:** a frontend-derived staging verdict (floors, directions,
  thresholds stay backend-owned per AGENTS.md safety invariants); real data in
  fixtures, screenshots committed to the repo, or CI logs; silent incorrect
  success (a green replay that asserted nothing).
- **Must recover:** nothing automatically.
- **Accepted failure:** a composition change ships broken (chart fails to
  render, drill dead-ends) — fails visibly, operator repairs through normal
  ticket flow.
- **Unsupported:** light theme (retired, #304); per-night exclusion reasons
  (deferred); multi-user or non-operator audiences.
- **Evidence owed:** behavior-ledger replay amendments through the ui-craft
  revise lifecycle for every rail/chart behavior this composition changes;
  the existing `asserts_move`/`safety_status` read-only contract stays pinned
  by existing tests.
- **Why:** one operator, advisory surface, all dose-safety logic already
  contract-pinned backend-side.
- **Disposition:** copied from #305 unchanged; lands unchanged in this change's proposal.

- Q1 → A: backing out of a drill to the queue returns the rank-1 chart to
  the stage. Why: #305's rule, "rank-1 while the queue shows"; today the stage
  keeps the last drilled chart. → ADR
- Q2 → A: an explorer pick opens that finding's drill, so the stage always
  shows the active finding; no reader override of the rule survives. Why:
  every other chart click already drills (ADR 294). inline
- Q3 → A: the stage chart keeps its drawer cell as the marked current frame
  (ADR 215 sanction stands). Operator adds the picker goal: the drawer is
  closed on load, can be brought up and scrolled or opened full screen, and
  goes away when a chart is picked from it. inline (picker scope: round 2)
- Q4 → C: every chart family gets an authored headline in this ticket (basal,
  correction factor, carb ratio, event comparison), using the QA showcase to
  put every chart on screen. Why: operator, "everybody gets a headline, and
  it's part of this ticket, not sub-tickets for each". → ADR
- Q5 → B (operator lean, "whatever is the best architecture"): the backend
  owns the headline sentence; the frontend renders it verbatim and composes
  none. Why: the findings projection contract already says the frontend
  "renders them verbatim and composes nothing" (CONTEXT.md, ADR 730), and a
  count sentence is a projection fact with one home. Shape: round 2. → ADR
- Q6 → A: the drawer opens minimized and never comes back up on its own; the
  grow-back re-dock path is retired. Why: operator, "That path is archived.
  It's gone." → ADR (ledger amendment of the ADR 215 dock-floor rule)
- Q7 → B: an attended UI Craft revise round settles the stage nameplate's
  editorial treatment in the running app. Why: the title gains editorial
  weight and the bar it lives in must change with it; the spotlight has the
  room now. → ADR
- Assumed defaults (not asked): the chart deck loses its drawn headline once
  the card title carries it (#305 "headline home: chart-card title only");
  drawer cells keep the short nameplate; no drill level repeats the headline
  (none does today, and the rule is pinned as a story).
- Risk-contract addition (inline): a served headline never states a count,
  direction or verdict the analyzer did not publish; evidence owed is the
  per-family literal headline in the QA catalog's `QaExpectation` dumps.

- Q8 → A: the drawer is a picker, in this ticket. Picking a chart from it
  (click or Enter on a cell, a Watching cell, or an explorer pick) stages and
  drills that chart, then the drawer goes away; "bring up" and "show every
  chart" remain. Why: the minimized default and the pick rule are one
  behavior. → ADR (ledger amendment: S114/S115 keep their promotion clauses
  and gain the put-away; the raised-dock dismissal generalizes to every pick)
- Q10 → A: every chart that can hold the stage carries a headline, Watching
  reads included. Shape rule (operator): honest, factual, plain, a story told
  from the engine's facts, never editorializing, never sounding like AI; a
  thin read gets a plain sentence ("this slot doesn't have enough evidence to
  recommend a change either way"), a strong one carries its counts and
  consequence ("missed meals led to highs on 3 separate nights, above 200 for
  over 6 hours in total"). → ADR
- Q11 → operator-directed authoring: before any sentence is templated, the
  executing session hands the operator a facts sheet — one row per finding
  the QA showcase produces (family, register, verdict, rank/priority, the
  served counts, support, window, consequence facts, everything the engine
  publishes for that row) — as a spreadsheet; the operator writes example
  headlines per row; the templates are built from those examples and
  iterated in the attended round with each chart on screen. The sheet is
  generated from the showcase through the production API and lives in the
  change's evidence directory (synthetic, generator-owned). → ADR

- Q9 → A: the headline is a served field on every findings-projection row,
  arriving with the list; the stage card title and #302's hero row read that
  one field, and no chart payload carries a second copy. Why: one home for
  one sentence, present before any chart loads. → ADR

Interview closed 2026-09-02: frontier empty. Dispositions → ADR are
discharged in `openspec/changes/left-column-pattern/design.md`; none → issue.

## Open questions

- (none)

## Spawned tasks

- (none yet)

## Review rounds

- Round 1 (cold, Opus, read-only, 2026-09-02): BLOCKED. Blockers, all
  `authoring`: (1) the explorer pick already drills through
  `showChartInspector`, so the order's fail-first claim was false; (2) three
  browser legs read the dock strip (cockpit-shell suite, event-comparison
  replay, support audit) and sat in no allowlist; (3) the served-headline
  requirement carried stage clauses no single chunk could satisfy; (4) the
  headline's fact source across the authoring→serving boundary was undefined.
  Notes: the public scan never reads `openspec/changes/**`; history rows have
  no stage card (consumer named as #302); the evidence-canvas exploration
  reads the regenerated payload; `frontend/index.test.js:32` pins the dock
  CSS order; the shrink-hides clause was a MAY. All nine reproduced; all
  fixed in the pinned source (6b4c069b) and the order. Injected: 0.
- Round 1 re-check (same reviewer): BLOCKED. `injected` (from the round-1
  fact-source fix): the Finding case file cannot be read from inside the
  projection (`finding_case_file.py` imports it and prepares one in a store
  transaction), so the readable set is the three analyzer-payload evidence
  modules and a case-file consequence fact is not a slot; sub-order 1's
  anchor number was stale after the requirement split. `authoring`: no chunk
  re-measured the QA budgets the row change triggers; the cached-projection
  citation pointed at the sidecar recovery line. All five reproduced; fixed
  in the pinned source and the order. Injected: 2 of 5.
- Round 1 second re-check (same reviewer): BLOCKED. `injected` (from the
  readable-set fix): `prepare_ic_block_evidence` takes a store, so the I:C
  slot facts come from the published block counts on the analysis payload.
  `authoring`: the pytest budget cited an appendix without the ceiling; the
  reviewer's claim that the 2026-09-01 appendix carries no whole-pytest line
  was refuted (it does, at 66.55 s), the citation fix applied anyway since
  the latest figure and the 157.33 s ceiling live in the coverage-eras
  appendix. Fixed in the pinned source and the order. Injected: 1 of 2.
