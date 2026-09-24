# #446 implementation checklist

A checked item means implemented and verified. Every test below is synthetic,
none reads real data, and nothing here starts a server or a browser.
`frontend/routes.js` keeps the destination as module state: every node test that
navigates resets it with `navigate('diagnose')` in its `finally`.

## 1. The arrival rule

- [ ] 1.1 Fail first in `frontend/changes-watch-arrival.test.js`, through
  Changes' public `mount`, the way the file already drives it. Keep its two
  existing tests. Add tests for four claims:
  (a) After Stage and Open Plan, with `active_change` then served, an arrival
  with a new `navigation` value and no context reads `/api/verify/trials` and
  none of `/api/plan`, `/api/plan/history` or `/api/pump-settings`.
  (b) With nothing watched, after Stage and Open Plan, an arrival with a new
  `navigation` value and no context renders the concern's frame. It carries
  `data-set="open-plan"` and "Staged", and it is not the Plan.
  (c) A re-mount with the same `navigation` value right after Open Plan still
  renders the Plan.
  (d) While `active_change` is served, a `{ subject: 'plan' }` arrival still
  opens the Plan.
  Rewrite the file's header comment, which says nothing clears the state; it
  must describe the arrival rule instead. Observe (a) and (b) fail on the base
  for that reason: the base reads the Plan's three paths and renders the Plan.
- [ ] 1.2 In the same file, add one desk-level test. Seat the desk through
  `routes.js` `startDesk` and `changes.js` `installChanges` with a stub browser
  and seat, the way the Escape test in `frontend/changes.test.js` does. Press
  Stage and Open Plan, serve `active_change`, then call `navigate('changes')`.
  That is the call the topbar, Diagnose's return and the Focus-pin landing all
  make. Assert that the arrival reads `/api/verify/trials` and not the Plan.
  Observe it fail on the base.
- [ ] 1.3 Implement surfaces **The served active change leads every plain
  arrival to Changes** and the one-visit rule of **Open Plan holds for the visit
  in which it was pressed** in `frontend/changes.js` `mount`. Hold the last seen
  `deps.navigation`. On a new value, clear the Plan-open state before any branch
  runs. That clear is the one place the state is cleared. Delete `watchArrival`,
  its condition and its ADR 429 comment. Write a comment naming ADR 446 and the
  rule. The history and record routes, the explicit Plan arrival and the served
  `draft` and `pending_plan` dispositions keep their places and their order.

## 2. Plan's own Stage

- [ ] 2.1 Fail first, through Changes' public `mount`, in
  `frontend/changes-watch-arrival.test.js`. Stub `window.history` as
  `frontend/diagnose.test.js` does. Serve an eligible concern with nothing
  staged, and arrive with `{ subject: 'plan' }`: the Plan's own frame offers
  Stage change. Press it. Assert that no history entry is written, and that the
  next mount with the same `navigation` value renders the Plan with the staged
  change and Save draft (`data-set="save-draft"`). Observe it fail on the base,
  which writes a `/changes` entry.
- [ ] 2.2 Implement the Stage clause of **Open Plan holds for the visit in which
  it was pressed** in `frontend/plan-view.js` `bind`. The idle frame's Stage keeps
  its Save draft focus target and re-renders in place (`render()`) instead of
  `navigate('changes')`. No other Plan control changes.

## 3. The watched change's Open Plan

- [ ] 3.1 Fail first in `frontend/changes-watch-arrival.test.js`, through
  Changes' public `mount`. Extend the fetch stub so `/api/verify/trials` serves
  an active Trial record. Extend the host so it answers the new control's
  selector. Serve `active_change` with a guidance `draft` that has items: the
  watched Trial's nameplate offers the control. Pressing it writes the explicit
  Plan arrival `/changes?subject=plan`. Serve `active_change` with no `draft` and
  nothing staged or pending: no control renders. Observe the first half fail on
  the base.
- [ ] 3.2 Implement surfaces **A Plan draft stays reachable while a change is
  watched** in `frontend/follow-up.js`. The Trial's and the Focus's nameplate
  `end` renders `<button class="gf-btn" data-action="open-plan">Open Plan</button>`
  after "View change record", only while guidance serves a `draft` with items or
  `planUnderway()` holds. Read both through their existing exports. `bind`
  sends it to `navigate('changes', { subject: 'plan' })`. It reads no admission
  and adds no gate. The Revert to Plan section and its own Open Plan do not
  change.

## 4. Diagnose's return names the watched change

- [ ] 4.1 Fail first in `frontend/diagnose.test.js`, through the harness it
  already uses to render the Changes return. With a served watched Focus and an
  entry from `changes`, the crumb's `[data-action="watch"]` reads "Return to
  Focus". With a served watched Trial, it reads "Return to Trial". Observe the
  Focus half fail on the base.
- [ ] 4.2 Implement surfaces **Diagnose's return names the watched change** in
  `frontend/diagnose.js` `showFocusAction`. The label reads the served watched
  change's kind: "Return to Focus" for `focus`, "Return to Trial" otherwise. The
  handler and its plain `navigate('changes')` do not change.

## 5. Behavior ledger and replay

- [ ] 5.1 Append a section headed `## #446 amendment — 2026-09-23, issue #446` to
  `mockups/harmonic-v2-desktop.behavior.md`, after the last amendment section.
  It quotes this change's sanction line from design.md, cites ADR 446 in
  `openspec/changes/changes-arrival-leads-active/design.md`, and says that no
  existing story is amended or retired. It adds three stories in the ledger's
  STORY format (element, source, lock, data, evidence, status), each citing
  `lock: HV2-15`:
  - S166, on `basal-lower`: Open Plan holds for one visit, before and after a
    Trial begins. The journey runs in one page, never reloaded.
    1. At `/changes?subject=plan` with nothing staged, Stage in the Plan's own
       frame keeps the address and shows the Plan with Save draft focused.
    2. The topbar's Changes shows the staged concern. The reader presses Open
       Plan, goes to Day and comes back by the topbar. Changes shows the concern
       with "Staged", Undo and Open Plan, not the Plan.
    3. Open Plan reopens the Plan with the staged change, and the reader presses
       Record decision.
    4. A synthetic `match` pump read starts a Trial, and a Plan draft is saved
       while it runs.
    5. After a visit to Diagnose, the topbar's Changes lands on the Trial, not the
       Plan, and the Trial's nameplate offers Open Plan.
    6. The reader inspects the Trial's nights in Diagnose. "Return to Trial"
       lands on the Trial.
  - S167, on `basal-lower`: a watched Trial reaches its saved draft. The store
    reaches a Trial through the production routes: the served basal action is
    saved and recorded as a Plan, then a synthetic `match` pump read starts the
    Trial.
    1. With no draft, the Trial's nameplate offers no Open Plan.
    2. With a draft saved while the Trial runs, it offers Open Plan beside "View
       change record". The Revert to Plan section still offers its own control.
    3. Pressing the nameplate's Open Plan lands at `/changes?subject=plan`,
       showing the saved draft unchanged.
    4. Record decision there fails visibly and adds no Plan history record.
    5. The next topbar Changes lands on the Trial.
  - S168, on `c3-focus`: a watched Focus reaches its draft and names its return.
    1. With a Plan draft saved while the Focus runs, the Focus's nameplate Open
       Plan lands at `/changes?subject=plan`, showing the draft.
    2. Diagnose, opened from the Focus's Inspect evidence, offers "Return to
       Focus" and no "Return to Trial".
    3. Pressing it lands on the Focus.

  Leave the frozen header, its inventory line and
  `mockups/sweep/harmonic-v2-desktop/ACCEPTANCE.md` alone: the release
  coordinator owns them.
- [ ] 5.2 Add the three bodies as `C4_STORIES.S166`, `C4_STORIES.S167` and
  `C4_STORIES.S168` in `frontend/c4.replay.mjs`. Every body first reads its
  premises from the production routes and requires them, the way S145 to S147 do:
  - S166: `/api/guidance` serves an eligible basal action and nothing is
    admitted as watched. After the `match` capture, `/api/verify/trials` admits
    an active Trial. The draft is served while the Trial runs.
  - S167: after its route setup and the `match` capture, `/api/verify/trials`
    admits an active Trial, and guidance serves no draft until the story saves
    one.
  - S168: an active Focus is admitted, and the saved draft is served.
  S166 and S167 advance the pump only through `ctx.capturePump('match')`, and
  save their drafts through the Trial's Revert to Plan or through `PUT /api/plan`,
  as S146 does. S167 records its Plan through `PUT /api/plan` and
  `POST /api/plan/apply`, as S147 does. S166 never reloads the page, because a
  reload discards the remembered state it tests. Before its first watched topbar
  arrival, it visits Diagnose, whose read refreshes guidance and the Plan state.
  Register each body exactly once in `frontend/desk-behavior.replay.mjs`
  as an `appOnly('HV2-15', …)` export behind its
  `// STORY:harmonic-v2-desktop:S16n` marker, and in `REGISTRY` as `J()`, the way
  S139 and S140 are registered. Map `S166: 'basal-lower'`, `S167: 'basal-lower'`
  and `S168: 'c3-focus'` in `frontend/replay-cases.mjs` `STORY_CASES`. Both cases
  are already in the PR smoke slice (S14 and S57), so `SMOKE_STORIES` and its
  digest do not move. In `frontend/c4.replay.test.js`, pin that each story is
  registered once with term HV2-15 on its case. Run S168 against a fake page
  shaped like the base, with no nameplate Open Plan and "Return to Trial". It
  must reject at a feature assertion, not at a premise. S166 and S167 advance the
  pump between steps, so their base failure is proved by the coordinator's base
  replay in 5.4.
- [ ] 5.3 In `mockups/sweep/harmonic-v2-desktop/acceptance.py` `inventory()`,
  move the pinned literal to `{"issued": 174, "active": 155, "retired": 19}`. In
  `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`, move the counted
  assertions to 174: the full replay-plan count, the stated active and retired
  inventory, and the same-total guard. The guard's split stays different from the
  real one. Run `python3 mockups/sweep/harmonic-v2-desktop/acceptance.py
  inventory --out <scratch dir>` and record the counts.
- [ ] 5.4 Coordinator, port-bound. Replay `ONLY=S166,S167,S168` on the base with
  this branch's harness laid over it: each fails at a feature assertion. Replay
  the same three on the branch: each passes. Replay
  `ONLY=S38,S39,S45,S45b,S56,S57,S90,S139,S140` on the branch: all pass. Run
  every leg at 1280x720 and 1440x900, and record the results in each new story's
  status line. Capture the five before/after renders design.md lists. The
  coordinator ticks this task; the renders are not committed.

## 6. Verification

- [ ] 6.1 Install with `uv sync --frozen --extra api --extra sync`, then
  `npm ci && npm run build`. Then run the fast gate
  (`node --test 'frontend/**/*.test.js'`),
  `npx --yes @fission-ai/openspec@1 validate --all --strict`,
  `python3 scripts/check_adr_numbers.py`,
  `python3 scripts/check_owned_identifiers.py`,
  `python3 scripts/check_public_allowlist.py`, and
  `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py InventoryProofTest ReplayPlanTest SmokeSelectionTest`.
  All must exit 0. `node docs/scope/446-changes-arrival.repro.mjs` must print
  `/api/verify/trials` for the plain arrival after Open Plan. It must also
  print, for the nothing-watched arrival, a concern frame that offers Open Plan
  and is not the Plan.
