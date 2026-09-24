# Tasks — QA round 2 (#459–#470)

Numbered positionally across the whole file. A later ticket appends; nothing is
renumbered. Browser legs (the desk suite and the ledger replay) cannot launch
Chromium inside a sandboxed worker; the coordinator runs them escalated.

## #460 — The watch dock reads the served Plan draft

- [ ] 1. Before any design change, run UI Craft's revise pre-work on the shipped
  desk (sweep deferred to start from triage, sandbox): replay every frozen
  ledger story whose replay function reads `.stagebtn` or
  `.inspector > .watch` (S113, S139, S140, S145–S147, S166–S168 and S178 among
  them) against the unchanged base at 1280x720 and 1440x900 through
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
  today's title, direction and values; a watched Trial, a watched Focus and a
  recorded Plan each still outrank a served draft.
- [ ] 3. Give `watchDockView` the served draft as an input and the draft's own
  name, per ADR 460 points 2 and 3, and export that name so the stage control
  can reuse it (task 14). Update the module's header comment so it names the
  served draft as the staged state's fallback source.
- [ ] 4. Failing-first test in `frontend/diagnose.test.js`, seen to fail on the
  unchanged destination: on a cold seat whose `/api/plan` answer lands after the
  payload reads, once both settle the callbacks the destination hands the view
  carry the served draft, and the view is asked `isStaged` again after the Plan
  read lands.
- [ ] 5. Pass `planDraft` from `frontend/guidance.js` through Diagnose's
  callbacks in `frontend/diagnose.js`, beside `pendingPlan`, and into the dock's
  paint in `frontend/diagnose-workstation.js`.
- [ ] 6. In `frontend/diagnose-workstation.js`, move the boot-time seeding of the
  three sets of marks into one seeding function over `callbacks.isStaged`; run
  it at boot and on every `refresh()` except while a stage save is in flight
  (ADR 460 point 4). Update the ADR 354 comment above the seeding and the
  comment above the dock's paint.
- [ ] 7. Failing-first desk-suite test in `frontend/desk.browser.test.mjs`, seen
  to fail on the unchanged shell: serve a saved basal draft for the frozen
  browser analysis's stageable 07:00 slot from a stateful `/api/plan` stub and
  the guidance stub, and hold `/api/plan` until the Diagnose payload has
  settled. Then the 07:00 lane cell carries `data-staged="true"`, its stage
  control reads "Staged · Undo", and the dock reads "Plan · staged".
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
  pressing Diagnose: the dock reads "Plan · staged". Record the base run (legs 1
  and 3 expected to fail at their dock assertion) and the branch run at both
  sizes on the story's status line.
- [ ] 9. Raise the frozen inventory literals in
  `mockups/sweep/harmonic-v2-desktop/acceptance.py` and
  `mockups/sweep/harmonic-v2-desktop/acceptance.test.py` by the one story task 8
  adds.
- [ ] 10. Capture before/after renders of the dock on a fresh Diagnose seat with
  a saved basal draft (task 8's leg 3), on `basal-lower` at 1280x720 and
  1440x900 from the no-fetch serve. The coordinator attaches them to the pull
  request; they are not committed.

## #459 — Warn before a stage replaces the staged setting

Tasks 1–10 (#460) land first on this branch: this section reads the served draft,
the draft's own name and the seeding function they provide.

- [ ] 11. Failing-first node tests, each seen to fail on the unchanged code: in
  `frontend/plan-view.test.js`, with a stubbed transport, the exported
  replacement predicate reports that a basal item replaces a draft holding
  carb-ratio rows and that a basal item replaces nothing when the draft holds
  basal rows or no rows, and staging a carb-ratio block and then a basal slot
  through `stageEvidence` still saves only the basal rows; in
  `frontend/diagnose-workstation.test.js`, a stage panel handed a change to
  replace renders "Replace staged change" with the sub-line
  "replaces <that change's name>", an already-staged panel keeps
  "Staged · Undo", and a panel handed nothing keeps "Stage change" and
  "staged for Plan".
- [ ] 12. In `frontend/plan-view.js`, export the replacement predicate and make
  `stageEvidence`'s keep-only-this-setting filter use it (ADR 459 point 2). The
  save's `true`/`false` answer is unchanged.
- [ ] 13. In `frontend/diagnose-workstation.js`, give the basal slot, carb-ratio
  block and correction-factor panels the change their stage would replace, read
  through a callback, and render the replace state in the shared stage control
  (ADR 459 point 1). In `frontend/diagnose-workstation.css`, let the replace
  state wrap inside the panel without truncating, leaving the staged and
  unstaged box unchanged.
- [ ] 14. In `frontend/diagnose.js`, wire that callback from the served draft
  (`planDraft`), the replacement predicate and the draft's own name.
- [ ] 15. In `frontend/diagnose-workstation.js`, after an accepted stage save
  settles, re-seed the marks with task 6's seeding function and repaint, so a
  replaced setting's control no longer reads "Staged · Undo" (ADR 459 point 3).
  A refused save keeps #358's toggle replay.
- [ ] 16. Add the manufactured case `basal-and-carb-ratio-lower` to
  `scripts/qa_e2e_cases.py`, composing the `basal-lower` and `ic-lower` recipes
  with the carb-ratio source span stretched to end on the basal lane's last day
  (ADR 459 point 6), following AGENTS.md "Maintaining QA coverage eras" steps
  1–4: copy its complete `execute_case` row dump into literal `QaExpectation`
  values, run its generated `test_case_basal_and_carb_ratio_lower`, and
  re-measure the five budgets without raising a limit. Add the name to
  `tests/test_qa_e2e_cases.py`'s expected case names and to
  `tests/test_pattern_replay.py`'s case map.
- [ ] 17. Add one ledger story (the next unissued S id after task 8's) on
  `basal-and-carb-ratio-lower`, in a dated `## #459 amendment` section of
  `mockups/harmonic-v2-desktop.behavior.md` carrying Connor's 2026-09-24
  decision as its sanction, with its replay function, registry entry, case
  mapping and any story-table row in the files task 8 names. It stages the
  carb-ratio row's change; opens the basal row, whose stage control reads
  "Replace staged change" and names the staged carb-ratio change before the
  press; presses it; reads the served draft holding only basal rows and the
  dock naming the basal change; then opens the carb-ratio row in the same visit,
  whose control carries `data-staged="false"` and reads "Replace staged change"
  naming the basal change, never "Staged · Undo". Record the base run (expected
  to fail at the pre-press control) and the branch run at both sizes on its
  status line, and raise the inventory literals in the two acceptance files by
  this one story.
- [ ] 18. Capture before/after renders of the basal slot's stage control in the
  replace state and of the dock after the replacement, on
  `basal-and-carb-ratio-lower` at 1280x720 and 1440x900 from the no-fetch
  serve. The coordinator attaches them to the pull request; they are not
  committed.
