# #453 synthetic evidence

Everything here is synthetic. Every capture and log comes from committed manufactured QA
recipes (`scripts/qa_e2e_cases.py`) or the committed showcase, served by the offline
no-fetch app (`--no-fetch --token ''`). No personal database, operator screenshot or
real-data payload is included. The release coordinator ran every port-bound leg serially;
the ticket worker bound no port. Absolute paths in the logs are replaced with
`<base worktree>`, `<ticket worktree>`, `<release worktree>`, `<scratch>` and `$TMPDIR`.

Change: `plan-cleanup-s89` (OpenSpec), archived with the release. Ticket branch head at
integration: `23f78934`, the branch side of trunk merge `0055a5be`. The last leg ran on
`6c84e052`. The coordinator log records the next commit, `758c1509`, as a "JSDoc-only build
change" for which "legs from 6c84e052 stand". `23f78934` changes only the change's own
`design.md` and `tasks.md`.

Stores: `basal-lower` serves S38, S39, S40, S41, S42, S89, S90, S145 and S146 (no QA recipe
writes Plan history on it, so S89's store holds only the decision the story records);
`c3-trial` serves S105 (a Plan confirmed on the pump, with no active watch). No render is
owed.

## Requirement map

| Requirement (capability spec, ADDED/MODIFIED) | Stories | Node and backend tests | Log | Captures |
| --- | --- | --- | --- | --- |
| The Plan lifecycle replay certifies the decision it recorded (surfaces, ADDED) | S89 | `frontend/replay-cases.test.js` "S89 certifies the newest Plan record as the decision it recorded" | `logs/453-branch-1280x720.log`, `logs/453-branch-1440x900.log`, `logs/453b-branch-1280x720.log`, `logs/453b-branch-1440x900.log` | none owed |
| A draft persists unsaved changes locally (plan, MODIFIED) | S40, S89, S146 | `frontend/plan.test.js` "effectivePlanItems survives keyed-in-and-refetched…", "effectivePlanItems is empty when nothing is staged"; `tests/test_api.py` `ApiTest.test_put_plan_overwrites_previous_draft`, `CacheInvalidationTest.test_plan_draft_save_does_not_invalidate_cache`; `tests/test_store.py` `PlanDraftStoreTest.test_save_overwrites_previous_draft`, `PlanDraftStoreTest.test_save_draft_leaves_durable_revision_unchanged` | `logs/453b-branch-1280x720.log`, `logs/453b-branch-1440x900.log` | none owed |
| Applying a plan records the applied changes in history (plan, MODIFIED) | S41, S89 | `tests/test_api.py` `ApiTest.test_apply_snapshots_into_history_and_clears_draft`, `CacheInvalidationTest.test_plan_apply_invalidates_cache`; `tests/test_store.py` `PlanDraftStoreTest.test_apply_snapshots_into_history_and_clears_draft` | `logs/453b-branch-1280x720.log`, `logs/453b-branch-1440x900.log` | none owed |
| The deliverable is a unified 4-parameter schedule built from the active profile plus accepted changes (plan, MODIFIED) | S38, S39, S90 | `frontend/plan.test.js` "buildDeliverable carries current values with provenance…", "buildDeliverable applies accepted picks as…", "buildDeliverable: an accepted pick sets the cell value and provenance", "collapseDeliverable folds adjacent identical rows"; `scripts/check_guidance_plan_contract.mjs` | `logs/453b-branch-1280x720.log`, `logs/453b-branch-1440x900.log` | none owed |

The three plan requirements are MODIFIED only to stop describing hand-edits. The tests named
for them predate #453 and pin the behavior that stays. #453 deleted the hand-edit path and its
tests together. The change has no REMOVED requirement: the surfaces requirement that also
names hand-edits is left to #447, which removes and replaces it in this release.

## Recorded results

Coordinator-run, 2026-09-23 and 2026-09-24:

- **S89 on branch `ba08c8b1`:** `ONLY=S89` passed at 1280x720 and at 1440x900, each
  `# executed 1 · failed 0 · deferred 0 · selected 1` (`logs/453-branch-1280x720.log`,
  `logs/453-branch-1440x900.log`). The coordinator log records "S89 PASS
  both sizes (base passes by design; fail-first node-level)". No base replay leg was run for
  #453. The fail-first obligation is the node test in `frontend/replay-cases.test.js`, which the
  coordinator log does not record a run of. This leg preceded the code-review widenings
  (`2f75c881`, `7f76fa70`, `6c84e052`). The next leg covers S89 again on the widened branch.
- **Ten stories on branch `6c84e052`:** `ONLY=S38,S39,S40,S41,S42,S89,S90,S105,S145,S146`
  passed every story at 1280x720 and at 1440x900, each
  `# executed 10 · failed 0 · deferred 0 · selected 10` (`logs/453b-branch-1280x720.log`,
  `logs/453b-branch-1440x900.log`). The coordinator log records
  "S38-S42,S89,S90,S105,S145,S146 10/10 both sizes".
- **After the last leg:** the coordinator log records `758c1509` as "plan spec MODIFIED x3 +
  Purpose in place; JSDoc-only build change; legs from 6c84e052 stand", then the code review's
  third round as clean.
- **Release trunk:** `TRUNK 0055a5be #453 merged (ledger concat; counts ok)`. At the #451
  merge `25392ade` the coordinator's merge glue records "plan-view #453 2-arg + #451 label".
  At the #457 merge `d237f4d5`, glue commit `adcdb5bc` re-anchored a no-story product test from
  `deliverableHasChanges` (deleted by #453) to `isStageableIsf`. The release's em-dash sweep ran
  its leg on `678fb544`, which contains #453's merge and entered the trunk at `9882bcfe`. That leg
  passed `S4,S42,S142,S153,S178 5/5 both sizes`, so it covers #453's S42 again. Its logs belong
  to the sweep and are not in this folder. No trunk leg re-ran #453's other stories. Final
  trunk: `TRUNK 9882bcfe emdash merged clean (drift 12/12 no regen; fast 1153; port-free OK;
  openspec 90)`.
- The complete ledger at both sizes, the whole backend pytest and the full
  `acceptance.test.py` run once on the commit that is pushed; the pull request records the
  result.

## Renders

None is owed. #453 deletes dead code and moves a replay read, and changes no rendered surface
(the release's render manifest, "What is owed but not produced").

## Logs

Each leg's commit is the one its coordinator run transcript printed first (`prep <tree>
<oid>`, and `prep base-b03431d2 b03431d2` after the `overlay:` lines for a base leg); those
transcripts are not kept in this folder.

| File | Leg | Commit |
| --- | --- | --- |
| `logs/453-branch-1280x720.log` | branch replay `ONLY=S89` at 1280x720 | `ba08c8b1` |
| `logs/453-branch-1440x900.log` | branch replay `ONLY=S89` at 1440x900 | `ba08c8b1` |
| `logs/453b-branch-1280x720.log` | branch replay `ONLY=S38,S39,S40,S41,S42,S89,S90,S105,S145,S146` at 1280x720 | `6c84e052` |
| `logs/453b-branch-1440x900.log` | branch replay `ONLY=S38,S39,S40,S41,S42,S89,S90,S105,S145,S146` at 1440x900 | `6c84e052` |
