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
  `guidance.schedule_matches` and `guidance.plan_deliverable`. `_reconcile_plan`'s
  matching is unchanged.
- [ ] 1.4 Implement plan **Every recorded Plan serves one verdict** as one
  read-only function in `ciq_autotune/watched_change.py`, served on every
  `/api/plan/history` row inside its existing query-only transaction and on the
  guidance payload's `pending_plan`.
- [ ] 1.5 Backend tests in `tests/test_plan_verdict.py`, through `create_app`'s
  routes and `reconcile_ingested_follow_up` on stores built by
  `scripts/qa_e2e_cases.py` (the `basal-raise` recipe, as in
  `docs/scope/431-plan-state-repro.py`), one per scenario of the three plan
  requirements. Build Plans recorded without a captured schedule, and older
  history, through `Store.save_plan_draft` and `Store.apply_plan`. Assert served
  output built from reads, never a hand-set receipt. Show each failing on the
  base before it passes.
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
  confirmed Plan reads Draft saved with Save draft and Record decision; with two
  served records the Decision block names the newest.
- [ ] 2.4 `frontend/replay-pump.py` gains an `in-place` capture: the recorded
  Plan's deliverable on the unchanged active profile, no profile switch, then
  reconciliation. `mismatch` and `match` are unchanged.
- [ ] 2.5 Replay contract: C2's S42 body reads "On pump since"; S105's premise
  also asserts the served confirmation; add S145 (an `in-place` capture confirms
  the recorded Plan on the server, Changes reads "On pump since" that read, and
  a second `in-place` capture leaves the time unchanged) and S146 (a differing
  draft after a confirmed Plan reads Draft saved, offers Record decision and
  names the confirmed Plan on its own line), both on the `basal-lower` case.
  Register both, write their ledger entries and a dated #431 amendment under the
  frozen header quoting the Q2 sanction, and move the inventory to 149 issued,
  130 active, 19 retired in the ledger, `acceptance.py` `inventory()` and
  `acceptance.test.py`. Update `tests/test_api.py`'s comment that still quotes
  "on pump as of".

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
- [ ] 3.4 Unit tests, each failing on the base first:
  `frontend/watched-change-dock.test.js` (a pending Plan with nothing watched
  does not read idle; pending and mismatch details; Trial and Focus outrank the
  Plan; the Plan outranks a staged draft; both Plan states route to `plan`) and
  `frontend/focus-entry.test.js` (a pending Plan gives no header context; the
  active Trial and Focus contexts are unchanged).
- [ ] 3.5 Rewrite `frontend/desk.browser.test.mjs`'s pending-Plan test at both
  desktop sizes: with served guidance carrying a pending Plan and its verdict, a
  Pattern case's header shows no pending-Plan note and the watch panel shows the
  Plan with "Open Changes ›".
- [ ] 3.6 Replay contract: add S147 on the `basal-lower` case, which serves both
  a basal action and Pattern rows: after a Plan is recorded, the watch panel
  reads the same "Plan · awaiting pump" state in two windows, a selected Pattern
  case's header carries no pending-Plan note in either window (the base shows
  one), and "Open Changes ›" lands on Changes at `subject=plan`. Add its ledger
  entry, extend the #431 amendment with the moved note, and move the inventory to
  150 issued, 131 active, 19 retired in the ledger, `acceptance.py` and
  `acceptance.test.py`.
