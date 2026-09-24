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
- [ ] 4.2 Port-bound, run by whoever can launch a browser (the release
  coordinator), never two port-bound legs at once:
  `PLAYWRIGHT_MODULE=<playwright> TARGET=app VIEWPORT=<size> BASE_URL=http://127.0.0.1:8765 CASE_STORE_DIR=<scratch>/s89-<size> ONLY=S89 node frontend/desk-behavior.replay.mjs`
  at 1280x720 and at 1440x900. Each reports
  `executed 1 · failed 0 · deferred 0 · selected 1`, on the base (which passes
  for the wrong reason) and on the branch. No browser suite is touched. The
  complete ledger runs once, on the integration commit.
