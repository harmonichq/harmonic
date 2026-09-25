# Tasks — QA round 2 (#459–#470)

Numbered positionally across the whole file. A later ticket appends; nothing is
renumbered. Browser legs (the desk suite and the ledger replay) cannot launch
Chromium inside a sandboxed worker; the coordinator runs them escalated.

The stories that read the stage control or the watch dock are S97, S98, S99,
S113, S139, S140, S147, S152, S153, S169 and S178: each one's replay reads
`.stagebtn` or `.inspector > .watch`, directly or through a shared helper.
This list is the "touched stories" below.

## #460 — The watch dock reads the served Plan draft

- [x] 1. Before any design change, run UI Craft's revise pre-work on the shipped
  desk (sweep deferred to start from triage, sandbox): replay the touched
  stories against the unchanged base at 1280x720 and 1440x900 through
  `frontend/desk-behavior.replay.mjs`, re-inventory the dock's five states and
  the stage control's two labels in the served app, and record any observed
  behavior with no story before designing.
- [x] 2. Node tests in `frontend/watched-change-dock.test.js`. Failing-first, each
  seen to fail on the unchanged dock:
  - a served draft with items, with no watch, no recorded Plan, no marks and
    `saving` false, reads "Plan · staged", named by `draftName` (ADR 460
    point 3);
  - the same draft whose slot the current analysis no longer admits still
    reads "Plan · staged" and names its setting;
  - the draft's values print only where every item carries the same current
    and proposed pair, and no direction prints from the draft.
  Guards in the same file, passing before and after: with `saving` true and no
  marks, the served draft is not read and the dock reads idle; the surface's
  own marks, when they name a change, keep today's title, direction and values;
  a watched Trial, a watched Focus and a recorded Plan each outrank a served
  draft.
- [x] 3. In `frontend/watched-change-dock.js`, give `watchDockView` the inputs
  `draft` and `saving` and export `draftName(draft) → string` (ADR 460 points 2
  and 3). #459's stage control reuses `draftName`. Update the module's header
  comment so it names the served draft as the staged state's fallback source.
- [x] 4. Failing-first tests in `frontend/diagnose.test.js`, each seen to fail on
  the unchanged destination: on a cold seat whose `/api/plan` answer lands after
  the payload reads, once both settle, the callbacks the destination hands the
  view carry a `planDraft` that answers the served draft; and on a retained
  return (a plain top-nav press with the input revision unchanged), the
  destination re-reads Plan state and guidance and then calls the view's
  `refresh()` (ADR 460 point 7).
- [x] 5. In `frontend/diagnose.js`, pass `planDraft` from `frontend/guidance.js`
  through Diagnose's callbacks beside `pendingPlan`, and on a retained return
  re-read Plan state and guidance, the same pair a cold read starts, then
  refresh the workstation while it is still seated and on screen, when that
  read moved the Plan surface's draft, the served draft or the pending Plan
  (ADR 460 point 7). Keep the promise the `stage` callback returns, and skip that
  re-read while it is pending. In
  `frontend/diagnose-workstation.js`, hand the dock's paint `planDraft()` as
  `draft` and the workstation's in-flight flag as `saving`.
- [x] 6. In `frontend/diagnose-workstation.js`:
  - raise the in-flight flag in `stageAndSettle` before the press's toggle and
    paint, keeping the re-entrancy guard (ADR 460 point 4);
  - move the boot-time seeding of the three sets of marks into one seeding
    function that first clears all three sets and then asks
    `callbacks.isStaged` for every cell, so a mark the draft no longer holds
    drops; run it at boot, on every
    `refresh()` while no save is in flight, and after an accepted save settles
    and the flag has cleared, then repaint (ADR 460 point 5). A refused save
    keeps #358's toggle replay. `callbacks.isStaged` stays `evidenceIsStaged`
    (ADR 460 point 6);
  - update the ADR 354 comment above the seeding, the #358 comment above
    `stageAndSettle` and the comment above the dock's paint.
- [x] 7. Desk-suite tests in `frontend/desk.browser.test.mjs`, over a stateful
  `/api/plan` stub (GET answers the saved draft, PUT saves it) and a guidance
  stub that serves the same draft, on the frozen browser analysis's stageable
  07:00 slot:
  - failing-first, seen to fail on the unchanged shell: with a saved 07:00
    basal draft and `/api/plan` held until the Diagnose payload has settled,
    the 07:00 lane cell carries `data-staged="true"`, its control reads
    "Staged · Undo", and the dock reads "Plan · staged";
  - the in-flight Undo: with the 07:00 change staged and saved, hold the next
    `PUT /api/plan`, press Undo, and while the PUT is held the dock does not
    read "Plan · staged"; release the PUT. It passes on the unchanged shell,
    whose dock has no draft input, so its failing-first proof is a deliberately
    broken variant: seen to fail on a build of tasks 2–6 that raises the flag
    after the paint, then pass on the real build;
  - guard, passing before and after: stage 07:00, press Undo, and once the save
    settles the dock reads "Nothing being watched" and the control reads
    "Stage change";
  - guard, passing before and after: hold a `PUT /api/plan`, press Stage change
    on 07:00, go to Changes and press Diagnose in the top nav (a retained return
    refreshes the workstation); while the PUT is held the 07:00 cell keeps
    `data-staged="true"` and its control keeps "Staged · Undo"; release the PUT;
  - the retained return during a save: hold the `PUT /api/plan`, press Stage
    change on 07:00, go to Changes and press Diagnose in the top nav, and hold
    any `GET /api/plan` that return issues. Release the PUT, then release the
    held GET answering the pre-press draft. Once settled, the 07:00 cell keeps
    `data-staged="true"`. It passes on the unchanged shell, which issues no
    such read, so its failing-first proof is a deliberately broken variant:
    seen to fail on a build of tasks 2–6 whose retained return re-reads
    without the pending-save check, then pass on the real build.
- [x] 8. Add one ledger story (the next unissued S id at implementation time) on
  the `basal-lower` case, in a dated `## #460 amendment` section of
  `mockups/harmonic-v2-desktop.behavior.md`, with its replay function in
  `frontend/c4.replay.mjs`, its registry entry in
  `frontend/desk-behavior.replay.mjs`, its case in `frontend/replay-cases.mjs`,
  and any story-table row `frontend/c4.replay.test.js` keeps. Four legs:
  - leg 1: open Diagnose, go to Changes, stage the leading concern's action and
    save the draft, open the change records, press Diagnose in the top nav.
    The dock reads "Plan · staged" and "Open Changes ›" lands on the Plan.
    Failing-first on the base: Diagnose's retained return only repaints marks
    it seeded before the draft existed;
  - leg 2: stage from Diagnose, go to Changes, open the change records, press
    Diagnose. The dock reads "Plan · staged". A guard that passes on the base;
  - leg 3: as leg 2, but reload on the change records, then route-intercept
    `/api/plan` and hold it until the Diagnose payload reads have settled
    before releasing it, then press Diagnose. The dock reads "Plan · staged".
    Failing-first on the base: the hold makes the cold seat's boot seed miss
    the draft deterministically;
  - leg 4, where a mark must drop: stage the basal run from Diagnose, go to
    Changes, replace the saved draft through the Plan route (`PUT /api/plan`,
    as S146 writes its draft) with one basal row at a slot the analysis does
    not let stage, then press Diagnose in the top nav. The staged run's lane
    cells carry `data-staged="false"`, their control reads "Stage change", and
    the dock reads "Plan · staged" named for the new row. Failing-first on the
    base: the retained return keeps the old marks and the dock names the old
    run.
  Lay the story's harness over e4862000 and record that base run (legs 1, 3
  and 4 failing at their mark or dock assertion, leg 2 passing) and the branch
  run at both sizes on the story's status line.
- [x] 9. Raise the frozen story inventory by the one story task 8 adds,
  everywhere it is stated: the literals in
  `mockups/sweep/harmonic-v2-desktop/acceptance.py` and
  `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`, the issued and active
  counts in `mockups/sweep/harmonic-v2-desktop/ACCEPTANCE.md`, and the story
  count in `AGENTS.md`'s ledger-replay paragraph.
- [x] 10. Capture before/after renders of the dock on a fresh Diagnose seat with
  a saved basal draft (task 8's leg 3), on `basal-lower` at 1280x720 and
  1440x900 from the no-fetch serve. The coordinator attaches them to the pull
  request; they are not committed.

## #459 — Warn before a stage replaces the staged setting

Tasks 1–10 (#460) land first on this branch. This section reads `draftName`
and the clearing re-seed after a settled save that they provide. The warning
reads the draft the marks read: the Plan surface's own draft, `draftItems()`,
which holds a pick made in Changes and not yet saved ahead of the saved draft
(ADR 459 point 1). A Diagnose item's `family` (`basal`, `ic`, `isf`) is already
the Plan item `type` it stages as.

- [x] 11. Add the manufactured case `basal-and-carb-ratio-lower` to
  `scripts/qa_e2e_cases.py`, composing the `basal-lower` and `ic-lower` recipes
  with the carb-ratio source span stretched to end on the basal lane's last day
  (ADR 459 point 6), following AGENTS.md "Maintaining QA coverage eras" steps
  1–4: copy its complete `execute_case` row dump into literal `QaExpectation`
  values, run its generated `test_case_basal_and_carb_ratio_lower`, and
  re-measure the five budgets against the limits of record in
  `openspec/changes/harmonic-v2/coverage-appendix.md` (showcase ≤25 MiB,
  showcase drift ≤30 s, focused QA suite ≤90 s, slowest generated case ≤15 s,
  whole pytest ≤400 s on the operator's 160 s re-baseline of 2026-09-09),
  without raising any. Record the measurements as a dated `#459` section in
  this change's own `openspec/changes/qa-round-2/coverage-appendix.md`, against
  those limits of record (ADR 459, coordinator ruling on the budget-record
  location). Add the name to `tests/test_qa_e2e_cases.py`'s
  expected case names and to `tests/test_pattern_replay.py`'s case map. Commit
  this task on its own: that commit is the base for task 16's failing-first
  run.
- [x] 12. Node tests:
  - failing-first, each seen to fail at its assertion on task 11's commit
    (write each against a local stub of the new export first, then point it at
    the export):
    - in `frontend/plan-view.test.js`, `replacesDraft('basal', <carb-ratio
      rows>)` is true, and `replacesDraft('basal', <basal rows>)` and
      `replacesDraft('basal', [])` are false;
    - in `frontend/plan-view.test.js`, over a stubbed transport: after an
      unsaved carb-ratio pick in Changes (`stage(candidate)`),
      `replacedDraftItems('basal')` answers that pick's rows, so staging basal
      warns; and with a saved carb-ratio draft plus an unsaved basal pick,
      `replacedDraftItems('isf')` answers the basal pick's rows, the draft the
      marks and the dock show;
    - in `frontend/diagnose-workstation.test.js`, a stage panel whose
      `replaces` option is a change's name renders "Replace staged change"
      with the sub-line "replaces <that name>";
  - guards, passing on task 11's commit and after:
    - in `frontend/plan-view.test.js`, over a stubbed transport: staging a
      carb-ratio block and then a basal slot through `stageEvidence` saves only
      the basal rows; staging basal 02:00 and then basal 03:00 makes the second
      save hold both rows (`basal@120,basal@180`, as
      `docs/scope/459-repro.mjs` prints);
    - in `frontend/diagnose-workstation.test.js`: an already-staged panel keeps
      "Staged · Undo" whatever `replaces` holds; a panel with `replaces` null
      keeps "Stage change" and "staged for Plan".
- [x] 13. In `frontend/plan-view.js`, export
  `replacesDraft(type, draftItems) → boolean`: true when `draftItems` holds a
  row whose `type` differs from `type`. Export
  `replacedDraftItems(type) → items | null`: `draftItems()` when
  `replacesDraft(type, draftItems())`, else `null`. Make `stageEvidence`'s
  keep-only-this-setting filter use `replacesDraft` (ADR 459 point 2). The
  save's `true`/`false` answer is unchanged.
- [x] 14. In `frontend/diagnose-workstation.js`, ask
  `callbacks.replacing(item) → string | null` for each stage panel's item and
  hand the answer to the shared stage control as the panel option `replaces`,
  for the basal slot, carb-ratio block and correction-factor panels. Render the
  replace state there (ADR 459 point 1). In
  `frontend/diagnose-workstation.css`, let the replace state wrap inside the
  panel without truncating, leaving the staged and unstaged box unchanged.
- [x] 15. In `frontend/diagnose.js`, wire `replacing(item)` to answer
  `draftName({ items })` when `replacedDraftItems(item.family)` answers
  `items`, and `null` otherwise.
- [x] 16. Add one ledger story (the next unissued S id after task 8's) on
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
- [x] 17. Capture before/after renders of the basal slot's stage control in the
  replace state and of the dock after the replacement, on
  `basal-and-carb-ratio-lower` at 1280x720 and 1440x900 from the no-fetch
  serve, the before from task 11's commit. The coordinator attaches them to the
  pull request; they are not committed.

## #462 — An ended record answers a requested reassessment

Tasks 1–17 (#460, #459) land first on this branch. #462's touched stories are
S49, S54, S54b, S91, S92, S94, S95, S96, S105, S110, S111, S112, S142, S143,
S157, S180 and R18: every story that opens a change record or reads a
reassessment. The reproduction is `docs/scope/462-record-comparison.repro.py`
and `docs/scope/462-stage.repro.mjs`.

- [ ] 18. Before any design change, run UI Craft's revise pre-work on the shipped
  desk (sweep deferred to start from triage, sandbox): replay #462's touched
  stories against the unchanged base at 1280x720 and 1440x900 through
  `frontend/desk-behavior.replay.mjs`, re-inventory an ended record's stage
  (instrument words, figure state, periods note, outcome rows) and its
  reassessment lines in Original, Retained context and Current policy in the
  served app, and record any observed behavior with no story before designing.
- [ ] 19. Add the manufactured case `c4-isf-late-read` to
  `scripts/qa_e2e_cases.py`: c4-isf's recipe with one unchanged pump read at
  2024-06-30 12:00 written before its one reconcile, as item 1 of
  `docs/scope/462-record-comparison.repro.py` builds it (ADR 462). Follow
  AGENTS.md "Maintaining QA coverage eras" steps 1–4: copy its complete
  `execute_case` row dump into literal `QaExpectation` values, run its generated
  `test_case_c4_isf_late_read`, and re-measure the five budgets against the
  limits of record in
  `openspec/changes/archive/2026-09-24-harmonic-v2/coverage-appendix.md` without
  raising any, recording them as a dated `#462` section of
  `openspec/changes/qa-round-2/coverage-appendix.md`. Add the name to
  `tests/test_qa_e2e_cases.py`'s expected case names and to
  `tests/test_pattern_replay.py`'s case map. Commit this task on its own: that
  commit is the base for task 24's failing-first run.
- [ ] 20. Backend tests, failing-first where marked, each seen to fail on task
  19's commit:
  - failing-first, in `tests/test_watched_change.py`: through `review_trials` on
    c4-ic's superseded carb-ratio record, each mode's Trial (after) period ends
    at or before the record's ending instant;
  - failing-first, same file: on `c4-isf-late-read`, the Current policy read is
    available with both periods, its Trial period ends at or before the ending,
    and its context's source pump read was captured at or before the ending;
    the Retained read is unavailable with reason `context_after_ending`;
  - failing-first, in `tests/test_follow_up_comparison.py`: a retained context
    whose `code_version` differs from, or is absent from, what the running build
    would stamp is read (available). Reword the `code_version = "retired"` pins
    at `tests/test_follow_up_comparison.py:71-72` and `:82` so a differing
    policy stamp is still refused with `unsupported_retained_execution`;
  - guards, passing before and after: an open record's reassessment still reads
    to the data tail; `tests/test_durable_follow_up.py:752`'s changed scenario
    configuration is still refused with `unsupported_retained_execution`; `test_h_a_context_read_after_the_ending_leaves_the_assessment_unavailable`
    and `test_i_a_context_read_before_the_superseding_change_is_used` pass
    unchanged.
- [ ] 21. Backend (ADR 462 decisions 2 and 3):
  - in `ciq_autotune/follow_up_comparison.py`, `_execution()` returns the policy
    stamp and scenario configuration only (drop the package hash, its comment
    and any import left unused); in `compare_follow_up`, a retained context that
    is available and whose source pump read is after the cutoff, or names none,
    answers `context_after_ending` through the same unavailable envelope, checked
    before the version gate;
  - in `ciq_autotune/watched_change.py`, `capture_ending` drops its own copy of
    that check and always calls the comparison; `review_trials` computes a
    requested reassessment of a Trial record whose ending carries a kind with its
    data cutoff at the earlier of the ending's effective instant and `now`;
  - in `ciq_autotune/store.py`, an available comparison context no longer
    requires `code_version`.
- [ ] 22. Frontend tests, failing-first where marked, each seen to fail on task
  19's commit:
  - failing-first, in `frontend/follow-up-lifecycle.test.js` with its host fake:
    an expired record whose saved assessment is unavailable
    `context_after_ending` with no periods, and a paired Current policy read
    with one outcome row. After pressing Current policy the stage carries
    `data-figure-state="paired"` and the outcome row, its instrument names
    "Current policy reassessment" with "recomputed now" and does not read
    "as saved at the ending", and the saved-ending part still reads
    unavailable with its reason's words. Pressing Retained context served
    `unsupported_retained_execution` draws the unavailable figure naming that
    reason's words, under "Retained context reassessment";
  - guard, same file, passing before and after: an expired record whose saved
    assessment serves both periods keeps "as saved at the ending", its own rows
    and its figure after pressing each mode (the S96 shape);
  - failing-first: reword `frontend/history.test.js:332` so the Retained line
    reads "Stored context recorded <stamp>" from the context's `captured_at` and
    contains no run of eight or more hex characters, and a context with no
    `captured_at` reads "No stored context was recorded";
  - failing-first, in `frontend/follow-up.test.js`: the words for
    `unsupported_retained_execution` name Current policy as the read left.
- [ ] 23. Frontend (ADR 462 decisions 1, 4 and 5): in `frontend/history.js`,
  `shownComparison` draws the requested reassessment for an ended record whose
  saved assessment serves no periods and the saved ending otherwise; the stage
  instrument names the mode and "recomputed now" for that case; the Retained
  line prints ADR 462 decision 4's words. Update `shownComparison`'s comment. In
  `frontend/follow-up.js`, change the `unsupported_retained_execution` words. In
  `frontend/c4.replay.mjs`, the `readiness` helper's "comparison the page shows"
  follows the same rule, with its comment and its pin in
  `frontend/c4.replay.test.js`.
- [ ] 24. Add one ledger story (the next unissued S id) on `c4-isf-late-read`,
  in a dated `## #462 amendment` section of
  `mockups/harmonic-v2-desktop.behavior.md` carrying Connor's 2026-09-24
  decisions as its sanction, with its replay function, registry entry, case
  mapping and story-table row in the files task 8 names. The story joins the PR
  smoke slice in `mockups/sweep/harmonic-v2-desktop/acceptance.py` and its test
  as the only story on its store, as S187 did. The story opens the ended record: the stage reads
  "as saved at the ending" with the unavailable figure naming the late-context
  reason; pressing Current policy draws a paired figure and outcome rows under
  "Current policy reassessment", with its Trial period ending at or before the
  record's Finished time; pressing Retained context reads unavailable naming the
  same late-context reason; the Retained line prints no id characters. Lay its
  harness over task 19's commit and record that base run, which must fail at the
  Current policy stage assertion, and the branch run at both sizes on its status
  line. In the same section, amend S91 in prose: its c4 part's c4-isf and
  c4-profile records are ended, so their Retained reads now count what their
  saved endings count and are not met; the story asserts the Retained read's
  arms equal the saved ending's arms instead of criterion met (ADR 462
  consequences). Raise the story inventory by this one story in the four places
  task 9 names.
- [ ] 25. Regenerate the design exploration
  (`uv run python mockups/harmonic-v2.exploration/generate.py`); its `focus.json`
  and `journey.json` lose the package hash. Its `--check` then passes.
- [ ] 26. Capture before/after renders of the `c4-isf-late-read` record's stage,
  on Original and after pressing Current policy, at 1280x720 and 1440x900 from
  the no-fetch serve, the before from task 19's commit. The coordinator
  attaches them to the pull request; they are not committed.

## #463 — What a change record prints, draws, and knows about its Plan

Tasks 18–26 (#462) land first on this branch, and #463's base is their final
commit. #463's touched stories are every story `frontend/replay-cases.mjs` or
`frontend/c3.replay.mjs` maps to `showcase`, `edit-chain` or a `c3-*` or `c4-*`
case: each one renders an evidence figure or an outcome table. The
reproduction is `docs/scope/463-record-display.repro.py`,
`docs/scope/463-figure.repro.mjs` and `docs/scope/463-redate.spike.py`.

- [ ] 27. Before any design change, run UI Craft's revise pre-work on the shipped
  desk (sweep deferred to start from triage, sandbox): replay #463's touched
  stories against #463's base at 1280x720 and 1440x900, re-inventory the six
  figure states and the Read column in the served app, and record any observed
  behavior with no story before designing.
- [ ] 28. Backend tests, failing-first where marked, each seen to fail on #463's
  base:
  - failing-first, in `tests/test_watched_change.py`: an ending a reconcile
    records carries `views.before.clock` and `views.after.clock` equal to the
    comparison's clock bins and no other view, and the store reads it back;
  - failing-first, same file: on `test_j`'s store with the Plan given an
    available decision context, the matched Trial's served original context is
    that decision context; a guard with the Plan's decision context unavailable
    serves the observed context;
  - failing-first, in `tests/test_plan_verdict.py`: extend
    `test_a_change_the_dose_stream_detects_still_confirms_from_the_read` so the
    Trial's receipt names the Plan, the Plan's receipt, verdict and confirmed
    time are unchanged, and the Trial's served original context is the Plan's
    decision context. Fail-closed guards in the same file: a second qualifying
    Trial, a Trial more than a day from the confirming read, and a Trial of
    another setting each leave the Trial unlinked;
  - failing-first, in `tests/test_watched_change.py`: a correction-factor and
    carb-ratio edit made mid-morning, whose day's first bolus carries the old
    values, is served through `review_trials` with a `changed_at` at the first
    bolus carrying the new values; a basal slot whose day's first sample carries
    the old rate is dated at its first sample carrying the new one;
  - failing-first, same file: a retained record saved at the day's first
    observation (the old dating) is still one record after a reconcile, keeps
    its id and change time, serves an available comparison rather than
    `missing_continuous_setting_history`, and still ends `reverted` when the
    setting walks back inside its window.
- [ ] 29. Backend (ADR 463 decisions 3–7): in `ciq_autotune/watched_change.py`,
  date `dose_regimes` and `basal_slot_regimes` at the first observation carrying
  the regime's value and correct the `Regime` and `_regimes_from_days`
  docstrings; add one same-change match used by `_reviewable_trials` (existing
  records keep their time and id), by `_reversal_at`, and by
  `ciq_autotune/follow_up_comparison.py`'s `_setting_period`; keep the clock
  views in `capture_ending`; serve a matched Plan's available decision context
  as a Trial's original context in `review_trials`; add the link pass after
  `_confirm_from_read` in `reconcile_follow_up`. `ciq_autotune/epochs.py` is not
  changed.
- [ ] 30. Frontend tests, failing-first where marked, each seen to fail on #463's
  base:
  - failing-first, in `frontend/follow-up.test.js`: `outcomesTable` given a
    served difference of -3.9000000000000057 prints "difference -3.9", a Before
    of 33.333333333333336 prints "33.3%", a positive difference prints its "+",
    and a difference that rounds to zero prints "difference 0";
  - failing-first, same file: `evidenceFigure` in the `saved`, `unavailable`,
    `no-readings` and `not-requested` states renders no `role="img"` and no chart
    seat; guard: `paired` and `before-only` still render both. Update the
    existing saved-state test near `frontend/follow-up.test.js:453`;
  - failing-first, in `frontend/follow-up-lifecycle.test.js`: an expired record
    whose saved assessment carries clock bins on both sides draws
    `data-figure-state="paired"` on its stage under "as saved at the ending".
- [ ] 31. Frontend (ADR 463 decisions 1 and 2): in `frontend/follow-up.js`,
  print differences and percent cells at one decimal, and render the chart seat
  only for a figure that draws a curve, updating `evidenceFigure`'s comment; in
  `frontend/desk.css`, give the figure's track only its legend's height when the
  figure draws no curve, on the Trial and Focus stages at every width.
- [ ] 32. Desk-suite test in `frontend/desk.browser.test.mjs`, failing-first on
  #463's base, at 1280x720 and 1440x900: a served hand-built ended record whose
  saved assessment serves both periods and rows and no clock views opens with
  its figure no taller than its legend line plus one pixel, and nothing inside
  the stage carries `role="img"`.
- [ ] 33. Add one ledger story (the next unissued S id after task 24's) in a
  dated `## #463 amendment` section of `mockups/harmonic-v2-desktop.behavior.md`,
  with its replay function, registry entry, case mapping and story-table row in
  the files task 8 names. Leg 1, on `showcase`: Changes' watched Trial reads
  "difference -3.9" on its Time in range row, and no printed difference or
  percent cell carries more than one decimal. Leg 2, on `c3-history`: the
  finished record's stage draws a paired figure with its chart under "as saved
  at the ending". The story fails once, naming each failed leg. Lay its harness
  over #463's base and record that base run, where both legs fail, and the
  branch run at both sizes on its status line. The amendment also records the
  matched-Plan decision, the link rule and the dating as changed shipped
  behavior evidenced by backend tests, naming that no committed case records a
  Plan. Raise the story inventory by this one story in the four places task 9
  names.
- [ ] 34. In `CONTEXT.md`, the Plan entry says a Trial detected after its Plan's
  pump-read confirmation links to that Plan and shows its decision, and the
  Trial entry says a change seen only in delivery history is dated at the first
  observation carrying its new value.
- [ ] 35. Regenerate the design exploration
  (`uv run python mockups/harmonic-v2.exploration/generate.py`) if #463's changes
  move it; its `--check` passes.
- [ ] 36. Capture before/after renders at 1280x720 and 1440x900: the showcase's
  watched Trial Read column, c3-history's finished record stage, and the
  desk-suite collapsed figure of task 32, the before from #463's base. The
  coordinator attaches them to the pull request; they are not committed.
