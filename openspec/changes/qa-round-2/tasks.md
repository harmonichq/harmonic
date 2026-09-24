# Tasks — QA round 2 (#459–#470)

Numbered positionally across the whole file. A later ticket appends; nothing is
renumbered. Browser legs (the desk suite and the ledger replay) cannot launch
Chromium inside a sandboxed worker; the coordinator runs them escalated.

The stories that read the stage control or the watch dock are S97, S98, S99,
S113, S139, S140, S147, S152, S153, S169 and S178: each one's replay reads
`.stagebtn` or `.inspector > .watch`, directly or through a shared helper.
This list is the "touched stories" below.

## #460 — The watch dock reads the served Plan draft

- [ ] 1. Before any design change, run UI Craft's revise pre-work on the shipped
  desk (sweep deferred to start from triage, sandbox): replay the touched
  stories against the unchanged base at 1280x720 and 1440x900 through
  `frontend/desk-behavior.replay.mjs`, re-inventory the dock's five states and
  the stage control's two labels in the served app, and record any observed
  behavior with no story before designing.
- [ ] 2. Failing-first node tests in `frontend/watched-change-dock.test.js`, run
  against the unchanged dock first and seen to fail there: a served draft with
  items and no watch, no recorded Plan and no marks on this surface reads
  "Plan · staged", named from the draft's own items (ADR 460 point 3); the same
  draft whose slot the current analysis no longer admits still reads
  "Plan · staged" and names its setting; the draft's values print only where
  every item carries the same current and proposed pair; no direction prints
  from the draft alone; the surface's own marks, when they name a change, keep
  today's title, direction and values; with a stage save in flight and no
  marks, the served draft is not read and the dock reads idle; a watched Trial,
  a watched Focus and a recorded Plan each still outrank a served draft.
- [ ] 3. Give `watchDockView` two inputs, the served draft (`draft`) and whether
  a stage save is in flight (`saving`), per ADR 460 point 2. Export
  `draftName(draft) → string` from `frontend/watched-change-dock.js`, the
  draft's own name per ADR 460 point 3; the dock and #459's stage control both
  read it. Update the module's header comment so it names the served draft as
  the staged state's fallback source.
- [ ] 4. Failing-first test in `frontend/diagnose.test.js`, seen to fail on the
  unchanged destination: on a cold seat whose `/api/plan` answer lands after the
  payload reads, once both settle, the callbacks the destination hands the view
  carry a `planDraft` that answers the served draft.
- [ ] 5. Pass `planDraft` from `frontend/guidance.js` through Diagnose's
  callbacks in `frontend/diagnose.js`, beside `pendingPlan`, and into the dock's
  paint in `frontend/diagnose-workstation.js`, with the workstation's own
  in-flight flag as `saving`.
- [ ] 6. In `frontend/diagnose-workstation.js`, move the boot-time seeding of the
  three sets of marks into one seeding function over `callbacks.isStaged`. Run
  it at boot, on every `refresh()` except while a stage save is in flight, and
  after every accepted stage save settles, followed by a repaint (ADR 460
  point 4). A refused save keeps #358's toggle replay. Update the ADR 354
  comment above the seeding, the #358 comment above `stageAndSettle` and the
  comment above the dock's paint.
- [ ] 7. Desk-suite tests in `frontend/desk.browser.test.mjs`, over a stateful
  `/api/plan` stub (GET answers the saved draft, PUT saves it) and a guidance
  stub that serves the same draft:
  - failing-first, seen to fail on the unchanged shell: serve a saved basal
    draft for the frozen browser analysis's stageable 07:00 slot and hold
    `/api/plan` until the Diagnose payload has settled; then the 07:00 lane cell
    carries `data-staged="true"`, its stage control reads "Staged · Undo", and
    the dock reads "Plan · staged";
  - regression guard, passing on the unchanged shell and after the change:
    stage the 07:00 slot, press Undo, and once the save settles the dock reads
    "Nothing being watched" and the control reads "Stage change";
  - the in-flight rule: hold a `PUT /api/plan`, press Stage change on 07:00,
    go to Changes and press Diagnose in the top nav (a retained return
    refreshes the workstation); while the PUT is still held, the 07:00 cell
    keeps `data-staged="true"` and its control keeps "Staged · Undo"; then
    release the PUT.
- [ ] 8. Add one ledger story (the next unissued S id at implementation time) on
  the `basal-lower` case, in a dated `## #460 amendment` section of
  `mockups/harmonic-v2-desktop.behavior.md`, with its replay function in
  `frontend/c4.replay.mjs`, its registry entry in
  `frontend/desk-behavior.replay.mjs`, its case in `frontend/replay-cases.mjs`,
  and any story-table row `frontend/c4.replay.test.js` keeps. Three legs:
  (1) open Diagnose, go to Changes, stage the leading concern's action and save
  the draft, open the change records, press Diagnose in the top nav: the dock
  reads "Plan · staged" and "Open Changes ›" lands on the Plan; (2) stage from
  Diagnose, go to Changes, open the change records, press Diagnose: the dock
  reads "Plan · staged"; (3) as leg 2, but reload on the change records before
  pressing Diagnose: the dock reads "Plan · staged". Lay the story's harness
  over e4862000 and record that base run (legs 1 and 3 expected to fail at
  their dock assertion) and the branch run at both sizes on the story's status
  line.
- [ ] 9. Raise the frozen story inventory by the one story task 8 adds,
  everywhere it is stated: the literals in
  `mockups/sweep/harmonic-v2-desktop/acceptance.py` and
  `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`, the issued and active
  counts in `mockups/sweep/harmonic-v2-desktop/ACCEPTANCE.md`, and the story
  count in `AGENTS.md`'s ledger-replay paragraph.
- [ ] 10. Capture before/after renders of the dock on a fresh Diagnose seat with
  a saved basal draft (task 8's leg 3), on `basal-lower` at 1280x720 and
  1440x900 from the no-fetch serve. The coordinator attaches them to the pull
  request; they are not committed.

## #459 — Warn before a stage replaces the staged setting

Tasks 1–10 (#460) land first on this branch. This section reads the served
draft, `draftName` and the re-seed after a settled save that they provide. A
Diagnose item's `family` (`basal`, `ic`, `isf`) is already the Plan item `type`
it stages as.

- [ ] 11. Add the manufactured case `basal-and-carb-ratio-lower` to
  `scripts/qa_e2e_cases.py`, composing the `basal-lower` and `ic-lower` recipes
  with the carb-ratio source span stretched to end on the basal lane's last day
  (ADR 459 point 6), following AGENTS.md "Maintaining QA coverage eras" steps
  1–4: copy its complete `execute_case` row dump into literal `QaExpectation`
  values, run its generated `test_case_basal_and_carb_ratio_lower`, and
  re-measure the five budgets against the limits of record in
  `openspec/changes/harmonic-v2/coverage-appendix.md` (showcase ≤25 MiB,
  showcase drift ≤30 s, focused QA suite ≤90 s, slowest generated case ≤15 s,
  whole pytest ≤400 s on the operator's 160 s re-baseline of 2026-09-09),
  without raising any. Record the measurements as a dated `#459` section
  appended to that appendix. Add the name to `tests/test_qa_e2e_cases.py`'s
  expected case names and to `tests/test_pattern_replay.py`'s case map. Commit
  this task on its own: that commit is the base for task 16's failing-first
  run.
- [ ] 12. Failing-first node tests, each seen to fail on the code before tasks
  13–15: in `frontend/plan-view.test.js`, `replacesDraft('basal', <carb-ratio
  rows>)` is true, and `replacesDraft('basal', <basal rows>)` and
  `replacesDraft('basal', [])` are false; staging a carb-ratio block and then a
  basal slot through `stageEvidence` with a stubbed transport still saves only
  the basal rows. In `frontend/diagnose-workstation.test.js`, a stage panel
  whose `replaces` option is a change's name renders "Replace staged change"
  with the sub-line "replaces <that name>"; an already-staged panel keeps
  "Staged · Undo" whatever `replaces` holds; a panel with `replaces` null keeps
  "Stage change" and "staged for Plan".
- [ ] 13. In `frontend/plan-view.js`, export
  `replacesDraft(type, draftItems) → boolean`: true when `draftItems` holds a
  row whose `type` differs from `type`. Make `stageEvidence`'s
  keep-only-this-setting filter use it (ADR 459 point 2). The save's
  `true`/`false` answer is unchanged.
- [ ] 14. In `frontend/diagnose-workstation.js`, ask
  `callbacks.replacing(item) → string | null` for each stage panel's item and
  hand the answer to the shared stage control as the panel option `replaces`,
  for the basal slot, carb-ratio block and correction-factor panels. Render the
  replace state there (ADR 459 point 1). In
  `frontend/diagnose-workstation.css`, let the replace state wrap inside the
  panel without truncating, leaving the staged and unstaged box unchanged.
- [ ] 15. In `frontend/diagnose.js`, wire `replacing(item)` to answer
  `draftName(planDraft())` when `replacesDraft(item.family,
  planDraft()?.items || [])`, and `null` otherwise.
- [ ] 16. Add one ledger story (the next unissued S id after task 8's) on
  `basal-and-carb-ratio-lower`, in a dated `## #459 amendment` section of
  `mockups/harmonic-v2-desktop.behavior.md` carrying Connor's 2026-09-24
  decision as its sanction, with its replay function, registry entry, case
  mapping and any story-table row in the files task 8 names. It stages the
  carb-ratio row's change; opens the basal row, whose stage control reads
  "Replace staged change" and names the staged carb-ratio change before the
  press; presses it; reads the served draft holding only basal rows and the
  dock naming the basal change; then opens the carb-ratio row in the same visit,
  whose control carries `data-staged="false"` and reads "Replace staged change"
  naming the basal change, never "Staged · Undo". Lay its harness over task
  11's commit (all of #460 plus the new case, none of tasks 12–15) and record
  that base run, which must fail at the pre-press "Replace staged change"
  assertion, and the branch run at both sizes on its status line. Raise the
  story inventory by this one story in the four places task 9 names.
- [ ] 17. Capture before/after renders of the basal slot's stage control in the
  replace state and of the dock after the replacement, on
  `basal-and-carb-ratio-lower` at 1280x720 and 1440x900 from the no-fetch
  serve, the before from task 11's commit. The coordinator attaches them to the
  pull request; they are not committed.
