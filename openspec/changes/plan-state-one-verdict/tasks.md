# #431 implementation checklist

Requirements are named by their titles in `specs/plan/spec.md` and
`specs/surfaces/spec.md`; `design.md` holds the ADRs, the settled wording and
the risk contract. Every value in tests and comments is synthetic.

## 1. Server confirmation and verdict (backend)

- [ ] 1.1 `Store.save_follow_up_record` accepts an available Plan reconciliation
  whose `trial_id` is null when its `applied_at` names that Plan. A non-null
  `trial_id` on a Plan receipt must still name an existing Trial, and a Trial's
  receipt must still name itself. Test through `save_follow_up_record` inside a
  follow-up transaction: the null-Trial Plan receipt saves; a Plan receipt naming
  a missing Trial and a Trial receipt with a null Trial are still refused.
- [ ] 1.2 Implement plan **Only the newest recorded Plan can be pending** in
  `watched_change.pending_plan`. The apply and withdraw routes and
  `follow_up_admission` keep reading that one predicate.
- [ ] 1.3 Implement plan **The server confirms a pending Plan from a matching
  pump read** in `reconcile_follow_up`, after the per-Trial pass, reusing
  `guidance.schedule_matches` and `guidance.plan_deliverable`. A Plan with any
  item lacking an integer `start_min` or a numeric `value` is incomparable: it is
  never confirmed, and neither the reconciler nor the verdict raises on it.
  `_reconcile_plan`'s matching is unchanged.
- [ ] 1.4 Implement plan **Every recorded Plan serves one verdict** as one
  read-only function in `ciq_autotune/watched_change.py`, served on every
  `/api/plan/history` row inside its existing query-only transaction and on the
  guidance payload's `pending_plan`.
- [ ] 1.5 Backend tests in `tests/test_plan_verdict.py`, through `create_app`'s
  routes and `reconcile_ingested_follow_up` on stores built by
  `scripts/qa_e2e_cases.py` (the `basal-raise` recipe, as in
  `docs/scope/431-plan-state-repro.py`), one per scenario of the three plan
  requirements. Build Plans recorded without a captured schedule, and older
  history, through `Store.save_plan_draft` and `Store.apply_plan`. One test
  records an incomparable Plan that way (an item with no `start_min`) and drives
  it through `reconcile_ingested_follow_up`, `/api/plan/history`,
  `/api/guidance` and the withdraw route. One reads a holding read before any
  reconciliation and asserts `pending`, never `confirmed`. Assert served output
  built from reads, never a hand-set receipt. Every test asserting changed
  behavior is shown failing on the base first; the guard tests (1.1's two
  refusals, "a read from before the decision never confirms", "a latest read that
  differs keeps the Plan pending") are shown passing on the base.
- [ ] 1.6 `CONTEXT.md`, under **Plan**: a recorded Plan is pending until it is
  confirmed (by its matched Trial or by a later pump read that holds its
  schedule), withdrawn, or superseded by a newer recorded Plan; name the
  synonyms to avoid.

## 2. Changes reads the verdict (frontend)

- [ ] 2.1 Implement surfaces **Changes states a Plan's phase from its served
  verdict** in `frontend/plan-view.js`: the recorded Plan is the first served row
  that is neither withdrawn nor superseded; phase, status and the On pump field
  come from its verdict; the planned-versus-pump rows are drawn only under a
  served `mismatch`; no shown time comes from the browser's comparison.
- [ ] 2.2 Implement surfaces **Changes keeps a recorded Plan apart from a newer
  draft** in `frontend/plan-view.js`, keeping the Decision block labels S41 reads
  ("Draft saved", "Decision recorded", "On pump").
- [ ] 2.3 Unit tests in `frontend/plan-actions.test.js` (and
  `frontend/plan-view.test.js` where a pure export changes), through `mount` and
  `phase` over stubbed served reads, each failing on the base first: a
  server-pending Plan with a matching detected profile reads Pending; the On
  pump time stays on `confirmed_at` after a later read; a confirmed Plan with
  `on_pump` false reads Confirmed; a draft saved during a pending Plan stays out
  of its fields and shows the next-change line; a differing draft after a
  confirmed Plan reads Draft saved with Save draft and Record decision; a
  confirmed Plan with no newer draft offers "View change record" and no
  Withdraw; with two served records the Decision block names the newest.
- [ ] 2.4 `frontend/replay-pump.py` gains an `in-place` capture: the recorded
  Plan's deliverable on the unchanged active profile, no profile switch, then
  reconciliation. `mismatch` and `match` keep their captures. The producer reads
  the served history's first (newest) Plan record, not its last.
- [ ] 2.5 Replay contract: C2's S42 body reads "On pump since" and reads the
  newest history record (the first served), not the last; S105's premise also
  asserts the served confirmation, and its "View change record" now comes from
  the confirmed frame; add S145 (an `in-place` capture confirms the recorded
  Plan on the server, Changes reads "On pump since" that read, and a second
  `in-place` capture leaves the time unchanged; its first confirmation check
  reads the newest history row's `verdict?.state` together with the Changes
  status in one assertion, written so a base history row with no `verdict` does
  not throw) and S146 (a differing
  draft after a confirmed Plan reads Draft saved, offers Record decision and
  names the confirmed Plan on its own line), both on the `basal-lower` case.
  Register both, write their ledger entries in a dated `## #431 amendment —
  2026-09-23` section quoting the Q2 sanction (no existing `★ FROZEN` block is
  rewritten, re-dated or replaced; amendments to S42 and S105 are written
  `Amended S42 · 2026-09-23 · #431 / Q2 sanction: …`, never as a line beginning
  `S42 ·`), and move the inventory literals to 149 issued, 130 active, 19
  retired: `acceptance.py` `inventory()`, and in `acceptance.test.py` the
  replay-plan `plan['count']`, the stated-inventory ranges (S1–S130 plus R1–R19)
  and the same-total ids (S1–S131 plus R1–R18, still 149), so "same total,
  different split" keeps its meaning. The header's inventory line and
  ACCEPTANCE.md's count sentence are left to the release coordinator. Each new
  story's base proof runs this branch's replay harness and `replay-pump.py` over
  a4d374a7: S145 must fail at its served-verdict and Changes agreement
  assertion; S146's unreachable confirmed premise is accepted as its base
  failure, with task 2.3's unit test as its fail-first half. Update
  `tests/test_api.py`'s comment that still quotes "on pump as of".

## 3. Watch panel and case-file header (frontend)

- [ ] 3.1 Implement surfaces **The watch panel carries a recorded Plan awaiting
  the pump** in `frontend/watched-change-dock.js`: `watchDockView` takes the
  served pending Plan; the Plan state and its two details; the staged-draft
  route reads "Open Changes"; both Plan states route to `plan`.
- [ ] 3.2 `frontend/diagnose-workstation.js` paints the watch panel with the
  guidance read's served pending Plan, passed through `frontend/diagnose.js`'s
  workstation callbacks, and repaints when that read lands. The `plan` route
  keeps landing on Changes at `subject=plan`.
- [ ] 3.3 Implement surfaces **The case-file header carries no pending-Plan
  note**: `frontend/focus-entry.js` gives the header no context for a pending
  Plan, and `frontend/guidance.js` drops its now-unread `pending_plan` copy.
- [ ] 3.4 Unit tests: `frontend/watched-change-dock.test.js` (a pending Plan
  with nothing watched does not read idle; pending and mismatch details; Trial
  and Focus outrank the Plan; the Plan outranks a staged draft; both Plan states
  route to `plan`) and `frontend/focus-entry.test.js` (a pending Plan gives no
  header context; the active Trial and Focus contexts are unchanged). Tests of
  changed behavior are shown failing on the base first; the precedence and
  unchanged-context guards are shown passing on the base.
- [ ] 3.5 Rewrite `frontend/desk.browser.test.mjs`'s pending-Plan test at both
  desktop sizes, keeping "pending Plan" in its title so the filtered leg
  `--test-name-pattern "pending Plan"` matches exactly its two sizes (`pass 2`):
  with served guidance carrying a pending Plan and its verdict, a
  Pattern case's header shows no pending-Plan note and the watch panel shows the
  Plan with "Open Changes ›".
- [ ] 3.6 Replay contract: add S147 on the `pattern-near-tie` case, which serves both
  a recordable basal action and a Pattern case that loads in both windows (every
  `basal-lower` Pattern case file answers 404; coordinator amendment, 2026-09-23). After a Plan is recorded, it first selects a
  Pattern case in each of two windows and checks that the case-file header
  carries no pending-Plan note (the base shows one), and only then checks that
  the watch panel reads the same "Plan · awaiting pump" state in both windows
  and that "Open Changes ›" lands on Changes at `subject=plan`. The header
  check precedes every watch-panel check because the base panel has no Plan
  state, and a panel-first story would fail at the panel. Add its ledger
  entry to the #431 amendment section, record the moved note there, and move the
  inventory literals to 150 issued, 131 active, 19 retired: `acceptance.py`
  `inventory()`, and in `acceptance.test.py` the replay-plan `plan['count']`,
  the stated-inventory ranges (S1–S131 plus R1–R19) and the same-total ids
  (S1–S132 plus R1–R18, still 150). The header's inventory line and
  ACCEPTANCE.md's count sentence stay with the release coordinator. S147's base
  proof runs this branch's replay harness over a4d374a7 and must fail on the
  pending-Plan note present in the `pattern-near-tie` Pattern case's header.
