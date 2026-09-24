# #453 Plan cleanup: no browser on-pump check, and S89 certifies its own decision

## Status

**Triage source for #453.** An ordinary ticket change, grounded on 2026-09-23
against `origin/main` b03431d2 with synthetic data only. It changes no rendered
surface: the built shell changes only by losing dead code. It
amends one story's evidence in the desk's frozen behavior ledger
(`mockups/harmonic-v2-desktop.behavior.md`) under the release's Q3 delegation
(coordinator ruling R453, "as the issue's checklist").

## Why

Two things were left over from moving the Plan verdict to the server (#431).
Neither changes what a reader sees today.

- `detectOnPump` in `frontend/plan.js` still decides in the browser whether the
  pump holds a recorded Plan. Since #431 the server serves that verdict, and
  surfaces read it without deciding it (CONTEXT.md **Plan**; the surfaces
  requirement "Changes states a Plan's phase from its served verdict"). Nothing
  in the shipped desk calls the function, including `frontend/index.html`. Its
  only callers are four tests in `frontend/plan.test.js`. A production build
  with it deleted is byte-identical to the base build.
- The desk ledger's Plan lifecycle story, S89 (`planPersistence` in
  `frontend/c2.replay.mjs`), reads the decision it just recorded as the **last**
  Plan history record. The server lists that history newest first (the plan
  requirement on served verdicts; `tests/test_plan_verdict.py`
  `test_history_keeps_serving_newest_first`), so the last record is the
  **oldest**. S89 runs on the `basal-lower` case store, where no QA recipe
  writes Plan history, so the story's store holds only the decision it records.
  The two reads name the same row, and S89 passes without showing which record
  it certified.

The committed reproduction `docs/scope/453-s89-history-order.repro.mjs` drives
the tree's S89 on a fake page that serves Plan history newest first. On the
base it prints:

- A, no earlier Plan: PASS.
- B, an older never-withdrawn Plan already listed: FAIL at "Plan reloaded
  withdrawal". S89 took the older row for its decision.
- C, an older withdrawn Plan listed while the fake drops the new decision's
  withdrawal: PASS. The older row's withdrawal satisfied the check.
- D, history served oldest first: PASS.
- E, no earlier Plan while recording writes two rows: FAIL at "Plan reloaded
  withdrawal".

A body that reads the newest record and proves it is new prints A PASS, B PASS,
C FAIL at "Plan reloaded withdrawal", D FAIL at "Plan durable decision" and
E FAIL at "Plan durable decision". design.md records what each identity clause
adds.

The sweep of every replay module found no other story that reads a newest-first
served list at its last index. The newest-first lists are Plan history and the
Focus and Trial rosters on `/api/focus` and `/api/verify/trials`. Every other
reader takes the first record or finds a record by its identity (design.md).

## What changes

- `detectOnPump` and its four tests are deleted, together with the comments that
  describe on-pump detection as part of the Plan module. No other `plan.js`
  export loses its last caller.
- S89 reads the decision it recorded as the first served Plan history record. In
  the same check it proves that record is the decision just recorded: the
  history grew by exactly one, and that record's `applied_at` names none of the
  records served before recording. The failed-Withdraw check reads that same
  first record.
- A failing-first fake-page test in `frontend/replay-cases.test.js` drives S89
  through histories B, C, D and E.
- A dated `#453 amendment` in the behavior ledger records S89's strengthened
  evidence. The story text, its lock term and the inventory are unchanged.
- Widened by the coordinator on 2026-09-23 after code review (design.md):
  `reconcileDeliverable` keeps only the mismatch rows Changes draws. Its unread
  `state` and `matchedAt`, its first-Plan branch and `deliverableIsProposal` are
  deleted, and the guidance Plan contract check compares on the rows.

## What does not change

The server's Plan verdict, the Plan history order, reconciliation, staging, and
any line a reader sees. No story is added or retired. No ★ FROZEN block or
inventory line is edited. No served payload, analyzer, cap, floor or staging
predicate moves.
