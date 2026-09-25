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

- [x] 18. Before any design change, run UI Craft's revise pre-work on the shipped
  desk (sweep deferred to start from triage, sandbox): replay #462's touched
  stories against the unchanged base at 1280x720 and 1440x900 through
  `frontend/desk-behavior.replay.mjs`, re-inventory an ended record's stage
  (instrument words, figure state, periods note, outcome rows) and its
  reassessment lines in Original, Retained context and Current policy in the
  served app, and record any observed behavior with no story before designing.
- [x] 19. Add the manufactured case `c4-isf-late-read` to
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
- [x] 20. Backend tests, failing-first where marked, each seen to fail on task
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
- [x] 21. Backend (ADR 462 decisions 2 and 3):
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
- [x] 22. Frontend tests, failing-first where marked, each seen to fail on task
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
- [x] 23. Frontend (ADR 462 decisions 1, 4 and 5): in `frontend/history.js`,
  `shownComparison` draws the requested reassessment for an ended record whose
  saved assessment serves no periods and the saved ending otherwise; the stage
  instrument names the mode and "recomputed now" for that case; the Retained
  line prints ADR 462 decision 4's words. Update `shownComparison`'s comment. In
  `frontend/follow-up.js`, change the `unsupported_retained_execution` words. In
  `frontend/c4.replay.mjs`, the `readiness` helper's "comparison the page shows"
  follows the same rule, with its comment and its pin in
  `frontend/c4.replay.test.js`.
- [x] 24. Add one ledger story (the next unissued S id) on `c4-isf-late-read`,
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
- [x] 25. Regenerate the design exploration
  (`uv run python mockups/harmonic-v2.exploration/generate.py`); its `focus.json`
  and `journey.json` lose the package hash. Its `--check` then passes.
- [x] 26. Capture before/after renders of the `c4-isf-late-read` record's stage,
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

- [x] 27. Before any design change, run UI Craft's revise pre-work on the shipped
  desk (sweep deferred to start from triage, sandbox): replay #463's touched
  stories against #463's base at 1280x720 and 1440x900, re-inventory the six
  figure states and the Read column in the served app, and record any observed
  behavior with no story before designing.
- [x] 28. Backend tests, failing-first where marked, each seen to fail on #463's
  base:
  - failing-first, in `tests/test_watched_change.py`: an ending a reconcile
    records carries `views.before.clock` and `views.after.clock` equal to the
    comparison's clock bins and no other view, and the store reads it back;
  - failing-first, same file: on `test_j`'s store with the Plan given an
    available decision context, the matched Trial's served original context is
    that decision context; a guard with the Plan's decision context unavailable
    serves the observed context;
  - failing-first, in `tests/test_plan_verdict.py`: a sibling of
    `test_a_change_the_dose_stream_detects_still_confirms_from_the_read` with
    the same Plan and dose-detected basal Trial, but its confirming read at
    `day0 + 1 day 01:00`, within a day of the Trial's change time on day0. The
    Trial's receipt names the Plan, the Plan's receipt, verdict and confirmed
    time are unchanged, and the Trial's served original context is the Plan's
    decision context. The existing test keeps its read at `day0 + 2 days
    01:00`, about 46 hours after the Trial's change time, and becomes the
    "more than a day from the confirming read" guard: it gains an assertion
    that the Trial stays unlinked and is otherwise unchanged. Further
    fail-closed guards in the same file: a second qualifying Trial and a Trial
    of another setting each leave the Trial unlinked;
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
- [x] 29. Backend (ADR 463 decisions 3–7): in `ciq_autotune/watched_change.py`,
  date `dose_regimes` and `basal_slot_regimes` at the first observation carrying
  the regime's value and correct the `Regime` and `_regimes_from_days`
  docstrings; give each regime the date the earlier dating gave it (its settled
  day's first observation); add one helper, `watched_change.same_change(record, *,
  parameter, slot, block, legacy, before, after) -> bool`, true when the record's
  parameter, slot and block equal the given ones, its before and after equal them
  wherever it carries them, and its change time equals `legacy` to the second
  (ADR 463 decision 5, exact since code review round 3); and make
  `_reviewable_trials` (an old-dated record of a delivery-detected change keeps
  its time and id, each record kept by one candidate at most, the earliest; a
  record at a pump-read switch instant is never kept), `_reversal_at`, and `ciq_autotune/follow_up_comparison.py`'s
  `_setting_period` (which already imports from `watched_change` inside the
  function) all call it rather than restating the rule; keep the clock
  views in `capture_ending`; serve a matched Plan's available decision context
  as a Trial's original context in `review_trials`; add the link pass after
  `_confirm_from_read` in `reconcile_follow_up`. `ciq_autotune/epochs.py` is not
  changed.
- [x] 30. Frontend tests, failing-first where marked, each seen to fail on #463's
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
- [x] 31. Frontend (ADR 463 decisions 1 and 2): in `frontend/follow-up.js`,
  print differences and percent cells at one decimal, and render the chart seat
  only for a figure that draws a curve, updating `evidenceFigure`'s comment; in
  `frontend/desk.css`, give the figure's track only its legend's height when the
  figure draws no curve, on the Trial and Focus stages at every width.
- [x] 32. Desk-suite test in `frontend/desk.browser.test.mjs`, failing-first on
  #463's base, at 1280x720 and 1440x900: a served hand-built ended record whose
  saved assessment serves both periods and rows and no clock views opens with
  its figure no taller than its legend line plus one pixel, and nothing inside
  the stage carries `role="img"`.
- [x] 33. Add one ledger story (the next unissued S id after task 24's) in a
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
- [x] 34. In `CONTEXT.md`, the Plan entry says a Trial detected after its Plan's
  pump-read confirmation links to that Plan and shows its decision, and the
  Trial entry says a change seen only in delivery history is dated at the first
  observation carrying its new value.
- [x] 35. Regenerate the design exploration
  (`uv run python mockups/harmonic-v2.exploration/generate.py`) if #463's changes
  move it; its `--check` passes.
- [x] 36. Capture before/after renders at 1280x720 and 1440x900: the showcase's
  watched Trial Read column, c3-history's finished record stage, and the
  desk-suite collapsed figure of task 32, the before from #463's base. The
  coordinator attaches them to the pull request; they are not committed.

## #465 — A recurring-lows basal cut within the threshold holds

Tasks 1–36 (#460, #459, #462, #463) land first on this branch; #465's base is
their final commit. #465 changes no frontend source: its surface change is
served (a held lane cell and panel, and a held queue row with its own sentence).
Across the 74 committed synthetic stores no recurring-lows verdict moves
(`uv run python docs/scope/465-recurring-low-floor.repro.py --stores`). #465's
touched stories are S113, S151, S152, S153, S183, S184 and S185: every story
`frontend/replay-cases.mjs` maps to `basal-verdict-gallery`, the store whose
replays open recurring-lows rows. The reproduction is
`docs/scope/465-recurring-low-floor.repro.py`.

- [x] 37. Before any design change, run UI Craft's revise pre-work on the shipped
  desk (sweep deferred to start from triage, sandbox): replay #465's touched
  stories against #465's base at 1280x720 and 1440x900 through
  `frontend/desk-behavior.replay.mjs`, re-inventory a recurring-lows lower and a
  recurring-low hold (lane cell, panel verdict and sentence, stage control,
  queue row) in the served app on `basal-recurring-low-lower` and
  `basal-recurring-low-gate`, and record any observed behavior with no story
  before designing.
- [x] 38. Add the manufactured case `basal-recurring-low-within-floor` to
  `scripts/qa_e2e_cases.py`: `_materialize_basal_coverage` with
  `clean_rate=0.59` and `recurring_lows=True` against the default programmed
  0.60, with the scoped window `(180, 240)`. Follow AGENTS.md "Maintaining QA
  coverage eras" steps 1–3 on #465's base: copy its complete `execute_case` row
  dump, which serves 03:00 as "lower (recurring lows)" at 0.59, into literal
  `QaExpectation` values and run its generated
  `test_case_basal_recurring_low_within_floor`. Add the name to
  `tests/test_qa_e2e_cases.py`'s expected case names and to
  `tests/test_pattern_replay.py`'s case map. Commit this task on its own: that
  commit is the base for tasks 39, 40, 42 and 44's failing-first runs.
- [x] 39. Failing-first unit tests in `tests/test_harm.py` `ApplyHarmTest`, each
  `nudge=True` and seen to fail on task 38's commit: setting 0.72 with median
  0.71 is `HARM_GATED` at 0.72; setting 0.20 with median 0.19 is `HARM_GATED`
  at 0.20; setting 0.11 with no median is `HARM_GATED` at 0.11; setting 0.10
  with no median is `HARM_GATED` at 0.10. Guards, passing before and after:
  setting 0.72 with median 0.66 is `HARM_LOWER` at 0.66; setting 0.20 with
  median 0.16 is `HARM_LOWER` at 0.16; setting 0.72 with median 0.576 (exactly
  one step) is `HARM_LOWER` at 0.576; setting 0.72 with no median is
  `HARM_LOWER` at 0.576; setting 0.137 with no median, and setting 0.137 with
  median 0.10, are each `HARM_LOWER` at 0.11 (the check reads the target before
  rounding, ADR 465 decision 1); the gate-only cases are unchanged.
- [x] 40. Failing-first analyzer tests, each seen to fail on task 38's commit:
  - in `tests/test_harm_basal_arm.py`, through `analyze_basal` on
    `_build(rate=0.71, programmed=0.72, low_nights=(20, 21))`: 03:00 is
    `HARM_GATED` at 0.72, `asserts_move` is false, the guidance action is
    `None`, the guidance seriousness is still `"recurring_low"`,
    `evidence["harm"]["nudged"]` is still true, and the annotation is ADR 465
    decision 2's recurring-lows hold sentence; the existing median-at-current
    test (`_build(rate=0.72, …)`) gains the same sentence assertion; guards,
    passing before and after: the single-low raise gate and the recurring-lows
    median-above case keep "a low printed at this hour, so a step up is
    withheld and the rate stays as it is";
  - in `tests/test_analyzer_basal.py`: `consolidate_profile` over that
    analysis carries 0.72 in every segment starting before 06:00;
  - in `tests/test_tuning_priority.py`: two nudged slots built as item 4 of the
    reproduction builds them (01:30 on 14 nights, 03:00 on 9 nights at 0.60,
    programmed 0.72, lows at both on two nights). `basal_lever` with 01:30
    delivering 0.71 returns the same priority and recurrence channel
    (`basal_lower`, 9 of 9) as with 01:30 delivering 0.72.
- [x] 41. Backend (ADR 465 decisions 1 and 2): in `ciq_autotune/safety.py`,
  `apply_harm` passes every nudge target through one threshold check,
  `min(noise_floor, current * max_step_frac)` with a 1e-9 tolerance, comparing
  `current` against the clamped target before `round(…, 3)`, and holds at
  `current` as `HARM_GATED` below it; update its docstring and the module
  docstring's list if it names the harm rules. In
  `ciq_autotune/analyzers/basal.py`, `_annotation_for(status, *,
  recurring_hold=False)` serves "lows keep happening overnight, but the step
  down is smaller than the smallest change worth making, so the rate stays as it
  is" for `HARM_GATED` when `recurring_hold` is true; `analyze_basal` passes
  `recurring_hold` true for a `HARM_GATED` slot that is nudged and whose clean
  median is `None` or at most its current rate. The threshold is computed
  nowhere else. In `tests/test_annotation_register.py`, `basal_annotations()`
  also catalogs `_annotation_for(Status.HARM_GATED, recurring_hold=True)`, so
  the register guard covers the new sentence.
- [x] 42. Findings projection (ADR 465 decision 3). Failing-first, seen to fail
  on task 38's commit: in `tests/test_findings_projection.py`, an analysis whose
  basal rows are `analyze_basal`'s output for `_build(rate=0.71,
  programmed=0.72, low_nights=(20, 21))` projects, in the clock window
  `(180, 240)`, a held 03:00 row titled "Basal 03:00" with no priority whose
  headline opens with the recurring-lows hold sentence, capitalised; guard: the
  existing "Basal 12:30 to 14:00 · leaning lower" and "Basal 06:30 · leaning
  raise" titles hold. Then: in `ciq_autotune/findings_projection.py`,
  `_basal_key` drops a `"lower"` lean for a held slot whose served
  `evidence.harm.nudged` is true, with `_lean`'s docstring updated; make the
  same change to `basalKey` in `mockups/findings-projection.mirror.mjs`; in
  `scripts/gen_findings_projection_fixtures.py`, `basal_rows()` serves slot 6
  (03:00) at current 1.00 with a 0.99 estimate (interval 0.97–1.01, 20 nights),
  its verdict from the real `cap()` then `apply_harm(..., nudge=True,
  median=0.99)`, its sentence from `_annotation_for(status,
  recurring_hold=True)`, and `evidence["harm"]` carrying `nudged` and `gated`
  true; regenerate `frontend/__fixtures__/findings-projection.json`. The
  generator's `--check`, `frontend/findings-projection-mirror.test.js` and
  `tests/test_guidance.py` pass; any `tests/test_findings_projection.py`
  count the new held row moves is updated to the regenerated answer and named
  in the commit message.
- [x] 43. Rewrite `basal-recurring-low-within-floor`'s literal expectation from
  its post-fix `execute_case` dump (AGENTS.md step 2): 03:00 `HARM_GATED`, no
  whole-day assert row, a held `(180, 240)` row whose headline opens with the
  recurring-lows hold sentence. The expectations of `basal-recurring-low-lower`,
  `basal-recurring-low-no-clean-median` and `basal-recurring-low-gate` do not
  move. Re-measure the five budgets (step 4) against the limits of record in
  `openspec/changes/archive/2026-09-24-harmonic-v2/coverage-appendix.md`
  without raising any, judging the whole-pytest budget against the base on the
  same machine as ADR 463's ruling does, and record them as a dated `#465`
  section of `openspec/changes/qa-round-2/coverage-appendix.md`.
- [x] 44. Add one ledger story (the next unissued S id) on
  `basal-recurring-low-within-floor`, in a dated `## #465 amendment` section of
  `mockups/harmonic-v2-desktop.behavior.md` carrying Connor's 2026-09-24
  decision as its sanction, with its replay function, registry entry, case
  mapping and story-table row in the files task 8 names. The story opens
  Diagnose at 24 h, finds the 03:00 lane cell `data-verdict="hold"` with no
  `data-reason`, the key with no "lower · recurring lows" entry, and the
  opened panel reading "holds at current" and the recurring-lows hold sentence,
  with no Stage change control. Lay its harness over task 38's commit and
  record that base run, which must fail at the lane-cell assertion, and the
  branch run at both sizes on its status line. Raise the story inventory by
  this one story in the four places task 9 names.
- [x] 45. In `CONTEXT.md`, the **Harm signal** entry says the nudge holds, rather
  than stepping, when its step would be smaller than the noise floor or one full
  step, whichever is smaller (ADR 465).
- [x] 46. Capture before/after renders of the 03:00 panel and lane on
  `basal-recurring-low-within-floor` at 1280x720 and 1440x900 from the no-fetch
  serve, the before from task 38's commit. The coordinator attaches them to the
  pull request; they are not committed.

## #466 — A recurring-lows slot says what owns its move and shows its lows

Tasks 37–46 (#465) land first on this branch; #466's base is their final
commit, and its lows list reads the harm evidence #465 leaves in place. #466's
touched stories are every story `frontend/replay-cases.mjs` maps to a case
whose name starts with `basal-`, plus R5: each opens a basal slot panel, its
roster or its lane. The reproduction is
`docs/scope/466-recurring-low-explain.repro.py` and
`docs/scope/466-slot-panel.repro.mjs`.

- [x] 47. Before any design change, run UI Craft's revise pre-work on the shipped
  desk (sweep deferred to start from triage, sandbox): replay #466's touched
  stories against #466's base at 1280x720 and 1440x900, re-inventory the basal
  slot panel's interval sentences, its roster groups and excluded-night line,
  and a recurring-lows lower and hold in the served app, and record any
  observed behavior with no story before designing.
- [x] 48. Add the manufactured case `basal-recurring-low-spread` to
  `scripts/qa_e2e_cases.py`: give `_materialize_basal_coverage` a
  `clean_rates` parameter, one rate per informative night in order (default
  `None` keeps `clean_rate` for every night, so no other case moves), and call
  it with fourteen nights at 0.45, two at 0.54 and fourteen at 0.66 and
  `recurring_lows=True`, as `docs/scope/466-recurring-low-explain.repro.py
  --case` spikes it. Follow AGENTS.md "Maintaining QA coverage eras" steps 1–3
  on #466's base: its dump serves 03:00 as "lower (recurring lows)" at 0.54
  with an interval of 0.45–0.66. Add the name to
  `tests/test_qa_e2e_cases.py` and `tests/test_pattern_replay.py`. Commit this
  task on its own: that commit is the base for tasks 49, 52 and 55's
  failing-first runs.
- [x] 49. Backend tests in `tests/test_harm_basal_arm.py`, through
  `analyze_basal`, failing-first on task 48's commit: with 03:00's setting
  epoch after two band-low nights and before a third, 03:00's
  `evidence["harm"]` serves `band_nights` 3, `recurrence_nights` 1 and
  `recurrence_bar` 2 and is not nudged; with a fourth band-low night after the
  epoch it serves `recurrence_nights` 2 and is nudged; the existing
  median-at-current test gains `recurrence_nights` 2 and `recurrence_bar` 2.
- [x] 50. Backend (ADR 466 decisions 1, 2 and 8): in `ciq_autotune/harm.py`,
  replace `_slot_recurs` with a count of the band nights on or after a slot's
  epoch, give `BasalHarm` the per-slot counts and the bar `basal_harm` used
  (defaults keep `BasalHarm() == basal_harm([], [], …)`), decide `nudged_slots`
  from those counts, and serve `recurrence_nights` and `recurrence_bar` from
  `basal_harm_evidence` on every gated slot; update the docstrings. In
  `ciq_autotune/analyzers/basal.py`, the `HARM_LOWER` sentence reads "lows keep
  happening overnight, so the rate steps down toward the measured rate (20% at
  most)". Rewrite the headline literals of `basal-recurring-low-lower`,
  `basal-recurring-low-no-clean-median` and `basal-recurring-low-spread` from
  their dumps. In `ciq_autotune/result.py`, correct `asserts_move`'s docstring.
- [x] 51. In `scripts/gen_basal_night_evidence_fixtures.py`, add a
  `recurring_lows` key to the fixture: its synthetic input rows and the served
  `/api/analyze` basal rows for 01:00 (the spread nights, no lows: held, its
  interval reaching the setting), 03:00 (the spread nights plus band lows at
  03:00 on two nights: "lower (recurring lows)", its interval reaching the
  setting) and 05:00 (nights at 0.59 against 0.60 plus lows at 05:00 on the same
  two nights: `HARM_GATED` under ADR 465). The generator asserts each of those
  three served statuses before writing. Regenerate
  `frontend/__fixtures__/basal-night-evidence.json`; its `expected` key is
  unchanged and `--check` passes.
- [x] 52. Frontend Node tests in `frontend/diagnose-workstation.test.js`, each
  cell built by `buildSlotLane` from task 51's served rows, failing-first on
  task 48's commit with the fixture of task 51 laid over it:
  - `renderSlotLevel` on 03:00 prints ADR 466 decision 3's sentence and not
    "not established by it";
  - on 03:00 the count line prints the served `recurrence_nights` and
    `recurrence_bar` and says the count covers the whole night; one row per
    served low prints its date, nadir time and nadir glucose; pressing a row
    calls `onDay` with that low's served `t`; no low row carries the
    `case-occurrence` class;
  - on 05:00 the count line and rows render and no Stage change control does;
  - on 01:00 the panel prints today's "not established by it" and no count
    line or low row;
  - guard, passing before and after: a plain "lower" row whose interval
    reaches the setting prints "not established by it" (a hand-built row is
    admitted here: it pins the frontend's status-string branch, not a backend
    verdict);
  - the roster test "each basal night row prints the served date, both rates
    and the in-slot mean" (`frontend/diagnose-workstation.test.js:799` at the
    pinned commit) gains one header row, hidden from assistive technology,
    reading "Delivered U/h", "Programmed U/h", "Night mean mg/dL" in that
    order, and each night row's values carrying "U/h delivered",
    "U/h programmed" and "mg/dL night mean" in visually hidden text; its cell
    regex (`:808`, `[^<]*` inside each cell span) is adapted to read each
    cell's visible value past the hidden-label span, with the same expected
    values;
  - the recurring-lows lane test reads "suggests a lower because lows keep
    happening overnight" in the cell's title and name.
- [x] 53. Frontend (ADR 466 decisions 2–6): in
  `frontend/diagnose-workstation.js`, give `renderParamLevel` a spec option for
  the interval sentence's second half and have `renderSlotLevel` set it from
  the served status "lower (recurring lows)" alone; render the lows block after
  the numbers block and before the nights read's pending, failed or stale
  lines, from the served `evidence.harm` only, handing each low to
  `options.onDay`; add the roster header row and the hidden labels in the row
  markup; change `VERDICT_KEY['down:recurring-lows']`; update the comments at
  the hedge and the roster. In `frontend/diagnose-workstation.css`, style the
  header row and the low rows from the roster's existing tokens. The carb-ratio
  and correction-factor panels do not change.
- [x] 54. In `DESIGN.md`, the recurring-lows worked example and the lane-key note
  say "overnight" and name the cell "suggests a lower because lows keep
  happening overnight".
- [x] 55. Add one ledger story (the next unissued S id after task 44's) in a
  dated `## #466 amendment` section of `mockups/harmonic-v2-desktop.behavior.md`
  carrying Connor's 2026-09-24 decision as its sanction, with its replay
  function, registry entry, case mapping and story-table row in the files task
  8 names. Leg 1, on `basal-recurring-low-spread`: open the 03:00 slot; the
  panel reads ADR 466 decision 3's sentence and not "not established by it";
  the count line prints the served count and bar; two low rows print their
  served dates, times and glucose; pressing the first opens Day on that low's
  date; the roster shows its header row. Leg 2, on
  `basal-recurring-low-within-floor` through `ctx.withCase`: the held 03:00
  panel lists its lows with the count line and offers no Stage change. The
  story fails once, naming each failed leg. Lay its harness over task 48's
  commit and record that base run, where both legs fail, and the branch run at
  both sizes on its status line. In the same section, amend S113: its
  recurring-lows cell's name now reads "05:00 basal slot, suggests a lower
  because lows keep happening overnight", in `frontend/c4.replay.mjs` and its
  fake page in `frontend/c4.replay.test.js`. Raise the story inventory by this
  one story in the four places task 9 names.
- [x] 56. Re-measure the five QA budgets for `basal-recurring-low-spread` as task
  43 does and record them as a dated `#466` section of
  `openspec/changes/qa-round-2/coverage-appendix.md`.
- [x] 57. Capture before/after renders of the 03:00 slot panel on
  `basal-recurring-low-spread` at 1280x720 and 1440x900, the before from task
  48's commit, and an after render of the held 03:00 panel on
  `basal-recurring-low-within-floor`. The coordinator attaches them to the pull
  request; they are not committed.

## #467 — A scoped window serves a Pattern when its outcomes land in it

Tasks 1–57 (#460, #459, #462, #463, #465, #466) land first on this branch;
#467's base is the triage commit its lock pins. #467's touched stories are S192
(task 62) and the stories whose replays read the rail or press a Window preset:
R4, R10, R15, S113, S115, S116, S126, S136, S138, S147, S154, S178, S183, S190
and S191. The reproduction is `docs/scope/467-scoped-pattern-membership.repro.py`
and the rule's spike is `docs/scope/467-scoped-pattern-membership.spike.py`;
under it no QA expectation moves, so no QA case is added or rewritten.

- [x] 58. Before any design change, run UI Craft's revise pre-work on the shipped
  desk (sweep deferred to start from triage, sandbox): replay #467's touched
  stories against #467's base at 1280x720 and 1440x900 through
  `frontend/desk-behavior.replay.mjs`, re-inventory the 24 h and Overnight
  queues on `basal-recurring-low-lower` in the served app (the Pattern rows,
  their count sentences, which rows carry a mini), and record any observed
  behavior with no story before designing.
- [x] 59. Failing-first backend tests, each seen to fail on #467's base:
  - in `tests/test_findings_projection.py`, through `materialize_case` then
    `execute_case` (`scripts/qa_e2e_cases.py`) then
    `prepare_findings_projection(...).project` on `basal-recurring-low-lower`:
    under `WindowQuery.clock(0, 360)`, `pattern:overnight_lows_no_iob` is served
    with the k, n, `admission_route` and `priority` of its whole-day row,
    `window_scope` "window", `pattern_chart` None and one count sentence "2 of 30
    nights ran low between 00:00 and 06:00"; under `clock(120, 300)` the same k,
    n and sentence; under `clock(840, 1260)` no overnight Pattern row and no
    overnight Pattern in the served `outcome_patterns`; the whole day still
    reads "2 of 30 nights ran low overnight";
  - in the same file, on the generator's `projection()` under `clock(0, 1440)`:
    `pattern:lows_after_meals` and `pattern:lows_after_correcting_highs` are
    served, `finding:correction_stacking` and `finding:correction_on_iob` carry
    `claimed_by` "pattern:lows_after_correcting_highs" as in the whole day, and
    every `claimed_by` names a served Pattern row;
  - in `tests/test_outcome_patterns.py`, through `outcome_window_population` on
    a synthetic analysis whose basal rows publish `harm_band_source_nights` 8
    and a `band_nights` 2 harm evidence: the scoped roster carries the overnight
    Pattern for `clock(0, 360)` and `clock(300, 420)` and not for
    `clock(360, 1440)`; with `harm_band_source_nights` 0 it is absent from
    `clock(0, 360)`; an unadmitted Exposure-family Pattern with one outcome in
    the window is carried and one with none is not.
  Amend `tests/test_findings_projection.py`'s scoped-Pattern assertions (at
  the pinned commit, `:1063`–`:1070`): a scoped Pattern row carries a chart
  coordinate exactly when `pattern_chartable` holds, and a scoped `claimed_by`
  names a served Pattern row, in place of "every scoped Pattern row carries a
  chart" and "no scoped row is claimed". Amend
  `tests/test_outcome_patterns.py`'s lookup of `highs_after_treating_lows` in
  the 14:00–18:00 scoped roster (at the pinned commit `:193`–`:198`), which
  pins it at k 0, n 0 and readiness `withheld`: under decision 4 it now asserts
  that zero-n Pattern is absent from that roster.
- [x] 60. Backend (ADR 467 decisions 1–4): in
  `ciq_autotune/analyzers/scenario/outcome_patterns.py`, add
  `pattern_in_window(pattern, query)` and have `outcome_window_population`
  return only member Patterns for a scoped query; update the module and
  function docstrings. In `ciq_autotune/findings_projection.py`, remove the
  scoped `pattern_chartable` gate from `_pattern_rows`, keep `pattern_chartable`
  for the chart coordinate alone (docstring says so), and have
  `_pattern_count_sentences` serve the harm-band Pattern's outcome as "ran low
  between <start> and <end>" on a `window_scope` "window" row, the minutes
  printed with `_hhmm` from `HarmConfig`'s band; the whole-day outcome word is
  unchanged.
- [x] 61. Mirror and fixture (ADR 467 decision 5): in
  `mockups/findings-projection.mirror.mjs`, drop the scoped membership gate,
  stamp the scoped chart coordinate from `patternChartable` over the scoped `n`
  (removing the `pattern.n > 0` stand-in) and transcribe the band sentence. In
  `scripts/gen_findings_projection_fixtures.py`, `_slot(..., recurring_lows=True)`
  serves `evidence["harm"]["band_nights"]` 2 and
  `evidence["harm_band_source_nights"]` 20. Regenerate
  `frontend/__fixtures__/findings-projection.json`; its `--check` and
  `frontend/findings-projection-mirror.test.js` pass. Regenerate the
  eating-sequence payload (`uv run python scripts/gen_eating_sequence_fixtures.py`),
  whose 00:00–06:00 windows run the scoped projection: only
  `mockups/eating-sequence-findings.synthetic/payload.json` moves (measured under
  the spike at 977,835 bytes); its `--check` and
  `tests/test_eating_sequence_finding_fixture.py`'s 1,000,000-byte limit pass. Any pinned count or order the regenerated fixture moves in
  `tests/test_findings_projection.py`, `tests/test_guidance.py`,
  `frontend/diagnose-findings-queue.test.js` or
  `frontend/browser-fixture-population.test.js` is updated to the regenerated
  answer and named in the commit message.
- [x] 62. Add one ledger story (the next unissued S id, S192 at the pinned
  commit) on `basal-recurring-low-lower`, in a dated `## #467 amendment`
  section of `mockups/harmonic-v2-desktop.behavior.md` carrying Connor's
  2026-09-24 option A as its sanction, with its replay function in
  `frontend/c4.replay.mjs`, registry entry in
  `frontend/desk-behavior.replay.mjs`, case in `frontend/replay-cases.mjs` and
  story-table row in `frontend/c4.replay.test.js`. At 24 h the rail's overnight
  Pattern row prints "2 of 30 nights ran low overnight" and draws no mini;
  pressing Overnight keeps the row, printing "2 of 30 nights ran low between
  00:00 and 06:00", with no mini, as its whole-day twin; pressing Afternoon
  lists no overnight Pattern row. The story asserts no rank numeral, tier or
  position (#469 moves those). Lay its harness over #467's base and record that
  base run, which must fail at the Overnight row, and the branch run at both
  sizes on its status line. Raise the story inventory by this one story in the
  four places task 9 names.
- [x] 63. Capture before/after renders of the Overnight queue on
  `basal-recurring-low-lower` at 1280x720 and 1440x900 from the no-fetch serve,
  the before from #467's base. The coordinator attaches them to the pull
  request; they are not committed.

## #469 — The findings rail follows the one urgency ranking

Tasks 58–63 (#467) land first; #469's base is their final commit, and its
scoped rows read the membership #467 serves. #469's touched stories are S192,
S193 (task 71) and #467's rail-reading list. The reproduction is
`docs/scope/469-queue-rank.repro.mjs` and the server rules' spike is
`docs/scope/469-queue-rank.spike.py`; under it no QA expectation moves.

- [x] 64. Before any design change, run UI Craft's revise pre-work on the shipped
  desk (sweep deferred to start from triage, sandbox): replay #469's touched
  stories against #469's base at 1280x720 and 1440x900, re-inventory the rail's
  numerals, tier words, stripe, tail note and folds on the showcase at 24 h and
  Overnight and on `isf-direction-only-weaken` at 24 h in the served app, and
  record any observed behavior with no story before designing.
- [x] 65. Failing-first backend tests in `tests/test_findings_projection.py`
  `QueueOrderTest`, on the generator's `projection()`, each seen to fail on
  #469's base:
  - whole day: `pattern:highs_after_meals` and `pattern:lows_after_meals` carry
    `anchored_by` "ic:720" and `pattern:overnight_lows_no_iob` carries
    "basal:30-90"; each follows its anchor with nothing between them but other
    rows anchored to it and their claimed causes, `finding:carb_undercount`
    directly after Highs after meals; each carries `rank_note` "Ranked with its
    setting" and its anchor's tier; every top-level `next_in_line` row precedes
    every top-level `worth_a_look` row; no other row carries a `rank_note` or an
    anchor;
  - 14:00–21:00 (`AFTERNOON`): `finding:over_treated_low` carries `rank_note`
    "Ranked on all 30 days" and `ic:720` none;
  - 06:00–11:00: Highs after meals carries no anchor and `rank_note` "Ranked on
    all 30 days";
  - 05:00–08:00 on the fixture inputs with 05:30 quiet and a supported 06:30
    raise (ADR 469 decision 7): the overnight Pattern, still admitted through
    its setting, carries no anchor and `rank_note` "Ranked on all 30 days"; and
    over the whole day with 00:30–01:30 quiet and a supported raise over
    05:30–06:30, which starts inside the band and crosses 06:00, it carries
    `anchored_by` "basal:330-390";
  - the direction-only weaken with no Pattern roster:
    `FindingsProjection(_analysis=analysis(isf=direction_only_isf_rows()),
    _exposures=exposures(), _scenarios=scenarios(), _outcome_patterns=[])`
    projected over the whole day serves `finding:correction_on_iob` and
    `finding:correction_stacking` unpriced with one episode each, and the `isf`
    row sorts before both (today the episode count puts both first).
  Replace `test_the_sorted_queue_publishes_its_three_closed_ranking_tiers`
  (at the pinned commit `:958`), which pins the tier to the register, with the
  band assertions above.
- [x] 66. Backend (ADR 469 decisions 1–4): in `ciq_autotune/findings_projection.py`,
  `_row` carries `anchored_by` and `rank_note`; `project` stamps each
  `setting_staging` Pattern's anchor after `_pattern_rows`, sorts with a
  `_sort_key` that places an anchored or claimed row after its parent
  (recursively, so a claimed cause follows its anchored Pattern) and puts
  unpriced asserting rows before unpriced findings; `_assign_tiers` stamps the
  bands; the rank notes are stamped last, the day count read from the
  analysis. Update the module docstring's ordering paragraph and the
  docstrings of `_assign_tiers`, `_sort_key` and `_RANKING_TIERS`.
- [x] 67. Mirror and fixture: make the same changes to
  `mockups/findings-projection.mirror.mjs` (row fields, anchors, sort, tiers,
  rank notes); regenerate `frontend/__fixtures__/findings-projection.json`; its
  `--check` and `frontend/findings-projection-mirror.test.js` pass. Regenerate
  the eating-sequence payload (task 61's command): its rows' field layout, order
  and tiers move (measured under the spike at 979,302 bytes); its `--check` and
  the 1,000,000-byte limit pass.
- [x] 68. Frontend Node tests, failing-first on #469's base with task 67's
  fixture laid over it:
  - in `frontend/diagnose-findings-queue.test.js`: on `global`, `queueRows`
    paints each tier word at most once (replacing the pinned caption list of
    the "#302 · weights and captions" test); Highs after meals, Lows after
    meals and the overnight Pattern have rank null, caption null, `urgent`
    false and weight `anchored`, each directly after its anchor, and
    `basal:30-90`, `basal:330-360` and `finding:over_treated_low` take ranks 2,
    3 and 4; with the sift `{ highs }` (hiding `ic:720`), Highs after meals is
    ranked 1 with no tier word, no caption and `urgent` false (ADR 469 decision
    6), and the in-row tier word is not painted on it; painted, an anchored item carries class `qitem anchored` and its
    detail's `.scope-note` reads " · Ranked with its setting", and on
    `afternoon` `finding:over_treated_low`'s reads " · Ranked on all 30 days";
    on `direction_only_windows.global`, the `isf` row opens no seam, its detail
    is `{ kind: 'reason', text: 'No new number is available, so there is
    nothing to stage.' }` and is painted, and the seam opens at
    `pattern:lows_after_correcting_highs`; the "#395 · … interleave" test's
    flavor list is updated to the regenerated order;
  - in `frontend/diagnose-workstation-data.test.js`: the exported
    `isfStageNote` answers the direction-only weaken, the rounded no-op, a held
    strengthen and a stageable row (null) with the correction-factor panel's
    foot-note words; the panel test at `frontend/diagnose-workstation.test.js`
    that prints the weaken's foot note passes unchanged;
  - in `frontend/utilities.test.js`: the Glossary renders a "Findings queue"
    group defining "Next in line", "Worth a look", "Ranked with its setting",
    "Ranked on all 30 days" and "Not recurring often enough to rank yet".
- [x] 69. Frontend (ADR 469 decisions 2, 4 and 5): in
  `frontend/diagnose-findings-queue.js`, `queueRows` marks a row anchored to a
  shown row (weight `anchored`: no numeral, caption or stripe), gives an
  anchored row whose anchor is hidden a rank numeral but no tier word, caption
  or stripe, and leaves it out of the tier and stripe bookkeeping, opens the seam
  only before an unranked row that is not an asserting row the served verdict
  keeps from staging, and gives that row the `isfStageNote` reason detail; the
  painter paints a reason detail on a tail row, gives the anchored item class
  `qitem anchored`, and prints a served `rank_note` after the detail line in
  its `.scope-note`; rewrite the module header's settled-rules paragraph. In
  `frontend/diagnose-workstation-data.js`, export `isfStageNote` beside
  `isfVerdict`, and have `renderIsfLevel` in `frontend/diagnose-workstation.js`
  take its foot note from it. In `frontend/diagnose-workstation.css`, an
  anchored item indents to the title column and draws the causes list's left
  rule, from existing tokens. In `frontend/glossary.js`, add the "Findings
  queue" group.
- [x] 70. In `CONTEXT.md`, the **Priority** entry says a Pattern admitted through
  its setting shares that setting's position, and a new **Ranking tier** entry
  defines `next_in_line`, `worth_a_look` and `noted` as bands of the one
  ranking. In `DESIGN.md`, rule 4 says what "Next in line" and "Worth a look"
  mean and that each prints at most once. Regenerate the design exploration
  (`uv run python mockups/harmonic-v2.exploration/generate.py`): its Glossary
  extract (`glossary.js`, `utilities.json`) and the queue rows its captures
  carry (`setting.json`, `focus.json`, `journey.json`, `workstation.json`, and
  `evidence.json` if its rows move) are rewritten; its `--check` then passes.
- [x] 71. Add one ledger story (the next unissued S id after task 62's, S193 at
  the pinned commit) in a dated `## #469 amendment` section of
  `mockups/harmonic-v2-desktop.behavior.md` carrying Connor's 2026-09-24
  one-ranking decision as its sanction, with its replay function, registry
  entry, case mapping and story-table row in the files task 8 names. Leg 1, on
  the showcase at 24 h: the overnight Pattern's item follows the 03:00–04:00
  basal row with no numeral and no stripe and prints "Ranked with its setting";
  "Worth a look" appears once; `finding:over_treated_low` carries numeral 2; no
  striped row follows an unstriped ranked row. Leg 2, on
  `isf-direction-only-weaken` through `ctx.withCase` at 24 h: the correction
  factor row prints "No new number is available, so there is nothing to
  stage." and no `.tailnote` precedes it. The story fails once, naming each
  failed leg. Lay its harness over #469's base and record that base run, where
  both legs fail, and the branch run at both sizes on its status line. Raise
  the story inventory by this one story in the four places task 9 names.
- [x] 72. Capture before/after renders of the 24 h rail on the showcase and on
  `isf-direction-only-weaken`, and of the Afternoon rail on the showcase, at
  1280x720 and 1440x900, the before from #469's base. The coordinator attaches
  them to the pull request; they are not committed.
