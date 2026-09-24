# #451 synthetic evidence

Everything here is synthetic. Every capture and log comes from committed manufactured QA
recipes (`scripts/qa_e2e_cases.py`) or the committed showcase, served by the offline
no-fetch app (`--no-fetch --token ''`). No personal database, operator screenshot or
real-data payload is included. The release coordinator ran every port-bound leg serially;
the ticket worker bound no port. Absolute paths in the logs are replaced with
`<base worktree>`, `<ticket worktree>`, `<release worktree>`, `<scratch>` and `$TMPDIR`.

Change: `setting-concern-labels` (OpenSpec), archived with the release. Ticket branch head at
integration: `8c17fa3e` (the second parent of trunk merge `25392ade`). The last commit the
coordinator ran #451's own legs on is `995126ad`; `8c17fa3e` is its close-out commit (register
fixes and the recorded legs), and the trunk legs on `25392ade` re-ran S177–S179 over it.

This folder also carries the change's second piece of work: the R451 widening (desk copy
carries no prose em dash), done on the release trunk after #451 merged, on branch
`451-emdash-sweep`. Its branch head at integration is `9879f196` (the second parent of trunk
merge `9882bcfe`). Its legs ran on `678fb544`; `9879f196` is its review-fix commit (the lock's
sanction line, the whole frozen fixture slice pinned, and the findings queue's held-row prefix
taking a colon), on which no port-bound leg ran. The ledger's #451 section records that no
story, replay or browser suite reads a held row's reason line.

Stores: `isf-strengthen` serves S177–S179 and every #451 render, and S178 again in the
widening's branch run; `showcase` serves S4 (the persistent advisory line) in the widening's
branch and base runs; `basal-lower`, `c3-trial` and `basal-verdict-gallery` serve S42, S142 and
S153, which the widening's branch run re-ran because their asserted text sits near moved copy;
`c3-trial` also serves S169 in the trunk run, whose dock detail carries #451's values prefix.
The trunk run's other stores (`showcase`, `c3-focus`, `c4-ic`, `c4-isf`, `pattern-near-tie`)
serve other tickets' stories in the same 15-story run.

## Requirement map

| Requirement (surfaces spec, ADDED) | Stories | Node and backend tests | Log | Captures |
| --- | --- | --- | --- | --- |
| The carb-ratio analyzer's sentences pass the user-copy register | — | `tests/test_annotation_register.py` `RegisterTest.test_every_carb_ratio_branch_is_in_register`, `RegisterTest.test_every_carb_ratio_finding_sentence_is_in_register`; `tests/test_analyzer_ic.py` `PriorMealIdentifiabilityFacadeTest.test_too_few_identifiable_meals_reports_the_exit_count`, `AnalyzeIcTest.test_below_min_meals_estimate_visible_but_no_recommendation`, `DoseStampedIcHistoryTest.test_switch_proof_withholds_pre_snapshot_cross_change_and_mixed_stamp_runs`; `tests/test_qa_e2e_cases.py` `QaE2ECasesTest.test_case_ic_raise`, `QaE2ECasesTest.test_case_ic_lower`, `QaE2ECasesTest.test_case_ic_capped_raise`, `QaE2ECasesTest.test_case_ic_capped_lower` (catalog-generated) | — | — |
| Diagnose's setting findings are titled by their user labels | S178 | `tests/test_findings_projection.py` `GroundedWindowTest.test_the_afternoon_window_shows_the_blind_stretch_and_a_held_isf`, `GroundedWindowTest.test_a_held_reason_is_the_analyzers_own_string`, `GroundedWindowTest.test_a_window_wrapping_midnight_reaches_both_sides_of_it`, `ChipProjectionTest.test_analyzer_built_windows_chip_findings_by_their_outcomes_and_contexts`; `tests/test_qa_e2e_cases.py` `QaE2ECasesTest.test_case_isf_strengthen`, `QaE2ECasesTest.test_case_isf_direction_only_weaken`; `frontend/diagnose-findings-queue.test.js` "a single asserting item prints the number pair the mock shows", "term 14/38 · a held row is words-first and offers no stage affordance"; `frontend/findings-projection-mirror.test.js` "the mirror publishes outcome chips, chip counts, and correction-factor scope" | `logs/451c-branch-*.log`, `logs/451c-base-*.log`, `logs/trunkA-*.log` | `renders/after/451-B1-*.png` |
| A setting concern is served under its setting's user label | S179 (its source names the setting concern's title, recorded as the explanation) | `tests/test_guidance.py` `GuidanceTest.test_setting_concerns_are_titled_by_their_user_labels` | `logs/451c-branch-*.log`, `logs/451c-base-*.log`, `logs/trunkA-*.log` | `renders/after/451-D1-*.png` |
| Every set-aside subject guidance lists carries its served name | — | `tests/test_guidance.py` `GuidanceTest.test_set_aside_subjects_the_read_no_longer_carries_keep_their_names` | — | — |
| A recorded Plan's subjects are served with their names | S179 | `tests/test_durable_follow_up.py` `DurableApiTest.test_plan_history_names_each_recorded_subject_at_read_time` | `logs/451c-branch-*.log`, `logs/451c-base-*.log`, `logs/trunkA-*.log` | `renders/after/451-D1-*.png` |
| A setting value in Changes prints in its user form | S177, S179 | `frontend/changes.test.js` "an Action figure prints each setting instruction in the wearer's form"; `frontend/plan-view.test.js` "What was known names the recorded concern and its value in the wearer's words (#451)"; `frontend/plan.test.js` "a correction factor reads insulin first on both sides" | `logs/451c-branch-*.log`, `logs/451c-base-*.log`, `logs/trunkA-*.log` | `renders/after/451-A1-*.png`, `renders/after/451-D1-*.png` |
| Changes lists every set-aside concern by a name | — | `frontend/changes.test.js` "a set-aside row prints its served name, and an unnamed one says so" | — | — |
| Changes says why its concern leads in words | S177 | `frontend/changes.test.js` "Changes says why its concern leads in words, never the served code", "a set-aside concern on screen prints no words for the concern that leads next", "a staged change reads Staged, as the pane does, until it is undone" | `logs/451c-branch-*.log`, `logs/451c-base-*.log`, `logs/trunkA-*.log` | `renders/after/451-A1-*.png` |
| Diagnose names the correction factor and carb ratio in the wearer's words | S178 | `frontend/diagnose-findings-queue.test.js` "an asserting correction-factor row prints its numbers insulin first (#451)"; `frontend/diagnose-workstation.test.js` "the correction-factor panel names its setting and prints each value insulin first (#451)", "the breadcrumb names the correction-factor level in the wearer's words (#451)", "a case head names the peak hour's carb ratio block in the wearer's words (#451)"; `frontend/c4.replay.test.js` "S178 expects the numbers line the queue prints, served scope note included"; `tests/test_classifier_carb_undercount.py` `NotInDataTest.test_missing_settings_sentence_names_the_settings_in_the_wearers_words` | `logs/451c-branch-*.log`, `logs/451c-base-*.log`, `logs/trunkA-*.log` | `renders/after/451-B1-*.png`, `renders/after/451-B2-*.png` |
| The watch dock's title names the change and its values wrap below | S178; S169 (its #451 line: the Trial's values lead the dock's detail line) | `frontend/watched-change-dock.test.js` "#451 · a Trial is named by its setting, and its values lead the wrapping line" | `logs/451c-branch-*.log`, `logs/451c-base-*.log`, `logs/trunkA-*.log` | `renders/after/451-C1-*.png` |
| Desk copy joins no clauses with an em dash | S4 (amended) | `tests/test_guide_catalog.py` `BuildCatalogTest.test_the_catalog_joins_no_clauses_with_an_em_dash`; `tests/test_findings_projection.py` `FindingEvidenceBlockTest.test_served_occurrence_sentences_join_no_clauses_with_an_em_dash`, `FindingEvidenceBlockTest.test_cross_family_episode_pair_is_emitted_by_the_real_producer`; `frontend/utilities.test.js` "ADR 451 · no Glossary definition joins its clauses with an em dash"; `frontend/kb.test.js` "ADR 451 · no Guide article joins its clauses with an em dash"; `frontend/chrome.test.js` "the topbar and footer carry their verbatim strings"; `frontend/diagnose-findings-queue.test.js` "term 14/38 · a held row is words-first and offers no stage affordance" (the held-row prefix); `frontend/desk.browser.test.mjs` "the desk opens on Diagnose behind its persistent chrome" | `logs/emdash-branch-*.log`, `logs/emdash-base-*.log`, `logs/emdash-desk-whole.log` | every after-capture's footer (the new advisory line); `renders/after/451-C1-*.png`, `renders/after/451-D1-*.png` |

## Recorded results

Coordinator-run, 2026-09-24:

- **Sub-order records (coordinator log):** sub-order 1 `d2c1a929` ("37 register failures
  fail-first; QA literals re-dumped"); sub-order 2 `d68f709a`; sub-order 3 head `21980456`,
  then its review fixes `62c966b6`; sub-order 4 `d114ddfa` (S177–S179, the PR smoke slice at 25
  with digest `9b92ee77`, branch inventory 174/155/19).
- **S177–S179 on branch `d114ddfa`:** S177 and S179 pass at both sizes. S178 fails at both
  sizes, "FAIL S178 — Timed out after 30000 ms: S178 the correction-factor queue row; saw [",
  ending "]; S178 the queue numbers read insulin first, at the queue's own rounding", with actual
  `'now 1 U : 40.0 mg/dL → 1 U : 32.0 mg/dL · Whole day'` against expected
  `'now 1 U : 40.0 mg/dL → 1 U : 32.0 mg/dL'` (`# executed 2 · failed 1 · deferred 0 ·
  selected 3` at each size; `logs/451-branch-1280x720.log`, `logs/451-branch-1440x900.log`). The
  coordinator log records this as a story defect (the story expected the numbers line without
  the row's served " · Whole day" note) and a story fix sent.
- **Desk suite on `d114ddfa`:** `ℹ tests 43`, `ℹ pass 43`, `ℹ fail 0`
  (`logs/451-desk-whole.log`).
- **S177–S179 on base `b03431d2` with the `d114ddfa` harness laid over it:** all three fail at
  both sizes, `# executed 0 · failed 3 · deferred 0 · selected 3`, then "FATAL: zero stories
  executed — a run that asserts nothing is a failure, not a pass" (`logs/451-base-1280x720.log`,
  `logs/451-base-1440x900.log`):
  - "FAIL S177 — Timed out after 30000 ms: S177 the plain arrival reads in the wearer's words;
    saw [ 'strengthen to 32 ' ]; S177 the Action figure reads the served instruction, the
    correction factor insulin first" (expected `'strengthen to 1 U : 32 mg/dL'`);
  - "FAIL S178 — Timed out after 30000 ms: S178 the correction-factor queue row; saw [ 'ISF ·
    strengthen' ]; S178 the queue row is titled by the setting and its served direction"
    (expected `'Correction factor · strengthen'`);
  - "FAIL S179 — Timed out after 30000 ms: S179 what was known; saw [", ending "]; S179 the
    recorded concern is named, never its identifier" (actual `'setting:isf'`, expected
    `'Correction factor'`).

  The coordinator log: "S177/S178/S179 FAIL at feature assertions both sizes (right reasons)",
  to be re-proved with the fixed harness.
- **S177–S179 on branch `cf3173dc` (superseded; branch legs only, by design of that run):** S177
  and S179 pass at both sizes. S178 now passes its numbers line and fails later at both sizes,
  "FAIL S178 — Timed out after 30000 ms: S178 the correction-factor panel; saw [", with
  "locator.innerText: Error: strict mode violation: locator('.dw') resolved to 2 elements"
  (`# executed 2 · failed 1 · deferred 0 · selected 3` at each size;
  `logs/451b-branch-1280x720.log`, `logs/451b-branch-1440x900.log`). The coordinator log has no
  line for this run; its next #451 line names `995126ad`'s `.dw[data-state]` locator fix.
- **Whole-diff review (coordinator log):** four findings, the blocking one being that the
  replay's app import broke the base overlay; fixed before `995126ad`.
- **S177–S179 on branch `995126ad`:** `PASS S177`, `PASS S178`, `PASS S179`,
  `# executed 3 · failed 0 · deferred 0 · selected 3` at both sizes
  (`logs/451c-branch-1280x720.log`, `logs/451c-branch-1440x900.log`). The coordinator log: "branch
  S177-S179 3/3 both sizes (S178 geometry now measured)".
- **Desk suite on `995126ad`:** `ℹ tests 43`, `ℹ pass 43`, `ℹ fail 0`
  (`logs/451c-desk-whole.log`).
- **S177–S179 on base `b03431d2` with the `995126ad` harness laid over it:** the same three FAIL
  lines as the earlier base run, at both sizes, `# executed 0 · failed 3 · deferred 0 ·
  selected 3` (`logs/451c-base-1280x720.log`, `logs/451c-base-1440x900.log`). The coordinator
  log: "base overlay (new harness) S177/S178/S179 FAIL at feature assertions both sizes."
- **Review round 2 (coordinator log):** F1–F4 fixed. Ruling: #451 fixes prose em dashes in the
  lines it added; the desk-wide sweep of pre-existing prose em dashes runs as the R451 widening
  on the trunk after the #451 merge.
- **Release trunk:** `TRUNK 25392ade #451 merged (193/174/19; smoke 25 auto-merged; c4 joins;
  follow-up imports union + UNIT & LEVER_NAME both gone; plan-view #453 2-arg + #451 label; dock
  test combined values+#447 count; S169 dock check accepts values prefix (+fake test) + ledger
  S169 line; fast 1149; port-free OK; pytest 318; drift ok). OWED: S169/S170/S177-S179 on
  trunk.`
- **Trunk legs on `25392ade`:** S25, S46, S73, S139, S140, S169, S170, S157, S180, S149, S150,
  S182, S177, S178 and S179 all pass at both sizes, `# executed 15 · failed 0 · deferred 0 ·
  selected 15` (`logs/trunkA-1280x720.log`, `logs/trunkA-1440x900.log`). The coordinator log:
  "TRUNK LEGS 25392ade: … 15/15 both sizes."
- **Em-dash widening on branch `678fb544`:** `PASS S4`, `PASS S42`, `PASS S142`, `PASS S153`,
  `PASS S178`, `# executed 5 · failed 0 · deferred 0 · selected 5` at both sizes
  (`logs/emdash-branch-1280x720.log`, `logs/emdash-branch-1440x900.log`); desk suite
  `ℹ tests 43`, `ℹ pass 43`, `ℹ fail 0` (`logs/emdash-desk-whole.log`).
- **S4 on base `b03431d2` with the `678fb544` harness laid over it:** fails at both sizes, "FAIL
  S4 — Timed out after 30000 ms: S4; saw [", ending "]; the advisory line drifted: "Advisory only —
  review with your clinician before changing pump settings."" (`# executed 0 · failed 1 ·
  deferred 0 · selected 1`, then the FATAL zero-stories line; `logs/emdash-base-1280x720.log`,
  `logs/emdash-base-1440x900.log`). The coordinator log: "EMDASH legs 678fb544:
  S4,S42,S142,S153,S178 5/5 both sizes; desk 43/43; base S4 FAIL at advisory line (right
  reason)." The ledger's S4 amendment names base `25392ade` as the expected failing base; the
  base the coordinator ran was `b03431d2`, which carries the same old advisory line.
- **Widening review (coordinator log):** the lock's sanction line was not exact (blocking), the
  pin test covered two of three sentences, and the held-row prefix flipped to a colon; the
  fixture hand-sync was accepted. The fixes are `9879f196`; no port-bound leg ran on it.
- **Glue review of the #447, #451, #454 and #457 merges (coordinator log):** clean except S169's
  prefix weakening, fixed at `faaf1143` with a negative fake test. No replay leg is recorded on
  `faaf1143`.
- **Release trunk, widening:** `TRUNK 9882bcfe emdash merged clean (drift 12/12 no regen; fast
  1153; port-free OK; openspec 90).`
- The complete ledger at both sizes, the whole backend pytest, the full `acceptance.test.py`
  run and the QA coverage budgets (deferred to integration at triage) run once on the commit that
  is pushed; the pull request records the result.

## Renders

- **Before**: base `b03431d2` (origin/main before the release).
- **After**: the release trunk `dd5a93bb`, served with a desk shell built fresh from that
  commit (`npm ci && npm run build`) before the after batch.
- **Owed by**: the lock: design.md's "Renders owed" (before and after, 1280x720 and 1440x900,
  all on `isf-strengthen`): Changes plain arrival, the Diagnose findings queue and
  correction-factor panel, the dock with the correction factor staged, and the recorded Plan's
  "What was known".
- **How**: both trees were served with AGENTS.md's QA copy-then-serve command
  (`uv run harmonic serve --no-fetch --token '' --db <scratch copy> --port 8791`) over the
  committed showcase or a named case store emitted by that tree's own
  `scripts/gen_qa_e2e_db.py --case <name>`, followed by the replay case server's
  `reconcile_ingested_follow_up` step. Chromium used the dark scheme, the desk's only theme.
  The same interaction path produced each before and after.
- **Files**: each `.png` is the render; each `.txt` beside it holds the page's visible text,
  the address, the focused element and the capture note.

The after-captures carry the em-dash widening's desk strings as well as every #451 sub-order
change. Every after footer reads "Advisory only. Review with your clinician before changing pump
settings.", where every before footer reads "Advisory only — review with your clinician before
changing pump settings.". In 451-C1 the staged dock's detail line ends "Staged, not applied:
nothing has changed on the pump" after, and 451-D1's pending line reads "Pending: program these
into your pump. …" after. A first after batch, served with a shell left over from trunk
`25392ade`, lacked these strings and was replaced whole (see the evidence record's root
README). The widening's proof is still its replay legs (the `emdash-*` logs, whose preparation
built the shell from `678fb544`; S4 passes there only on the new line) and its node and backend
tests.

| Shot | Size | State | Store | Route | Before | After |
|---|---|---|---|---|---|---|
| 451-A1 | 1280x720 | Changes plain arrival: the Action figure and the status words (S177's plain-arrival state) | `isf-strengthen` | topbar Changes | [png](renders/before/451-A1-1280x720.png) · [txt](renders/before/451-A1-1280x720.txt) | [png](renders/after/451-A1-1280x720.png) · [txt](renders/after/451-A1-1280x720.txt) |
| 451-A1 | 1440x900 | as above | `isf-strengthen` | topbar Changes | [png](renders/before/451-A1-1440x900.png) · [txt](renders/before/451-A1-1440x900.txt) | [png](renders/after/451-A1-1440x900.png) · [txt](renders/after/451-A1-1440x900.txt) |
| 451-B1 | 1280x720 | Diagnose findings queue: the correction-factor row's title and numbers (S178's queue row) | `isf-strengthen` | topbar Diagnose → 24 h | [png](renders/before/451-B1-1280x720.png) · [txt](renders/before/451-B1-1280x720.txt) | [png](renders/after/451-B1-1280x720.png) · [txt](renders/after/451-B1-1280x720.txt) |
| 451-B1 | 1440x900 | as above | `isf-strengthen` | topbar Diagnose → 24 h | [png](renders/before/451-B1-1440x900.png) · [txt](renders/before/451-B1-1440x900.txt) | [png](renders/after/451-B1-1440x900.png) · [txt](renders/after/451-B1-1440x900.txt) |
| 451-B2 | 1280x720 | the correction-factor panel: heading and values (S178's panel) | `isf-strengthen` | as 451-B1 → the queue row whose id contains `isf` | [png](renders/before/451-B2-1280x720.png) · [txt](renders/before/451-B2-1280x720.txt) | [png](renders/after/451-B2-1280x720.png) · [txt](renders/after/451-B2-1280x720.txt) |
| 451-B2 | 1440x900 | as above | `isf-strengthen` | as 451-B1 → the queue row whose id contains `isf` | [png](renders/before/451-B2-1440x900.png) · [txt](renders/before/451-B2-1440x900.txt) | [png](renders/after/451-B2-1440x900.png) · [txt](renders/after/451-B2-1440x900.txt) |
| 451-C1 | 1280x720 | the watch dock with the correction factor staged: title fit and values (S178's staged dock) | `isf-strengthen` | as 451-B2 → Stage change; crop `.inspector > .watch` | [png](renders/before/451-C1-1280x720.png) · [txt](renders/before/451-C1-1280x720.txt) | [png](renders/after/451-C1-1280x720.png) · [txt](renders/after/451-C1-1280x720.txt) |
| 451-C1 | 1440x900 | as above | `isf-strengthen` | as 451-B2 → Stage change; crop `.inspector > .watch` | [png](renders/before/451-C1-1440x900.png) · [txt](renders/before/451-C1-1440x900.txt) | [png](renders/after/451-C1-1440x900.png) · [txt](renders/after/451-C1-1440x900.txt) |
| 451-D1 | 1280x720 | the recorded Plan's "What was known" (S179) | `isf-strengthen` | as 451-C1 → topbar Changes → Open Plan if closed → Record decision; scroll "What was known" | [png](renders/before/451-D1-1280x720.png) · [txt](renders/before/451-D1-1280x720.txt) | [png](renders/after/451-D1-1280x720.png) · [txt](renders/after/451-D1-1280x720.txt) |
| 451-D1 | 1440x900 | as above | `isf-strengthen` | as 451-C1 → topbar Changes → Open Plan if closed → Record decision; scroll "What was known" | [png](renders/before/451-D1-1440x900.png) · [txt](renders/before/451-D1-1440x900.txt) | [png](renders/after/451-D1-1440x900.png) · [txt](renders/after/451-D1-1440x900.txt) |

### What the pair shows

In 451-A1 the nameplate reads "0 priority · eligible_action", the Action heading "ELIGIBLE_ACTION"
and the figure "strengthen to 32" before; after, they read "0 priority · Ready to stage", "READY
TO STAGE" and "strengthen to 1 U : 32 mg/dL". In 451-B1 the correction-factor queue row is titled
"ISF · strengthen" with "now 40.0 mg/dL/U → 32.0 mg/dL/U · Whole day" before, and "Correction
factor · strengthen" with "now 1 U : 40.0 mg/dL → 1 U : 32.0 mg/dL · Whole day" after. In 451-B2
the panel's breadcrumb and heading read "ISF" and its values "40.00", "24.00" and "32.00" with
"mg/dL/U" qualifiers before; after, they read "Correction factor", "1 U : 40.00 mg/dL", "1 U :
24.00 mg/dL" and "1 U : 32.00 mg/dL", with the interval "CI 1 U : 23.99 mg/dL–1 U : 24.00 mg/dL
on the estimate". In 451-C1 the staged dock's title is "ISF · 40.00 → 32.00 mg/dL/U" before;
after, it is "Correction factor · strengthen" and the detail line leads with "1 U : 40.00 mg/dL →
1 U : 32.00 mg/dL". In 451-D1 "What was known" prints "setting:isf", "32 mg/dL/U" and the
explanation "ISF" before, and "Correction factor", "1 U : 32 mg/dL" and "Correction factor"
after. Each 1440x900 text matches its 1280x720 text line for line, apart from 451-D1's recorded
times.

## Logs

Each leg's commit is the one its coordinator run transcript printed first (`prep <tree>
<oid>`, and `prep base-b03431d2 b03431d2` after the `overlay:` lines for a base leg); those
transcripts are not kept in this folder.

| File | Leg | Commit |
| --- | --- | --- |
| `logs/451-branch-1280x720.log` | branch replay of S177–S179 at 1280x720 | `d114ddfa` |
| `logs/451-branch-1440x900.log` | branch replay of S177–S179 at 1440x900 | `d114ddfa` |
| `logs/451-desk-whole.log` | `frontend/desk.browser.test.mjs`, whole suite | `d114ddfa` |
| `logs/451-base-1280x720.log` | S177–S179 with the `d114ddfa` harness laid over base, 1280x720 | `b03431d2` |
| `logs/451-base-1440x900.log` | S177–S179 with the `d114ddfa` harness laid over base, 1440x900 | `b03431d2` |
| `logs/451b-branch-1280x720.log` | branch replay of S177–S179 at 1280x720 (superseded) | `cf3173dc` |
| `logs/451b-branch-1440x900.log` | branch replay of S177–S179 at 1440x900 (superseded) | `cf3173dc` |
| `logs/451c-branch-1280x720.log` | branch replay of S177–S179 at 1280x720 | `995126ad` |
| `logs/451c-branch-1440x900.log` | branch replay of S177–S179 at 1440x900 | `995126ad` |
| `logs/451c-desk-whole.log` | `frontend/desk.browser.test.mjs`, whole suite | `995126ad` |
| `logs/451c-base-1280x720.log` | S177–S179 with the `995126ad` harness laid over base, 1280x720 | `b03431d2` |
| `logs/451c-base-1440x900.log` | S177–S179 with the `995126ad` harness laid over base, 1440x900 | `b03431d2` |
| `logs/trunkA-1280x720.log` | release trunk replay of 15 stories, S169 and S177–S179 among them, 1280x720 | `25392ade` |
| `logs/trunkA-1440x900.log` | release trunk replay of 15 stories, S169 and S177–S179 among them, 1440x900 | `25392ade` |
| `logs/emdash-branch-1280x720.log` | widening branch replay of S4, S42, S142, S153 and S178 at 1280x720 | `678fb544` |
| `logs/emdash-branch-1440x900.log` | widening branch replay of S4, S42, S142, S153 and S178 at 1440x900 | `678fb544` |
| `logs/emdash-desk-whole.log` | `frontend/desk.browser.test.mjs`, whole suite | `678fb544` |
| `logs/emdash-base-1280x720.log` | S4 with the `678fb544` harness laid over base, 1280x720 | `b03431d2` |
| `logs/emdash-base-1440x900.log` | S4 with the `678fb544` harness laid over base, 1440x900 | `b03431d2` |
