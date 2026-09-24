# #454 synthetic evidence

Everything here is synthetic. Every capture and log comes from committed manufactured QA
recipes (`scripts/qa_e2e_cases.py`) or the committed showcase, served by the offline
no-fetch app (`--no-fetch --token ''`). No personal database, operator screenshot or
real-data payload is included. The release coordinator ran every port-bound leg serially;
the ticket worker bound no port. Absolute paths in the logs are replaced with
`<base worktree>`, `<ticket worktree>`, `<release worktree>`, `<scratch>` and `$TMPDIR`.

Change: `fixture-meal-shapes` (OpenSpec), archived with the release. Ticket branch head at
integration: `8e732bd7`, the branch side of trunk merge `496aacd3`. The last leg ran on
`25f5738c`. `8e732bd7` changes one node test's title (`frontend/diagnose-findings-queue.test.js`)
and the change's own `design.md` and `tasks.md` prose, which the coordinator log records as
"2 prose fixes + close-out".

Stores: `showcase` serves S25 and S149 (the Meal bolus short case file's matched meal);
`pattern-near-tie` serves S150, S182 and render 454-A1 (the Highs after meals Pattern case
file, three meals each claimed by Carb undercount); the follow-up suite ran on its own stores
(`c3-trial`, `c3-history`, `c3-focus`, `c3-pin`, `c3-preempted`, `c4-ic`, `c4-isf`,
`c4-missing`, `c4-profile`) as regression coverage. The desk suite and the node tests read the
committed browser-gate fixtures (the workstation payload, the case-file capture, the
event-comparison capture and the findings-projection fixture), not case stores.

## Requirement map

| Requirement (capability spec, ADDED/MODIFIED) | Stories | Node and backend tests | Log | Captures |
| --- | --- | --- | --- | --- |
| A selected Occurrence reads as its facts and served reason (surfaces, MODIFIED) | S25, S149, S150, S182 | `frontend/c4.replay.test.js` "S182 is a unique app-only #454 story on pattern-near-tie", "S182 passes when the claimant sentence prints once, on the cause line", "S182 reaches its feature assertion when a habit line repeats the cause sentence, never a premise", "S182 separates a setup error from the feature", "S149/S150 selected facts pass on the served detail and its rendered block"; `frontend/diagnose-workstation.test.js` "#432 · a selected claimed meal reads as its facts, cause and habit sentence", "#432 · a selected Pattern Occurrence lists each served habit with its band label" | `logs/454a-branch-1280x720.log`, `logs/454a-branch-1440x900.log`, `logs/454a-base-1280x720.log`, `logs/454a-base-1440x900.log`, `logs/454b-branch-1280x720.log`, `logs/454b-branch-1440x900.log` | `renders/before/454-A1-*.png`, `renders/after/454-A1-*.png` |
| A selected case-file Occurrence serves why it was judged (behavioral-layer, MODIFIED) | S25, S149, S150, S182 | `tests/test_finding_case_file.py` `test_every_selected_reason_agrees_with_its_row`, `test_meal_claimed_by_meal_bolus_short_inside_highs_after_meals`, `test_a_pattern_cause_carries_only_its_claimants_own_narrative` (module-level pytest functions); `frontend/diagnose-event-comparison.test.js` "#454 · a claimed Pattern Occurrence serves its claimant sentence once, as its cause" | `logs/454a-branch-*.log`, `logs/454a-base-*.log`, `logs/454b-branch-*.log` | `renders/before/454-A1-*.png`, `renders/after/454-A1-*.png` |
| A Pattern case file judges only the habit members in its rate family (behavioral-layer, ADDED) | — | `frontend/browser-fixture-population.test.js` "#454 · the Pattern mirror judges only its rate family, as the Python producer answers"; the frozen family table's drift checks, `scripts/gen_findings_projection_fixtures.py --check` and `node mockups/diagnose-event-comparison.synthetic/generate.mjs --check` | — | — |
| Manufactured browser-gate rows carry only shapes their producer can serve (behavioral-layer, ADDED) | — | `tests/test_synthetic_fixture_shapes.py` `ManufacturedExposureRowsTest.test_every_row_serves_its_familys_anchor_kind_and_label`, `ManufacturedExposureRowsTest.test_every_row_judges_exactly_its_anchor_kinds_classifiers`, `ManufacturedExposureRowsTest.test_every_classifier_and_silence_reason_is_in_its_closed_set`, `ManufacturedExposureRowsTest.test_a_claimed_row_reads_its_own_levers_matched_sentence_as_its_text`, `ManufacturedExposureRowsTest.test_an_unclaimed_row_matches_nothing_and_tells_no_cause`, `ManufacturedExposureRowsTest.test_a_high_reaches_the_high_anchor_threshold`, `ComparisonRowsTest.test_every_comparison_row_judges_only_its_anchor_kinds_classifiers`; `frontend/diagnose-workstation.test.js` "#432 · a selected Pattern Occurrence lists each served habit with its band label" (the claimed meal's cause is Late bolus); `frontend/browser-fixture-population.test.js` "the Afternoon fixture retains all four published behavioral Findings", "browser preparation mirrors the wrapped row…" | — | — |
| The browser-gate findings mirror serves the server's scoped Pattern list or fails (behavioral-layer, ADDED) | — | `frontend/browser-fixture-population.test.js` "#454 · the test desk serves the server's own answer, in its order, in each browser window" (scoped rows and each scoped Pattern header), "#454 · a narrowed window or Pattern case the server never answered fails by name"; `frontend/desk.browser.test.mjs` "after a Day return, acting inside Diagnose re-addresses it in place…" (the desk suite's one scoped window) | `logs/454b-desk-whole.log` | — |
| The browser-gate test desk projects the server's own inputs (behavioral-layer, ADDED) | — | `frontend/browser-fixture-population.test.js` "#454 · the test desk serves the server's own answer, in its order, in each browser window"; `frontend/diagnose-findings-queue.test.js` "#413 · an unpriced claimed member folds under the Pattern, printing every served sentence", "#395 · the browser input publishes only its renderable mini hosts in served order"; `tests/test_findings_projection.py` `PatternProjectionTest.test_memberless_patterns_keep_their_count_without_a_chart` | `logs/454b-desk-whole.log` | — |

The change has no REMOVED requirement. The four ADDED requirements govern the browser-gate
fixtures and their mirrors, so no ledger story pins them; the node and backend tests and the
drift checks do.

## Recorded results

Coordinator-run, 2026-09-23 and 2026-09-24:

- **S25, S149, S150 and S182 on branch `b847be7e` (sub-order 1):** all four passed at 1280x720
  and at 1440x900, each `# executed 4 · failed 0 · deferred 0 · selected 4`
  (`logs/454a-branch-1280x720.log`, `logs/454a-branch-1440x900.log`). The
  coordinator log records "branch 4/4 both sizes" and the branch inventory as 172/153/19.
- **S182 on base `b03431d2` with the branch harness laid over it:** the overlaid files are
  `frontend/c4.replay.mjs`, `frontend/c4.replay.test.js`, `frontend/desk-behavior.replay.mjs`,
  `frontend/replay-cases.mjs`, `mockups/sweep/harmonic-v2-desktop/acceptance.py` and
  `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`. S182 fails at both sizes at its
  feature assertion. The `FAIL` line opens
  `FAIL S182 — Timed out after 30000 ms: S182 a claimed Occurrence prints its sentence once; saw [`
  and, after the observed rows, ends
  `S182 the cause's sentence must print once; it repeats on: Carb undercount · Meets criteria · ran away to 238 mg/dL despite the bolus — the excursion implies ~152 g vs 52 g logged (2.9x), a likely carb undercount`
  (`logs/454a-base-1280x720.log`, `logs/454a-base-1440x900.log`). Each size then prints
  `# executed 0 · failed 1 · deferred 0 · selected 1 · chromium launches 1` and
  `FATAL: zero stories executed — a run that asserts nothing is a failure, not a pass`. The
  runner counts the failed story as not executed, which is why it prints the zero-executed line.
  The failure itself is the feature assertion, with the selected Occurrence's rows observed. The
  coordinator log records "base S182 FAIL right reason", and its base facts record "S182
  (454a-base) FAIL at feature assertions at BOTH sizes".
- **Sub-orders 2 to 4 (no legs):** the coordinator log records `c4f41861` "rows real-shaped;
  dose set unchanged", then `632c6076` with the step-2 fixes `2d8d1895` "Dose baseline
  unchanged", then step 4 (`35511b89`) reviewed clean. It also records that the posted lock
  header's line saying step 4 re-records the baseline is superseded ("none changed").
- **Dose/ratio baseline:** the coordinator log records sub-order 5 at `091d8146` as "baseline
  239 re-recorded, 12 synthetic entries — whole-diff reviewer to verify", and the whole-diff
  review on `25f5738c` as clean. That whole-diff Full review (the coordinator log's "454
  whole-diff Full CLEAN") is the review the TODO line "review 454's dose/ratio baseline
  additions" asked for. It verified all 12 new baseline entries as fixed-seed synthetic
  generator output inside a stamped fixture: the headlines of the fixed-seed workstation
  payload's setting rows (basal delivered rates 0.61–1.13 U/h, a 4.9 g/U carb ratio, a
  1 U : 42 mg/dL correction factor), which the change's tasks.md records.
- **Branch `25f5738c`:** S25, S149, S150 and S182 passed at 1280x720 and at 1440x900, each
  `# executed 4 · failed 0 · deferred 0 · selected 4` (`logs/454b-branch-1280x720.log`,
  `logs/454b-branch-1440x900.log`). The whole desk suite printed
  `ℹ tests 43 ℹ pass 43 ℹ fail 0` (`logs/454b-desk-whole.log`). The whole follow-up suite
  printed `ℹ tests 2 ℹ pass 2 ℹ fail 0`, with
  `✔ Trial and Pattern Focus journeys at 1280x720 (229683.905416ms)` and
  `✔ Trial and Pattern Focus journeys at 1440x900 (254798.783583ms)`, each size's replay
  `# executed 25 · failed 0 · deferred 0 · selected 25` (`logs/454b-followup.log`). The full
  `acceptance.test.py` printed `Ran 41 tests in 4.017s` and `OK`
  (`logs/454b-acceptance-test.log`). The
  coordinator log records "S25/S149/S150/S182 4/4 both sizes; desk 43/43; follow-up 2/2 ✔ both
  sizes; acceptance.test OK".
- **Release trunk:** `TRUNK 496aacd3 #454 merged (190/171/19; union glue; findings-projection +
  exploration regen; drift 12/12; fast 1136; port-free OK; pytest targeted 193)`. The trunk leg
  on `25392ade`, after the #451 merge, re-ran this ticket's stories:
  `S25,S46,S73,S139,S140,S169,S170,S157,S180,S149,S150,S182,S177,S178,S179 15/15 both sizes`.
  That leg's logs belong to the trunk and are not in this folder. Final trunk:
  `TRUNK 9882bcfe emdash merged clean (drift 12/12 no regen; fast 1153; port-free OK; openspec
  90)`.
- The complete ledger at both sizes, the whole backend pytest (task 5.5, deferred to the trunk)
  and the full `acceptance.test.py` run once on the commit that is pushed; the pull request
  records the result.

## Renders

- **Before**: base `b03431d2` (origin/main before the release).
- **After**: the release trunk `dd5a93bb`, served with a desk shell built fresh from that
  commit (`npm ci && npm run build`) before the after batch.
- **Owed by**: the charter. No lock names a render, but R454 is a shipped-desk revision (a
  claimed Pattern row prints each fact once, S182), so ui-craft's revise lifecycle owes one
  before/after of that state.
- **How**: both trees were served with AGENTS.md's QA copy-then-serve command
  (`uv run harmonic serve --no-fetch --token '' --db <scratch copy> --port 8791`) over a named
  case store emitted by that tree's own `scripts/gen_qa_e2e_db.py --case pattern-near-tie`,
  followed by the replay case server's `reconcile_ingested_follow_up` step. Chromium used the
  dark scheme, the desk's only theme. The same interaction path produced each before and after.
- **Files**: each `.png` is the render; each `.txt` beside it holds the page's visible text,
  the address, the focused element and the capture note.

| Shot | Size | State | Store | Route | Before | After |
|---|---|---|---|---|---|---|
| 454-A1 | 1280x720 | Highs after meals: a claimed Occurrence selected, its sentence printed once | `pattern-near-tie` | Diagnose 24 h → All charts → Highs after meals tile → first `[data-comparison-cohort="matched"]` Occurrence; scroll the reading pane to its end | [png](renders/before/454-A1-1280x720.png) · [txt](renders/before/454-A1-1280x720.txt) | [png](renders/after/454-A1-1280x720.png) · [txt](renders/after/454-A1-1280x720.txt) |
| 454-A1 | 1440x900 | Highs after meals: a claimed Occurrence selected, its sentence printed once | `pattern-near-tie` | Diagnose 24 h → All charts → Highs after meals tile → first `[data-comparison-cohort="matched"]` Occurrence; scroll the reading pane to its end | [png](renders/before/454-A1-1440x900.png) · [txt](renders/before/454-A1-1440x900.txt) | [png](renders/after/454-A1-1440x900.png) · [txt](renders/after/454-A1-1440x900.txt) |

### What the pair shows

Both captures show the Highs after meals Pattern case file at 24 h under All charts, reading
"3 of 3 meal responses in 24 h · 0 not attributed", with its first matched Occurrence
(May 24 · 19:00, "52 g · 7.4 U · peak 238") selected and focused. Both facts lists print
"Peak 238 mg/dL, 40 min after the bolus" and a cause line beginning "Attributed to Carb
undercount ·". Before, the habit line repeats the cause's sentence after its band label:
"Carb undercount · Meets criteria · ran away to 238 mg/dL despite the bolus — the excursion
implies ~152 g vs 52 g logged (2.9x), a likely carb undercount". After, the habit line reads
"Carb undercount · Meets criteria" only, so the sentence prints once, on the cause line. The
after cause sentence reads "despite the bolus; the excursion" where the before reads "despite
the bolus — the excursion". That wording comes from the release's em-dash sweep (the Carb
undercount classifier's sentence changed between trunk `25392ade` and `9882bcfe`), not from
#454. Every other line of the two captures is the same, and within each tree the 1280x720 and
1440x900 text differs only in its header line.

## Logs

Each leg's commit is the one its coordinator run transcript printed first (`prep <tree>
<oid>`, and `prep base-b03431d2 b03431d2` after the `overlay:` lines for a base leg); those
transcripts are not kept in this folder.

| File | Leg | Commit |
| --- | --- | --- |
| `logs/454a-branch-1280x720.log` | branch replay `ONLY=S25,S149,S150,S182` at 1280x720 | `b847be7e` |
| `logs/454a-branch-1440x900.log` | branch replay `ONLY=S25,S149,S150,S182` at 1440x900 | `b847be7e` |
| `logs/454a-base-1280x720.log` | base replay `ONLY=S182` at 1280x720, branch harness from `b847be7e` laid over base | `b03431d2` |
| `logs/454a-base-1440x900.log` | base replay `ONLY=S182` at 1440x900, branch harness from `b847be7e` laid over base | `b03431d2` |
| `logs/454b-branch-1280x720.log` | branch replay `ONLY=S25,S149,S150,S182` at 1280x720 | `25f5738c` |
| `logs/454b-branch-1440x900.log` | branch replay `ONLY=S25,S149,S150,S182` at 1440x900 | `25f5738c` |
| `logs/454b-desk-whole.log` | desk suite `frontend/desk.browser.test.mjs`, whole | `25f5738c` |
| `logs/454b-followup.log` | follow-up suite `frontend/follow-up.browser.test.mjs`, whole, both sizes | `25f5738c` |
| `logs/454b-acceptance-test.log` | full `mockups/sweep/harmonic-v2-desktop/acceptance.test.py` | `25f5738c` |
