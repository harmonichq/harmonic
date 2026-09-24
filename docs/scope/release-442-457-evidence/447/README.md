# #447 synthetic evidence

Everything here is synthetic. Every capture and log comes from committed manufactured QA
recipes (`scripts/qa_e2e_cases.py`) or the committed showcase, served by the offline
no-fetch app (`--no-fetch --token ''`). No personal database, operator screenshot or
real-data payload is included. The release coordinator ran every port-bound leg serially;
the ticket worker bound no port. Absolute paths in the logs are replaced with
`<base worktree>`, `<ticket worktree>`, `<release worktree>`, `<scratch>` and `$TMPDIR`.

Change: `retire-verify-language` (OpenSpec), archived with the release. Ticket branch head
at integration: `7947a75e`, the second parent of the trunk merge `c6697ef5`. The last leg
commit is `e662c080`. The two commits after it (`2de52828`, `7947a75e`) change records,
one backend test, one docstring and one comment; the coordinator log records "Legs from
e662c080 stand (doc/test-only delta)".

Stores: `c3-trial` serves the watched basal 03:00 Trial (complete, 15 of 14 days, target
metric `tbr`) for S169, S46 and S139 and for renders 447-A1, 447-B1 and 447-B2; `c3-focus`
serves the watched Focus for S140; the committed `showcase` serves the Guide's "Reading the
Diagnose surface" article for S170 and S73 and for renders 447-C1 and 447-C2. The trunk
leg's other nine stories (S25, S149, S150, S157, S177, S178, S179, S180, S182) belong to
other tickets and ran on `showcase`, `c4-ic`, `c4-isf`, `pattern-near-tie` and
`isf-strengthen`.

## Requirement map

| Requirement (<capability> spec, ADDED/MODIFIED/REMOVED) | Stories | Node and backend tests | Log | Captures |
| --- | --- | --- | --- | --- |
| Changes follows a watched Trial or Focus through (surfaces, ADDED) | S169 (outcome table lead), S139, S140 | `frontend/follow-up.test.js` "#447 · a Trial's served target metric leads its outcome table, marked as its target", "#447 · a carb-ratio Trial's arc target leads with the arc's peak and nadir rows", "#447 · a Trial with no served target keeps the served order and marks nothing"; `frontend/c4.replay.test.js` "S169 fails at the outcomes lead, not at a premise, when Changes keeps TIR first"; `tests/test_arc_rows_mirror.py` `ArcRowsMirrorTest.test_frontend_arc_rows_are_the_rows_the_server_maps_for_arc` | `logs/447c-branch-1280x720.log`, `logs/447c-branch-1440x900.log`, `logs/trunkA-1280x720.log`, `logs/trunkA-1440x900.log`; S139 and S140 also in `logs/447b-branch-*.log` | `renders/after/447-B2-*.png` |
| The watch dock and Changes print one Trial day count (surfaces, ADDED) | S169 (dock and Watch maturity), S46 | `frontend/watched-change-dock.test.js` "#447 · a ready Trial prints the served count, in Changes' words", "#447 · the dock and Changes print one Trial day count", "term 47 · a matured Trial keeps the slot and says it is readable"; `frontend/follow-up.test.js` "#447 · a Trial day count takes its form from the served verdict, never a count comparison"; `frontend/c4.replay.test.js` "S169 passes when the dock prints the served count in Changes' words", "S169 fails at the dock count, not at a premise, when the dock clamps to \"14 of 14\"", "S169 fails at the dock count when the values ahead of it print a second count"; `tests/test_outcomes_trend.py` `TrialWindowInvarianceTest.test_trend_and_roster_count_the_same_bounded_days` | `logs/447b-base-1280x720.log`, `logs/447b-base-1440x900.log` (base fails), `logs/447b-branch-*.log`, `logs/447c-branch-*.log`, `logs/trunkA-*.log` | `renders/after/447-A1-*.png`, `renders/after/447-B1-*.png` |
| No authored Guide article names Verify (surfaces, ADDED) | S170, S73 | `tests/test_api.py` `ApiTest.test_kb_articles_name_no_verify`; `frontend/c4.replay.test.js` "S170 passes when the Guide article sends Cause levers to a Focus followed in Changes", "S170 fails at its no-Verify assertion, not at a premise, on the base article", "S169 and S170 are unique app-only C4 stories on their cases and terms" | `logs/447b-base-*.log` (base fails), `logs/447b-branch-*.log`, `logs/447c-branch-*.log`, `logs/trunkA-*.log` | `renders/after/447-C1-*.png`, `renders/after/447-C2-*.png` |
| Changes' Plan asks "what will I program into my pump?" (surfaces, ADDED) | S39, S40, S77, S89, S145 (named by design.md; this change adds none) | `frontend/plan.test.js` "the shared capacity text uses the collapsed deliverable count". The requirement restates shipped behavior; this change adds no test for it | none of this ticket's legs replays these stories; the complete ledger on the pushed commit does | — |
| The outcomes-trend route serves only the watched change (http-api, ADDED) | — (S139 and S140 render the dock from this route) | `tests/test_outcomes_trend.py` `TrendRouteTest.test_a_watched_trial_is_served_alone`, `TrendRouteTest.test_a_watched_focus_and_nothing_watched_are_served_alone`, `TrendRouteTest.test_a_labelled_predecessor_keeps_its_input_data_age`, `TrendRouteTest.test_a_supplied_window_changes_nothing`, `TrendRouteTest.test_a_settings_read_after_the_last_data_point_does_not_move_the_anchor`, `CliRendererTest.test_json_keeps_every_rolling_window_series`; `tests/test_api.py` `CachePreWarmTest.test_warm_pass_leaves_the_landing_set_answering_without_recompute`, `CachePreWarmTest.test_one_failing_shape_is_contained_and_the_rest_still_warm` | backend tests only; S139 and S140 pass in `logs/447b-branch-*.log`, `logs/447c-branch-*.log` and `logs/trunkA-*.log` | — |
| Trend series show rolling-window glycemic and behavioral movement, with documented uncertainty bounds. (outcomes, MODIFIED) | — | `tests/test_outcomes_trend.py` `CliRendererTest.test_json_keeps_every_rolling_window_series`, `CliRendererTest.test_markdown_covers_all_sections`, `TrendRouteTest.test_a_watched_trial_is_served_alone` | — | — |
| Remaining consumers migrate before revise-E2E retires (qa-e2e-database, MODIFIED) | — (every ledger story starts on a fresh case-store copy) | Existing tests; this change edits the text only: `tests/test_revise_e2e_retired.py` `RetiredReviseE2ETest.test_closed_executable_surface_has_no_retired_name`, `RetiredReviseE2ETest.test_scan_sees_a_planted_retired_name`, `RetiredReviseE2ETest.test_retired_generator_is_absent`, `RetiredReviseE2ETest.test_retired_fixture_directory_is_absent`; `tests/test_gen_qa_e2e_db.py` `QaE2EDatabaseGeneratorTest.test_cli_writes_stamped_showcase_only_store`, `QaE2EDatabaseGeneratorTest.test_committed_showcase_contains_no_credentials`; `tests/test_finding_case_file_api.py` `PopulatedFindingCaseFileRouteTest.test_populated_preparation_and_selected_case_are_publicly_addressable` | every leg log's `# S… synthetic case=… (fresh copy)` lines | — |
| Sequence findings are served coherently through existing finding interfaces (behavioral-layer, MODIFIED) | — | `tests/test_outcomes_trend.py` `SequenceTrendExclusionTest.test_supported_sequences_add_no_behavior_trend_series` (existing; it pins the `summarize_trend` `behaviors` roster the modified text now names) | — | — |
| Verify surface asks "are my changes working?" (surfaces, REMOVED) | — | Removed. The retired `/verify` address stays closed, pinned since #416 by `frontend/built-shell.test.js` "every retired address stays closed" and `tests/test_frontend_asset_routes.py` `FrontendAssetRoutesTest.test_every_page_built_asset_and_generated_interface_answers_over_http`. Its replacement is "Changes follows a watched Trial or Focus through" | — | — |
| Plan surface asks "what will I program into my pump?" (surfaces, REMOVED) | — | Removed. The retired `/plan` address stays closed, pinned by the same two #416 tests. Its replacement is "Changes' Plan asks "what will I program into my pump?"" | — | — |

## Recorded results

Coordinator-run, 2026-09-23 and 2026-09-24:

- **Plan:** triage at `2e1130ef`; re-pinned at `8e1aa43d` as three serial sub-orders at Full
  depth with the coordinator's fixes F1 to F5 (the dead Trial detector, the unread
  outcomes-trend series, the v1 Plan spec, the QA-database spec, the ACCEPTANCE timing
  table). Plan review r1 blocked on four findings
  (`data.js` lines no sub-order owned, a behavioral delta naming a deleted field, the
  must-prevent scope, an anchor-drift test). Re-pinned at `1a3c3a38` with an anchor spike,
  and countersigned at r2. During #453's review the coordinator left the v1 "Plan surface
  asks" requirement to this change's REMOVED section and had the ADDED Changes' Plan
  requirement name no hand-edit layer.
- **Sub-order 1 (backend contract) on `706de234`:** the outcomes-trend route narrowed and
  the legacy Trial detector deleted; the coordinator log records "390 pytest". Review fixes
  F-a to F-c (six unused imports) at `49d3b722`; the chunk review was clean.
- **Sub-order 2 (shipped surfaces) on `0aacc43f`:** the shared Trial day count, S169 and
  S170, inventory 173/154/19 on the branch. The F-d fix at `c1027748` gave S170 the terms
  HV2-12 and HV2-33. The chunk review raised one non-blocking finding (a chart comment),
  fixed before sub-order 3.
- **S169, S170, S46, S73, S139 and S140 on branch `ed1c29bd` (sub-order 3):**
  `# executed 6 · failed 0 · deferred 0 · selected 6` at 1280x720 and at 1440x900
  (`logs/447b-branch-1280x720.log`, `logs/447b-branch-1440x900.log`). Superseded for S169
  by the `e662c080` run below, because the whole-diff review then extended S169.
- **S169 and S170 on base `b03431d2` with the `ed1c29bd` harness laid over it** (overlaid:
  `frontend/c4.replay.mjs`, `frontend/c4.replay.test.js`, `frontend/desk-behavior.replay.mjs`,
  `frontend/replay-cases.mjs`, `mockups/sweep/harmonic-v2-desktop/acceptance.py` and
  `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`): `# executed 0 · failed 2 · deferred 0 · selected 2`, then "FATAL: zero
  stories executed — a run that asserts nothing is a failure, not a pass", at both sizes.
  S169 fails at its dock count: "FAIL S169 — Timed out after 30000 ms: S169 the dock prints
  the served count; saw [ 'Ready to judge — 14 of 14 days since 05-15' ]; S169 the dock must
  print the served day count in Changes' words", against the expected
  'Ready to judge — 15 days since 05-15 · 14 required'. S170 fails at its no-Verify
  assertion: "FAIL S170 — Timed out after 30000 ms: S170 the Guide article names Changes;
  saw [ … ]; S170 the article must name no Verify", where the elided text is the served base
  article, whose Cause line reads "flow to Focus / Verify"
  (`logs/447b-base-1280x720.log`, `logs/447b-base-1440x900.log`). The coordinator log
  records "base S169/S170 FAIL at content assertions both sizes". This harness predates
  S169's outcome-table check; no base run of a later harness is in these logs.
- **Whole-diff review:** F1 blocking (a Trial's target metric was not first, so CONTEXT.md
  was false), fixed in the product: Changes' outcome table leads with the served
  `target_metrics` for a Trial, and S169 checks it. F2 to F4 were prose fixes. All four
  landed at `e662c080`. Re-review r2 found F1 to F4 fixed and raised F5 to F8 (a comment, a
  ruling-label collision, the proposal, a pin test for the desk's arc rows).
- **S169, S170, S46, S73, S139 and S140 on branch `e662c080`:**
  `# executed 6 · failed 0 · deferred 0 · selected 6` at both sizes
  (`logs/447c-branch-1280x720.log`, `logs/447c-branch-1440x900.log`).
- **F5 to F8 at `2de52828`**, labelled RR5 to RR8, with `tests/test_arc_rows_mirror.py`
  shown to fail in both directions. The coordinator log records "Legs from e662c080 stand
  (doc/test-only delta)". Re-review r3 was clean.
- **Release trunk:** `TRUNK c6697ef5 #447 merged` with inventory 189/170/19. The merge
  joined #442's and #447's `comparisonTables` options (`leverTitle`, `targets`) and their
  C4 story bodies, restored the `_seg` and `_profile` test helpers that #442's tests still
  used after this change deleted them, and trimmed unused imports (`Union`, `BasalEvent`,
  `CgmReading`, `Snapshot`). Fast gate 1128, targeted pytest 330, port-free acceptance OK,
  drift 0.
- **After #451 merged:** the coordinator's merge note says #451 changes the Trial dock's
  detail line, which S169 reads, so S169 and S170 re-run on the trunk. `TRUNK 25392ade #451
  merged` (193/174/19): the dock test combined #451's values with #447's count, S169's dock
  check accepted a values prefix (with a fake-page test), and the ledger's S169 entry gained
  a #451 line. Fast gate 1149, port-free acceptance OK, pytest 318, drift ok.
- **Trunk leg on `25392ade`**, `ONLY=S169,S170,S177,S178,S179,S139,S140,S46,S73,S157,S180,S182,S25,S149,S150`:
  `# executed 15 · failed 0 · deferred 0 · selected 15` at both sizes, with S46, S73, S139,
  S140, S169 and S170 among the passes (`logs/trunkA-1280x720.log`,
  `logs/trunkA-1440x900.log`). The coordinator log records "TRUNK LEGS 25392ade: … 15/15
  both sizes".
- **Glue review of the #447, #454, #451 and #457 merges:** clean except that the
  prefix-accepting S169 dock check was weaker than the story. Fixed at `faaf1143`: the
  check refuses a second day count in the values ahead of the ready line, with a negative
  fake-page test. No leg in this folder replays S169 with that check; the complete ledger
  on the pushed commit does.
- **Trunk `9882bcfe`:** the #451 em-dash widening merged clean (drift 12/12, fast gate 1153,
  port-free acceptance OK, OpenSpec 90). Render phase 2 ran on it, added 447-B2 and
  captured its before; phase 2 finished with 99 after shots and 0 failures across the
  release. No leg in this folder replays S169 or S170 on `9882bcfe`.
- The complete ledger at both sizes, the whole backend pytest and the full
  `acceptance.test.py` run once on the commit that is pushed; the pull request records the
  result.

## Renders

- **Before**: base `b03431d2` (origin/main before the release).
- **After**: the release trunk `dd5a93bb`, served with a desk shell built fresh from that
  commit (`npm ci && npm run build`) before the after batch.
- **Owed by**: tasks.md 4.1 (the lock) names the dock (447-A1), Changes' Trial Watch
  maturity (447-B1) and the Guide's "Reading the Diagnose surface" article (447-C1). Review
  ruling RR1 (design.md decision 7) owes the Trial outcome table (447-B2), which the
  coordinator added. 447-C2 is supplementary context beside 447-C1.
- **How**: both trees were served with AGENTS.md's QA copy-then-serve command
  (`uv run harmonic serve --no-fetch --token '' --db <scratch copy> --port 8791`) over the
  committed showcase or a named case store emitted by that tree's own
  `scripts/gen_qa_e2e_db.py --case <name>`, followed by the replay case server's
  `reconcile_ingested_follow_up` step. Chromium used the dark scheme, the desk's only theme.
  The same interaction path produced each before and after.
- **Files**: each `.png` is the render; each `.txt` beside it holds the page's visible text,
  the address, the focused element and the capture note.

| Shot | Size | State | Store | Route | Before | After |
|---|---|---|---|---|---|---|
| 447-A1 | 1280x720 | the watch dock: ready line wraps inside its reserve, never ellipsized | `c3-trial` | topbar Diagnose; crop `.inspector > .watch` | [png](renders/before/447-A1-1280x720.png) · [txt](renders/before/447-A1-1280x720.txt) | [png](renders/after/447-A1-1280x720.png) · [txt](renders/after/447-A1-1280x720.txt) |
| 447-A1 | 1440x900 | as above | `c3-trial` | as above | [png](renders/before/447-A1-1440x900.png) · [txt](renders/before/447-A1-1440x900.txt) | [png](renders/after/447-A1-1440x900.png) · [txt](renders/after/447-A1-1440x900.txt) |
| 447-B1 | 1280x720 | Changes' Trial Watch maturity (unchanged: `15 days` / `14 required · 0 data gaps`, bar 14 of 14) | `c3-trial` | dock `.go` → scroll `[data-part="maturity"]` | [png](renders/before/447-B1-1280x720.png) · [txt](renders/before/447-B1-1280x720.txt) | [png](renders/after/447-B1-1280x720.png) · [txt](renders/after/447-B1-1280x720.txt) |
| 447-B1 | 1440x900 | as above | `c3-trial` | as above | [png](renders/before/447-B1-1440x900.png) · [txt](renders/before/447-B1-1440x900.txt) | [png](renders/after/447-B1-1440x900.png) · [txt](renders/after/447-B1-1440x900.txt) |
| 447-B2 | 1280x720 | Changes' Trial outcome table: its served target row leads, marked as the target | `c3-trial` | as 447-B1; scroll `.gf-stage-trial [data-table="outcomes"]` | [png](renders/before/447-B2-1280x720.png) · [txt](renders/before/447-B2-1280x720.txt) | [png](renders/after/447-B2-1280x720.png) · [txt](renders/after/447-B2-1280x720.txt) |
| 447-B2 | 1440x900 | as above | `c3-trial` | as above | [png](renders/before/447-B2-1440x900.png) · [txt](renders/before/447-B2-1440x900.txt) | [png](renders/after/447-B2-1440x900.png) · [txt](renders/after/447-B2-1440x900.txt) |
| 447-C1 | 1280x720 | Guide article "Reading the Diagnose surface", top | `showcase` | Guide → `[data-utility-slug="reading-diagnose"]` | [png](renders/before/447-C1-1280x720.png) · [txt](renders/before/447-C1-1280x720.txt) | [png](renders/after/447-C1-1280x720.png) · [txt](renders/after/447-C1-1280x720.txt) |
| 447-C1 | 1440x900 | as above | `showcase` | as above | [png](renders/before/447-C1-1440x900.png) · [txt](renders/before/447-C1-1440x900.txt) | [png](renders/after/447-C1-1440x900.png) · [txt](renders/after/447-C1-1440x900.txt) |
| 447-C2 | 1280x720 | the same article at its ◈ Cause line (supplementary) | `showcase` | as 447-C1; scroll to the ◈ Cause line | [png](renders/before/447-C2-1280x720.png) · [txt](renders/before/447-C2-1280x720.txt) | [png](renders/after/447-C2-1280x720.png) · [txt](renders/after/447-C2-1280x720.txt) |
| 447-C2 | 1440x900 | as above | `showcase` | as above | [png](renders/before/447-C2-1440x900.png) · [txt](renders/before/447-C2-1440x900.txt) | [png](renders/after/447-C2-1440x900.png) · [txt](renders/after/447-C2-1440x900.txt) |

### What the pair shows

447-A1: before, the dock's detail reads "Ready to judge — 14 of 14 days since 05-15"; after,
it reads "0.6 → 0.54 U/hr · Ready to judge — 15 days since 05-15 · 14 required" (the
Trial's values leading the line are #451's), and the after crop shows it wrapped onto a
second line, not ellipsized. 447-B1: Changes' Watch maturity reads "15 days" with "14
required · 0 data gaps" in both trees. 447-B2: before, the Trial's outcome table leads with
Time in range and Time below range comes second; after, Time below range leads, labelled
"target metric", and Time in range comes second. 447-C1 and 447-C2: before, the Cause line
reads "flow to Focus / Verify, because no pump setting fixes them."; after, it reads "flow
to a Focus, followed in Changes, because no pump setting fixes them.", no after capture
names Verify, and the locked preface ("Written for the v1 tabs: …") is the same in both.
The other differences in these captures are other tickets' changes: "Not met — still
collecting." (#449 and #450) and the article's em dashes swapped for colons or commas (the
#451 sweep). At 1440x900, 447-B1 and 447-B2 are the same image in each tree, and 447-C1 and
447-C2 are the same image at both sizes, because the owed rows are in view without
scrolling.

## Logs

Each leg's commit is the one its coordinator run transcript printed first (`prep <tree>
<oid>`, and `prep base-b03431d2 b03431d2` after the `overlay:` lines for a base leg); those
transcripts are not kept in this folder.

| File | Leg | Commit |
| --- | --- | --- |
| `logs/447b-branch-1280x720.log` | branch replay `ONLY=S169,S170,S46,S73,S139,S140` at 1280x720 | `ed1c29bd` |
| `logs/447b-branch-1440x900.log` | branch replay `ONLY=S169,S170,S46,S73,S139,S140` at 1440x900 | `ed1c29bd` |
| `logs/447b-base-1280x720.log` | base replay `ONLY=S169,S170` with the branch harness laid over it, at 1280x720 | `b03431d2` (harness from `ed1c29bd`) |
| `logs/447b-base-1440x900.log` | base replay `ONLY=S169,S170` with the branch harness laid over it, at 1440x900 | `b03431d2` (harness from `ed1c29bd`) |
| `logs/447c-branch-1280x720.log` | branch replay `ONLY=S169,S170,S46,S73,S139,S140` at 1280x720 | `e662c080` |
| `logs/447c-branch-1440x900.log` | branch replay `ONLY=S169,S170,S46,S73,S139,S140` at 1440x900 | `e662c080` |
| `logs/trunkA-1280x720.log` | release-trunk replay of 15 stories, S169 and S170 among them, at 1280x720 | `25392ade` |
| `logs/trunkA-1440x900.log` | release-trunk replay of 15 stories, S169 and S170 among them, at 1440x900 | `25392ade` |
