# #457 synthetic evidence

Everything here is synthetic. Every log comes from the desk browser suite, which answers
the built desk's reads from synthetic payloads (shapes written in its own driver and
committed generator-made synthetic fixtures); from the acceptance driver's own tests; or,
for the regression replay, from committed manufactured QA recipes
(`scripts/qa_e2e_cases.py`) and the committed showcase, served by the offline no-fetch app
(`--no-fetch --token ''`). No personal database, operator screenshot or real-data payload
is included. The release coordinator ran every port-bound leg serially;
the ticket worker bound no port. Absolute paths in the logs are replaced with
`<base worktree>`, `<ticket worktree>`, `<release worktree>`, `<scratch>` and `$TMPDIR`.

Change: `desk-press-wait` (OpenSpec; its `.openspec.yaml` sets `skip_specs: true`, so it
carries no spec delta), archived with the release. Ticket branch head at integration:
`f5d2a3d0`, the second parent of the trunk merge `d237f4d5`. It adds only tasks.md's record
of the coordinator's results to `a902a70a`, the last commit a leg ran on.

Stores: this ticket adds no story and owes no render. Its browser evidence is the desk
browser suite and the 35-id press and rail regression replay of existing stories, each
story on a fresh copy of its registered case store: `showcase` (29 stories),
`behavioral-carb-undercount` (S124 and R8), `behavioral-missed-meal` (S125), `basal-lower`
(R5), `ic-lower` (R10) and `c3-trial` (R17). Its selection evidence is the acceptance
driver's `SmokeSelectionTest`, which builds its trees in memory.

## Requirement map

`desk-press-wait` has no specs directory, so it adds, modifies and removes no requirement.
Each row below is instead one decision of the lock's two ADR 457 records in design.md,
named by its heading there, with the tasks.md items that carry it and the tests that pin
it. Decisions 5 to 11 are the second record's amendments; decision 11 supersedes decisions
5 to 10 where they conflict. The ticket adds no story, and no row has a capture.

| Lock acceptance item (no spec delta; ADR 457 decisions in design.md) | Stories | Node and backend tests | Log | Captures |
| --- | --- | --- | --- | --- |
| First record, decision 1: "`press` waits, then acts." (tasks 2.1, 5.1) | — | `frontend/desk.browser.test.mjs` "press waits for a Day return control that renders late, and names an absent or hidden control"; every other test in that file that presses a control | `logs/457-red.log`, `logs/457-green.log`, `logs/457e-green.log`, `logs/457-desk-whole.log`, `logs/457e-desk-whole.log` | none owed |
| First record, decision 2: "`railRowLocator` waits for a settled, painted rail first." (tasks 1.2, 2.2, 5.4) | — (no new story; the 35-id press and rail regression replay re-runs existing stories whose code reaches the resolver) | `frontend/c4.replay.test.js` "railRowLocator waits for a settled Findings rail before it reads the row shape"; `frontend/desk.browser.test.mjs` "v2 High-carb response missing preserves the existing recovery boundary" (and the malformed, inconsistent, stale-recover and stale-error defects), which resolve their row through `assertHighCarbFailure` | `logs/457-rail-1280x720.log`, `logs/457e-rail-1280x720.log`, the two `desk-whole` logs; no coordinator-run log holds the node test | none owed |
| First record, decision 3: "One resolver." (task 2.3) | — | `frontend/desk.browser.test.mjs` "v2 Diagnose renders the generated High-carb response and its selected trace", "v2 High-carb scoped population, roster selections and fullscreen retain public evidence", "v2 High-carb rendered empty keeps producer curves and support" (and the in_sequence, limited and null_period renders) | `logs/457-desk-whole.log`, `logs/457e-desk-whole.log` | none owed |
| First record, decision 4: "Day arrival reads wait for Day." (task 2.4) | — | `frontend/desk.browser.test.mjs` "Day owns its chronology, its week ribbon, its month and the Episode Log", "a canonical Day address reloads through the built shell and returns through its canonical Diagnose door", "a utility takes the reading pane's seat, marks its launcher, and gives focus back on Close", "repeated entry and exit leaves no duplicate chart, pane or utility behind" | `logs/457-rep2-1.log` to `logs/457-rep2-10.log`, the two `desk-whole` logs | none owed |
| First record, decision 5: "Proof holds the read instead of repeating the race." (tasks 1.1, 1.4, 5.1, 5.2) | — | `frontend/desk.browser.test.mjs` "press waits for a Day return control that renders late, and names an absent or hidden control" (red on its own commit), with "a key pressed on Day leaves the parked Diagnose as it was, and the Day return keeps it with no guidance re-read" as the repeated confirmation | `logs/457-red.log`, `logs/457-green.log`, `logs/457e-green.log`, `logs/457-rep1-1.log` to `logs/457-rep1-10.log`, `logs/457e-rep1-1.log` to `logs/457e-rep1-10.log` | none owed |
| Second record, decision 1: "The graph follows the replay's static imports, and stops on any form it cannot map." (tasks 1.3, 3.1) | — | `mockups/sweep/harmonic-v2-desktop/acceptance.test.py` `SmokeSelectionTest.test_an_import_of_an_untracked_file_stops_the_plan`, `SmokeSelectionTest.test_a_dynamic_import_in_an_imported_module_stops_the_plan`, `SmokeSelectionTest.test_an_import_form_the_graph_cannot_follow_stops_the_plan`, `SmokeSelectionTest.test_a_dependency_without_a_node_stops_the_plan` | `logs/457-acceptance-test.log` to `logs/457h-acceptance-test.log.gz` | none owed |
| Second record, decision 2: "Executables named by path select the complete ledger." (tasks 1.3, 3.1) | — | `SmokeSelectionTest.test_an_executable_the_replay_names_by_path_selects_every_story`, `SmokeSelectionTest.test_a_data_fixture_the_replay_names_by_path_selects_only_the_fixed_slice` | the acceptance-test logs | none owed |
| Second record, decision 3: "Everything else stays." (tasks 3.1, 4.3) | — | `SmokeSelectionTest.test_unchanged_diff_is_exactly_fixed_smoke`, `SmokeSelectionTest.test_fixed_slice_is_pinned_and_covers_every_real_replay_case`, `SmokeSelectionTest.test_changed_recipe_selects_its_consumers`, `SmokeSelectionTest.test_changed_recipe_helper_selects_transitive_case_consumers` (all four also exist at base) | the acceptance-test logs | none owed |
| Second record, decision 4: "The spike is the reference." (task 3.1) | — | none; `docs/scope/457-replay-selection.spike.py` is a worker-run script with no coordinator-run log | — | none owed |
| Amendment decision 5: "Top-level statements depend on the names they mention (F1)." (task 3.4) | — | `SmokeSelectionTest.test_a_helper_that_wraps_every_story_at_top_level_selects_every_wrapped_story`, `SmokeSelectionTest.test_a_helper_reached_through_a_top_level_destructure_selects_its_callers` | the acceptance-test logs | none owed |
| Amendment decision 6: "A namespace import stops the plan (F2)." (task 3.4) | — | `SmokeSelectionTest.test_an_import_form_the_graph_cannot_follow_stops_the_plan` (its namespace-import case) | the acceptance-test logs | none owed |
| Amendment decision 7: "Every literal path form is read (F3)." (task 3.4) | — | `SmokeSelectionTest.test_every_literal_path_form_to_an_executable_selects_every_story`, `SmokeSelectionTest.test_a_literal_path_the_selection_cannot_resolve_stops_the_plan` | the acceptance-test logs | none owed |
| Amendment decision 8: "`smoke.json` records both commits' modules (F4)." (task 3.4) | — | `SmokeSelectionTest.test_a_deleted_helper_module_is_recorded_and_selects_its_former_callers` | the acceptance-test logs | none owed |
| Amendment decision 9: "A changed key that no story carries selects the complete ledger (N1)." with its replay-side, not product-side ruling (task 3.5) | — | `SmokeSelectionTest.test_a_changed_key_no_single_story_owns_selects_the_complete_ledger`, `SmokeSelectionTest.test_a_story_table_change_beyond_its_entries_selects_the_complete_ledger`, `SmokeSelectionTest.test_a_product_function_no_story_calls_leaves_the_fixed_slice`, `SmokeSelectionTest.test_a_product_function_a_story_calls_selects_that_story`, `SmokeSelectionTest.test_an_app_entry_that_cannot_be_read_stops_the_plan` | the acceptance-test logs | none owed |
| Amendment decision 10: "The per-story runner is a root of every story (R3-1)." (task 3.6) | — | `SmokeSelectionTest.test_a_change_the_per_story_runner_reaches_selects_every_story`, `SmokeSelectionTest.test_a_product_function_the_runner_calls_selects_every_story` | the acceptance-test logs | none owed |
| Amendment decision 11: "A replay-side change plans the complete ledger unless it is confined to clean story entries." (task 3.7, with every follow-up ruling) | — | `SmokeSelectionTest.test_replay_code_outside_a_story_table_plans_the_complete_ledger`, `SmokeSelectionTest.test_an_imported_helper_edit_plans_the_complete_ledger`, `SmokeSelectionTest.test_a_rail_row_helper_edit_plans_the_complete_ledger`, `SmokeSelectionTest.test_an_import_line_edit_plans_the_complete_ledger`, `SmokeSelectionTest.test_an_edit_to_a_node_or_package_import_plans_the_complete_ledger`, `SmokeSelectionTest.test_replay_shapes_that_reach_other_stories_plan_the_complete_ledger`, `SmokeSelectionTest.test_a_registry_row_that_runs_another_story_plans_the_complete_ledger`, `SmokeSelectionTest.test_a_story_entry_passing_module_state_to_an_unknown_callee_plans_the_complete_ledger`, `SmokeSelectionTest.test_a_story_entry_changing_an_imported_story_table`, `SmokeSelectionTest.test_story_entries_that_write_no_module_state_select_precisely`, `SmokeSelectionTest.test_a_story_table_entry_edit_selects_that_story_alone`, `SmokeSelectionTest.test_a_clean_story_table_entry_edit_selects_that_story_alone`, `SmokeSelectionTest.test_eval_or_the_function_constructor_stops_the_plan` | the acceptance-test logs; the final code's run is `logs/457h-acceptance-test.log.gz` | none owed |
| Task 3.2: ACCEPTANCE.md's pull-request selection paragraph states the new rule | — | none; no test reads that paragraph | — | none owed |

The acceptance-test logs print one dot per test and a closing `Ran N tests` line, not test
names, so they show the whole file passing, not each method by name.

## Recorded results

Coordinator-run, 2026-09-24:

- **Red proof on `ce03aacd`** (base `b03431d2` plus the ticket's plan documents and its new
  tests, before any helper or selection change, checked out in the base-proof worktree):
  `node --test --test-name-pattern 'press waits for a Day return control'` on
  `frontend/desk.browser.test.mjs` reports `ℹ tests 1`, `ℹ pass 0`, `ℹ fail 1`, with "✖
  press waits for a Day return control that renders late, and names an absent or hidden
  control" failing at "AssertionError [ERR_ASSERTION]: no control matched
  [data-day="return"]" (`logs/457-red.log`).
- **Branch `3a338d51`:**
  - the same named test reports `ℹ tests 1`, `ℹ pass 1`, with its ✔ line
    (`logs/457-green.log`);
  - ten consecutive runs of `--test-name-pattern 'a key pressed on Day leaves the parked
    Diagnose'` each report tests 1, pass 1, fail 0, with "✔ a key pressed on Day leaves the
    parked Diagnose as it was, and the Day return keeps it with no guidance re-read"
    (`logs/457-rep1-1.log` to `logs/457-rep1-10.log`);
  - ten consecutive runs of the seven-test Day group each report tests 7, pass 7, fail 0,
    with one ✔ line for each of the seven tests (`logs/457-rep2-1.log` to
    `logs/457-rep2-10.log`);
  - the whole desk browser suite reports `ℹ tests 44`, `ℹ pass 44`, `ℹ fail 0`
    (`logs/457-desk-whole.log`);
  - the press and rail regression replay, `ONLY=S12,S21,S22,S23,S24,S25,S26,S27,S29,S61,
    S62,S82,S133,S136,S137,S124,S125,R1,R2,R3,R4,R5,R6,R7,R8,R9,R10,R11,R12,R13,R14,R15,R16,
    R17,R19` at 1280x720, prints a PASS line for each id and
    `# executed 35 · failed 0 · deferred 0 · selected 35 · chromium launches 1`
    (`logs/457-rail-1280x720.log`);
  - the full `acceptance.test.py` ends "Ran 48 tests in 11.403s" and "OK"
    (`logs/457-acceptance-test.log`).

  The coordinator log records "red ce03aacd FAIL 'no control matched [data-day="return"]';
  green 1/1; 10x test25 named; 10x 7-group named 7/7; desk 44/44; rail 35/35 @1280;
  acceptance.test OK".
- **Full `acceptance.test.py` on `36054249` (superseded):** after the first code review's
  selection findings F1 to F4 were folded in, "Ran 53 tests in 19.723s", "OK"
  (`logs/457b-acceptance-test.log`). The coordinator log records "457 acceptance.test full
  OK on 36054249".
- **Full `acceptance.test.py` on `b8c94dd6` (superseded):** "Ran 61 tests in 51.476s", "OK"
  (`logs/457c-acceptance-test.log.gz`). The coordinator log records "457c acceptance OK
  (b8c94dd6)".
- **Full `acceptance.test.py` on `492924c6` (superseded):** "Ran 62 tests in 51.178s", "OK"
  (`logs/457d-acceptance-test.log.gz`). The coordinator log records "457d acceptance OK
  (492924c6; now being reworked)".
- **Branch `411dcb3e`:** the named held-read test passes, tests 1, pass 1
  (`logs/457e-green.log`); ten runs of "a key pressed on Day leaves the parked Diagnose…"
  each pass 1 of 1 (`logs/457e-rep1-1.log` to `logs/457e-rep1-10.log`); the whole desk suite
  passes 44 of 44 (`logs/457e-desk-whole.log`); the same 35-id replay at 1280x720 prints
  `# executed 35 · failed 0 · deferred 0 · selected 35 · chromium launches 1`
  (`logs/457e-rail-1280x720.log`); and the full `acceptance.test.py` ends "Ran 66 tests in
  82.199s", "OK" (`logs/457e-acceptance-test.log.gz`). The seven-test group was not re-run
  on this commit. The coordinator log records "Legs 457e on 411dcb3e green (desk 44/44,
  rail 35/35, rep 10/10, acceptance OK)", notes that the helper code was unchanged by the
  selection work, and later that only the acceptance driver and its documents changed after
  `411dcb3e` ("legs stand"). `git diff` agrees: no `frontend/` file changes from `3a338d51`
  through `a902a70a`, so both sets of browser legs ran the final helper code.
- **Full `acceptance.test.py` on `df83aa31` (superseded):** "Ran 67 tests in 108.152s",
  "OK" (`logs/457f-acceptance-test.log.gz`). The coordinator log names this run but records
  no result line for it; the raw log ends OK.
- **Full `acceptance.test.py` on `289c3039` (superseded):** "Ran 68 tests in 106.225s",
  "OK" (`logs/457g-acceptance-test.log.gz`). The coordinator log names this run but records
  no result line for it; the raw log ends OK.
- **Full `acceptance.test.py` on `a902a70a`, the final code:** "Ran 69 tests in
  109.968s", "OK" (`logs/457h-acceptance-test.log.gz`). The coordinator log records
  "acceptance.test OK a902a70a" after the final verification came back clean.
- **Release trunk:** `TRUNK d237f4d5 #457 merged clean (no conflicts); glue adcdb5bc:
  no-story product test re-anchored deliverableHasChanges(deleted by #453)->isStageableIsf +
  design.md line.` In words: the merge had no conflicts, and one glue commit moved the
  selection test for a product function no story calls from `deliverableHasChanges`, which
  #453 deleted, to `isStageableIsf`, with the matching design.md line. The coordinator's
  second glue review covered this merge; its one finding concerned S169, which is not this
  ticket's. No trunk line in the coordinator log names a desk-suite run or a full
  `acceptance.test.py` run after this merge.
- The complete ledger at both sizes, the whole backend pytest and the full
  `acceptance.test.py` run once on the commit that is pushed; the pull request records the
  result.

## Renders

None is owed: the render manifest's "What is owed but not produced" records that #457
changes a browser-suite helper, and that it changes no rendered surface.

## Logs

Each leg's commit is the one its coordinator run transcript printed first (`prep <tree>
<oid>`, and `prep base-b03431d2 b03431d2` after the `overlay:` lines for a base leg); those
transcripts are not kept in this folder.

The six acceptance-test logs `457c` to `457h` are kept gzip-compressed, after path
normalization. Each is over 1 MB because the acceptance test echoes its inline analysis
script on every call it makes, from about 300 calls in `457c` to about 1,200 in `457h`.

| File | Leg | Commit |
| --- | --- | --- |
| `logs/457-red.log` | red proof: `desk.browser.test.mjs` named "press waits for a Day return control", in the base-proof worktree checked out at the red commit | `ce03aacd` |
| `logs/457-green.log` | the same named test on the branch | `3a338d51` |
| `logs/457-rep1-1.log` | repeat 1 of 10: named "a key pressed on Day leaves the parked Diagnose" | `3a338d51` |
| `logs/457-rep1-2.log` | repeat 2 of 10: named "a key pressed on Day leaves the parked Diagnose" | `3a338d51` |
| `logs/457-rep1-3.log` | repeat 3 of 10: named "a key pressed on Day leaves the parked Diagnose" | `3a338d51` |
| `logs/457-rep1-4.log` | repeat 4 of 10: named "a key pressed on Day leaves the parked Diagnose" | `3a338d51` |
| `logs/457-rep1-5.log` | repeat 5 of 10: named "a key pressed on Day leaves the parked Diagnose" | `3a338d51` |
| `logs/457-rep1-6.log` | repeat 6 of 10: named "a key pressed on Day leaves the parked Diagnose" | `3a338d51` |
| `logs/457-rep1-7.log` | repeat 7 of 10: named "a key pressed on Day leaves the parked Diagnose" | `3a338d51` |
| `logs/457-rep1-8.log` | repeat 8 of 10: named "a key pressed on Day leaves the parked Diagnose" | `3a338d51` |
| `logs/457-rep1-9.log` | repeat 9 of 10: named "a key pressed on Day leaves the parked Diagnose" | `3a338d51` |
| `logs/457-rep1-10.log` | repeat 10 of 10: named "a key pressed on Day leaves the parked Diagnose" | `3a338d51` |
| `logs/457-rep2-1.log` | repeat 1 of 10: the seven-test Day group | `3a338d51` |
| `logs/457-rep2-2.log` | repeat 2 of 10: the seven-test Day group | `3a338d51` |
| `logs/457-rep2-3.log` | repeat 3 of 10: the seven-test Day group | `3a338d51` |
| `logs/457-rep2-4.log` | repeat 4 of 10: the seven-test Day group | `3a338d51` |
| `logs/457-rep2-5.log` | repeat 5 of 10: the seven-test Day group | `3a338d51` |
| `logs/457-rep2-6.log` | repeat 6 of 10: the seven-test Day group | `3a338d51` |
| `logs/457-rep2-7.log` | repeat 7 of 10: the seven-test Day group | `3a338d51` |
| `logs/457-rep2-8.log` | repeat 8 of 10: the seven-test Day group | `3a338d51` |
| `logs/457-rep2-9.log` | repeat 9 of 10: the seven-test Day group | `3a338d51` |
| `logs/457-rep2-10.log` | repeat 10 of 10: the seven-test Day group | `3a338d51` |
| `logs/457-desk-whole.log` | the whole desk browser suite | `3a338d51` |
| `logs/457-rail-1280x720.log` | press and rail regression replay, 35 ids, at 1280x720 | `3a338d51` |
| `logs/457-acceptance-test.log` | full `acceptance.test.py` (binds a port) | `3a338d51` |
| `logs/457b-acceptance-test.log` | full `acceptance.test.py`, after the round 1 selection fixes (superseded) | `36054249` |
| `logs/457c-acceptance-test.log.gz` | full `acceptance.test.py` (superseded); gzip-compressed | `b8c94dd6` |
| `logs/457d-acceptance-test.log.gz` | full `acceptance.test.py` (superseded); gzip-compressed | `492924c6` |
| `logs/457e-green.log` | named "press waits for a Day return control" | `411dcb3e` |
| `logs/457e-rep1-1.log` | repeat 1 of 10: named "a key pressed on Day leaves the parked Diagnose" | `411dcb3e` |
| `logs/457e-rep1-2.log` | repeat 2 of 10: named "a key pressed on Day leaves the parked Diagnose" | `411dcb3e` |
| `logs/457e-rep1-3.log` | repeat 3 of 10: named "a key pressed on Day leaves the parked Diagnose" | `411dcb3e` |
| `logs/457e-rep1-4.log` | repeat 4 of 10: named "a key pressed on Day leaves the parked Diagnose" | `411dcb3e` |
| `logs/457e-rep1-5.log` | repeat 5 of 10: named "a key pressed on Day leaves the parked Diagnose" | `411dcb3e` |
| `logs/457e-rep1-6.log` | repeat 6 of 10: named "a key pressed on Day leaves the parked Diagnose" | `411dcb3e` |
| `logs/457e-rep1-7.log` | repeat 7 of 10: named "a key pressed on Day leaves the parked Diagnose" | `411dcb3e` |
| `logs/457e-rep1-8.log` | repeat 8 of 10: named "a key pressed on Day leaves the parked Diagnose" | `411dcb3e` |
| `logs/457e-rep1-9.log` | repeat 9 of 10: named "a key pressed on Day leaves the parked Diagnose" | `411dcb3e` |
| `logs/457e-rep1-10.log` | repeat 10 of 10: named "a key pressed on Day leaves the parked Diagnose" | `411dcb3e` |
| `logs/457e-desk-whole.log` | the whole desk browser suite | `411dcb3e` |
| `logs/457e-rail-1280x720.log` | press and rail regression replay, 35 ids, at 1280x720 | `411dcb3e` |
| `logs/457e-acceptance-test.log.gz` | full `acceptance.test.py` (superseded); gzip-compressed | `411dcb3e` |
| `logs/457f-acceptance-test.log.gz` | full `acceptance.test.py` (superseded); gzip-compressed | `df83aa31` |
| `logs/457g-acceptance-test.log.gz` | full `acceptance.test.py` (superseded); gzip-compressed | `289c3039` |
| `logs/457h-acceptance-test.log.gz` | full `acceptance.test.py`, the final code; gzip-compressed | `a902a70a` |
