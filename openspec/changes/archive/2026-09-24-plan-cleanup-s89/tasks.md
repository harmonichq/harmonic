# #453 implementation checklist

The one requirement is named by its title in `specs/surfaces/spec.md`.
`design.md` holds ADR 453, the sweep result, the settled ledger wording and the
risk contract. Every value in tests and comments is synthetic. Every timestamp
in a new test predates 2025-07-01, the public scan's span start, and no new
test text carries a unit-suffixed dose (such as "0.5 U").

## 1. Delete the uncalled browser on-pump check

- [x] 1.1 Delete `detectOnPump` and its JSDoc from `frontend/plan.js`. Delete
  its four tests, its import and the "Confirmation B: on-pump detection"
  section heading from `frontend/plan.test.js`. Correct the prose that names the
  check: the `plan.js` module header's "(and the Confirmation-B detection)" and
  "detecting when the deliverable has landed on the pump", and `plan.test.js`'s
  header line "Confirmation-B on-pump detection". The module keeps
  `reconcileDeliverable`, which draws a served mismatch's rows. Leave
  `collapseDeliverable`, `segmentAt`, `PLAN_PARAMS` and every other export
  unchanged; each keeps a production caller.
- [x] 1.2 Prove the deletion leaves no caller and no rendered change. Grep the
  whole tree for `detectOnPump`, excluding only `node_modules`, `frontend/dist`,
  `openspec/changes/archive`, `evidence/` directories and this change's own
  directory, `openspec/changes/plan-cleanup-s89/`. The only match is
  `openspec/changes/harmonic-v2/contracts.md`, which stays as history
  (design.md). Build the shell with `npm run build` on base b03431d2 and on the
  branch. The sha256 of `frontend/dist/index.html` and of every
  `frontend/dist/assets/*` file are identical. Report both hash lists to the
  coordinator.

## 2. S89 certifies the decision it recorded

- [x] 2.1 Fail first. Add one test to `frontend/replay-cases.test.js`, named
  `S89 certifies the newest Plan record as the decision it recorded`. It drives
  `C2_STORIES.S89` on a stateful fake page in the manner of that file's
  draft-retry (S40) test, adapting the fake in
  `docs/scope/453-s89-history-order.repro.mjs`. The fake serves `/api/plan`,
  `/api/plan/history` (newest first) and `/api/pump-settings`. Its
  `ctx.failNext(method, path)` fails the next matching write once, and
  `[data-set="retry-save"]` performs the failed write. The test covers the
  requirement's four scenarios, and pins each rejection to the named check:
  - an older never-withdrawn Plan already listed: S89 resolves;
  - an older withdrawn Plan listed, with the fake dropping the new decision's
    withdrawal: S89 rejects at "Plan reloaded withdrawal";
  - the fake listing the new decision after the older Plan: S89 rejects at
    "Plan durable decision";
  - no earlier Plan, with the fake writing two rows for one recording: S89
    rejects at "Plan durable decision".
  Bound every rejection with `withReplayAssertionTimeout`, as the S37b and S61
  tests do. Run the new test against the base S89 before 2.2 and record that it
  fails. `node docs/scope/453-s89-history-order.repro.mjs` on the base prints
  B FAIL at "Plan reloaded withdrawal", C PASS, D PASS, and E FAIL at "Plan
  reloaded withdrawal", so every case of the test fails on the base body.
- [x] 2.2 Implement surfaces **The Plan lifecycle replay certifies the decision
  it recorded** in `planPersistence` (`frontend/c2.replay.mjs`). The "Plan
  durable decision" assertion reads the served history's first record, and in
  the same attempt asserts two things: the history holds exactly one more record
  than the `history` read taken before recording, and the first record's
  `applied_at` names none of that read's records. The "Plan failed withdrawal
  history" assertion reads the first record too. Nothing else in S89 changes:
  its draft path, reloads, pump read, wait names and the reload check that finds
  by `applied_at` stay. Task 2.1's test passes, and the reproduction prints
  A PASS, B PASS, C FAIL at "Plan reloaded withdrawal", D FAIL at "Plan
  durable decision" and E FAIL at "Plan durable decision".
- [x] 2.3 Re-run the sweep grep from design.md over `frontend/`,
  `mockups/sweep/` and `tests/` for last-index reads of `history`, `focuses`,
  `trials` or `records`. It returns nothing.

## 3. Behavior ledger

- [x] 3.1 Append design.md's settled `## #453 amendment — 2026-09-23` section,
  byte for byte, at the end of `mockups/harmonic-v2-desktop.behavior.md`. Add no
  line beginning `S89 ·` or any other story id. Edit no ★ FROZEN block, header
  inventory line or ACCEPTANCE.md sentence.
- [x] 3.2 `python3 mockups/sweep/harmonic-v2-desktop/acceptance.py inventory
  --out <fresh scratch dir>` prints
  `ledger inventory: {'issued': 171, 'active': 152, 'retired': 19}` and
  `ledger=171 registry=171 missing=[] extra=[]`.

## 4. Verification

- [x] 4.1 Port-free, on the commit to be integrated, each command run on its own:
  `node --test 'frontend/**/*.test.js'` (fail 0);
  `node --test frontend/plan.test.js frontend/replay-cases.test.js` (pass 83,
  fail 0: 63 and 20);
  `node scripts/check_guidance_plan_contract.mjs`;
  `npx --yes @fission-ai/openspec@1 validate --all --strict`;
  `python3 scripts/check_adr_numbers.py`;
  `python3 scripts/check_owned_identifiers.py`;
  `python3 scripts/check_public_allowlist.py`;
  `t=$(mktemp -d) && python3 scripts/build_public_tree.py "$t" && python3 scripts/check_public_links.py "$t" && python3 scripts/scan_public_tree.py "$t"`
  (0 findings);
  `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py ReplayPlanTest InventoryProofTest SmokeSelectionTest`.
- [x] 4.2 Port-bound, run by whoever can launch a browser (the release
  coordinator), never two port-bound legs at once:
  `PLAYWRIGHT_MODULE=<playwright> TARGET=app VIEWPORT=<size> BASE_URL=http://127.0.0.1:8765 CASE_STORE_DIR=<scratch>/s89-<size> ONLY=S89 node frontend/desk-behavior.replay.mjs`
  at 1280x720 and at 1440x900. Each reports
  `executed 1 · failed 0 · deferred 0 · selected 1`, on the base (which passes
  for the wrong reason) and on the branch. No browser suite is touched. The
  complete ledger runs once, on the integration commit.
  Coordinator run, 2026-09-23: `ONLY=S89` on the branch at ba08c8b1 reported
  `executed 1 · failed 0` at 1280x720 and at 1440x900; task 6.5's run covers
  S89 again on the widened branch.

## 5. Coordinator-authorized widening — 2026-09-23 (code review round 1, F1)

Sanction: Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself
from here"); coordinator ruling on #453's code review, round 1. design.md
records the decision under ADR 453.

- [x] 5.1 Reduce `reconcileDeliverable` in `frontend/plan.js` to what its one
  shipped caller reads: `(deliverableRows, detectedSegments)` returning
  `{ groups }`. Delete `state`, `matchedAt`, the `fetchedAt` and
  `hasCommittedPlan` parameters, the first-Plan branch and the module-private
  `deliverableIsProposal`, which loses its only caller. Rewrite the
  `#94 RECONCILE` banner and the function's JSDoc to describe what remains.
- [x] 5.2 Update every live caller: `frontend/plan-view.js` drops the third
  argument; `scripts/check_guidance_plan_contract.mjs` compares on an empty
  `groups`. Grep the whole tree, including `mockups/` and `scripts/`. The
  remaining readers of the old fields are the unloadable locked prototype, its
  exploration brief, #431's triage reproduction and `openspec/changes/harmonic-v2/`,
  all left as history (design.md).
- [x] 5.3 `frontend/plan.test.js` tests `groups` only through
  `reconcileDeliverable`, and drops the six first-Plan branch tests.
  `node --test frontend/plan.test.js` reports 57 pass, 0 fail, so task 4.1's
  pair now reports pass 77, fail 0 (57 and 20).
- [x] 5.4 Show the build changes only by removal: diff the unminified desk chunk
  built before and after, and compare old and new `groups` over synthetic inputs
  in the shipped call shape. This supersedes task 1.2's byte-identical hashes for
  the branch as a whole.
- [x] 5.5 Port-bound: covered by task 6.5's run, which selects every story this
  widening touches.

## 6. Coordinator-authorized widening — 2026-09-23 (code review round 1, F2–F4)

Sanction: Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself
from here"); coordinator ruling on #453's code review, round 1. design.md
records the decision under ADR 453.

- [x] 6.1 Grep the whole tree (`frontend/`, `mockups/`, `scripts/`, `tests/`)
  for callers that pass `edits` or call `isDeliverableEditRevert`: there are
  none. Delete the hand-edit path from `frontend/plan.js`: `buildDeliverable`'s
  `edits` parameter and `edited` override; the `edits` parameter of
  `planFamilyState` and `assertSinglePlanFamily` with `editParam` and
  `planParamFamily`, which lose their only caller; `isDeliverableEditRevert`;
  and `collapseDeliverable`'s provenance promotion, survivor clone and #462
  comment. Correct the module prose that describes hand-edits.
- [x] 6.2 `frontend/plan.test.js` drops the thirteen tests of that path and the
  `planParamFamily` assertions. The I:C disagreeing-members test serves the
  disagreement in the accepted items instead of a hand-edit.
  `node --test frontend/plan.test.js` reports 44 pass, 0 fail, so task 4.1's
  pair now reports pass 64, fail 0 (44 and 20).
- [x] 6.3 F4: `frontend/plan-view.js`'s header names what `plan.js` owns for the
  desk only, without "for v1 and v2 alike".
- [x] 6.4 Show the build changes only by removal: diff the unminified desk chunk
  against the section 5 build, and compare old and new outputs of every live
  entry point over synthetic inputs in the shipped call shape.
- [x] 6.5 Port-bound, run by the release coordinator, never two port-bound legs
  at once: task 4.2's command with
  `ONLY=S38,S39,S40,S41,S42,S89,S90,S105,S145,S146` at 1280x720 and at
  1440x900, each reporting `executed 10 · failed 0 · deferred 0 · selected 10`
  on the base and on the branch. Passing it also ticks 4.2 and 5.5.
  Coordinator run, 2026-09-23: the ten-story selection on the branch at
  6c84e052 (whose desk bundle differs from the final head only in one JSDoc
  comment) reported `executed 10 · failed 0 · selected 10` at 1280x720 and at
  1440x900.

## 7. Coordinator-authorized widening — 2026-09-23 (code review round 1, F5)

Sanction: Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself
from here"); coordinator ruling on #453's code review, round 1. design.md
records the decision and the export table under ADR 453.

- [x] 7.1 Enumerate every export of `frontend/plan.js` and search `frontend/`,
  `mockups/`, `scripts/`, `tests/` and `docs/kb/` for each. Record the export
  table in design.md.
- [x] 7.2 Delete every export with no live, non-test caller, with its tests:
  `PLAN_FAMILY_LABEL`, `filterPlanItemsToFamily`,
  `normalizePlanItemsToSingleFamily`, `acceptedChips` (with its `edited` flag
  and the module header's chip layer) and `deliverableHasChanges`. No private
  helper loses its last caller.
- [x] 7.3 Rewrite `normalizeIcBlockProvenance`'s draft-save paragraph to what it
  does now. `node --test frontend/plan.test.js` reports 37 pass, 0 fail, so
  task 4.1's pair now reports pass 57, fail 0 (37 and 20).
- [x] 7.4 The desk chunk changes only in that paragraph's JSDoc text: none of the
  deleted exports was in the bundle. No replay story beyond task 6.5's ten is
  owed.

## 8. Coordinator-authorized widening — 2026-09-23 (code review round 2, F6 and F7)

Sanction: Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself
from here"); coordinator ruling on #453's code review, round 2. design.md
records the decision under ADR 453.

- [x] 8.1 F6: the comments in `frontend/plan.js` (`effectivePlanItems`),
  `frontend/plan-view.js` (`saveDraft`) and the `frontend/plan.test.js` section
  heading say the draft saves the effective plan and recording the decision
  copies it into Plan history, not that "confirmation" records it.
- [x] 8.2 F7: `specs/plan/spec.md` carries MODIFIED deltas for the draft, apply
  and deliverable requirements without hand-edits, and the plan spec's Purpose
  is corrected in place. The surfaces requirement "Plan surface asks…" is left
  to #447. `npx --yes @fission-ai/openspec@1 validate --all --strict` passes.
- [x] 8.3 Expectations amended by the coordinator for the widened branch.
  Expectation 2 (`node --test frontend/plan.test.js frontend/replay-cases.test.js`)
  reports pass 57, fail 0 (plan.test.js 37, replay-cases.test.js 20), not 83.
  Expectation 4 (byte-identical shell) is replaced by a removal-only build diff
  (tasks 5.4, 6.4 and 7.4).

## 9. Record changes after the lock's pin

- [x] 9.1 The lock pinned this change at 22b9aa75. Every later edit to the
  change's own records (design.md, proposal.md, tasks.md, specs/) and to the
  plan spec's Purpose — commits ba08c8b1, 2f75c881, 7f76fa70, 6c84e052,
  758c1509 and the commit that ticks this task — is coordinator-authorized
  under the Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself
  from here"): the plan-review round 2 note and the code review rulings of
  rounds 1 and 2. The coordinator posts the tracker note at finalize.
