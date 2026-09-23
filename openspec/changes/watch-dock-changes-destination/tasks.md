# #429 implementation checklist

A checked item means implemented and verified. Every test below is synthetic;
none reads real data, and nothing here starts a server.

## 1. The dock's words and route token

- [ ] 1.1 Fail first in `frontend/watched-change-dock.test.js`. Expect
  `{ label: 'Open Changes', to: 'changes' }` from the Trial and the Focus states,
  and a Focus detail that flattens to exactly
  `Pinned 08-04 · adherence and outcome are read in Changes` for the existing
  fixture. Assert that no state's kind, title, flattened detail or route label
  contains "Verify", looping over every state the view returns. Run it on the base and
  observe it fail for the right reason: the view returns `'Open Verify'` /
  `'verify'` and "read on Verify".
- [ ] 1.2 Implement surfaces **The watch dock names Changes for a watched Trial
  or Focus** in `frontend/watched-change-dock.js`: change both routes and the
  Focus detail. Rewrite the comments above the Trial day clamp and the Focus
  detail so they name Changes and describe only what Changes renders: Changes'
  Trial progress bar clamps its value to the requirement. Claim no "N of N" text
  Changes does not print. Retitle and reword the clamp test in
  `frontend/watched-change-dock.test.js` the same way. This task edits no other
  state and no kind label, Trial title or Trial maturity line.

## 2. Landing on the watched record

- [ ] 2.1 Fail first in a new file, `frontend/changes-watch-arrival.test.js`,
  in its own process because Changes' open-Plan flag is module state that would
  leak into `frontend/changes.test.js`. Drive Changes' public `mount` the way
  `frontend/changes.test.js` does: serve an eligible concern, press its Stage
  and then its Open Plan, then serve `active_change`. Assert three things.
  (a) An arrival with `{ subject: 'watch' }` reads the follow-up's active record
  (`/api/verify/trials`). (b) An arrival with `{ subject: 'plan' }` does not.
  (c) With no active change served, an arrival with `{ subject: 'watch' }`
  renders the same frame as an arrival with no context. Observe (a) fail on the
  base.
- [ ] 2.2 Implement surfaces **The watch dock opens Changes on the watched Trial
  or Focus** in `frontend/changes.js` `mount`: the watch arrival skips only the
  client-local open-Plan preemption, and only while the served disposition is
  `active_change`. The history and record routes, the explicit `plan` route and
  the served draft and pending-Plan dispositions keep their places, and no other
  arrival changes.
- [ ] 2.3 In `frontend/diagnose.js`, make Diagnose's `go` callback turn the
  token `changes` into a Changes arrival with `{ subject: 'watch' }`, and leave
  `plan` as it is. Pin both in `frontend/diagnose.test.js` through the
  `createView` callbacks, with a stubbed `window.history`: `go('changes')` writes
  `/changes?subject=watch` and `go('plan')` writes `/changes?subject=plan`.
  Observe the first fail on the base, which writes `/changes`.

## 3. Behavior ledger and replay

- [ ] 3.1 Append a section headed `## #429 amendment — 2026-09-23, issue #429`
  to `mockups/harmonic-v2-desktop.behavior.md`. It quotes both sanction lines
  from this change's design.md, says no existing story is amended or retired,
  and adds these stories in the ledger's STORY format (element, source, lock,
  data, evidence, status):
  - S139, for a watched Trial: the dock's link reads "Open Changes ›", no dock
    text names Verify, and the link lands on Changes at
    `/changes?subject=watch` showing the served Trial's own view. It cites
    `lock: HV2-12`.
  - S140, the same for a watched Focus, including its detail line.

  Move the ledger header's inventory line to `149 issued · 130 active · 19
  retired`, and the current-inventory sentence in
  `mockups/sweep/harmonic-v2-desktop/ACCEPTANCE.md` to match. Leave historical
  inventory statements as written.
- [ ] 3.2 Add both stories' bodies as `C4_STORIES.S139` and `C4_STORIES.S140`
  in `frontend/c4.replay.mjs`. Each body first reads the served admission from
  `/api/verify/trials` and requires the active kind as a premise. It opens
  Diagnose, reads the dock in `.inspector > .watch`, and requires the watched
  state, the route text exactly `Open Changes ›`, and no "Verify" in the dock's
  text; S140 also requires the Focus detail line. It then activates the dock's
  link and requires that the address parses (`parseRoute`) to Changes with
  subject `watch`, and that `.gf-stage-trial` (S139) or `.gf-stage-focus`
  (S140) is visible. For S139, the Trial's stage title must also carry the
  admitted Trial's slot.
  Register each one exactly once in `frontend/desk-behavior.replay.mjs`, as an
  `appOnly('HV2-12', …)` export behind its `// STORY:harmonic-v2-desktop:S13n`
  marker, and in `REGISTRY` as `['S139', S139, J()]` and `['S140', S140, J()]`,
  the way S113–S117 are registered. `openApp` refuses any state other than
  `investigate` for a story outside C2_STORIES, C3_STORIES and C4_RETIREMENTS,
  so S45's `M('active')` must not be copied. Map `S139: 'c3-trial'` and `S140: 'c3-focus'` in
  `frontend/replay-cases.mjs` `STORY_CASES`. In `frontend/c4.replay.test.js`,
  pin that each story is registered once with term HV2-12 on its case. Also run
  each body against a fake page whose dock reads `Open Verify ›`, and require it
  to reject at the label assertion rather than at a premise.
- [ ] 3.3 In `mockups/sweep/harmonic-v2-desktop/acceptance.py` `inventory()`,
  move the pinned literal to `{"issued": 149, "active": 130, "retired": 19}`.
  In `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`, move the counted
  assertions to 149: the full replay-plan count, the stated active/retired
  inventory, and the same-total guard. The guard's split stays different from
  the real one.
- [ ] 3.4 Coordinator, port-bound: replay `ONLY=S139,S140` on the base with this
  harness laid over it, where both fail at the label assertion. Replay the same
  two on the branch, where both pass, at 1280x720 and 1440x900. Replay
  `ONLY=S45,S45b,S56,S57` on the branch at both sizes to show the Changes
  landings are preserved. Record the results in each story's status line.
  Then capture the dock (`.inspector > .watch`) on the `c3-trial` and `c3-focus`
  case stores at 1280x720 and 1440x900, from the base and from the branch, as
  revision evidence in the release pull request. The replay's own captures
  cannot stand in for these: base S139 and S140 fail before capture, and the
  branch captures the Changes landing, not the dock. Each branch render must show
  the detail line wrapped inside the dock's reserved height, never ellipsized.
  The coordinator ticks this task; these renders are not committed.

## 4. Verification

- [ ] 4.1 After `uv sync --frozen --extra api --extra sync` and `npm ci` (the
  replay graph imports `@babel/parser`), run the fast gate (`node --test 'frontend/**/*.test.js'`),
  `npx --yes @fission-ai/openspec@1 validate --all --strict`, the three
  `scripts/check_*.py` guards, and the port-free classes of
  `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`
  (`InventoryProofTest ReplayPlanTest SmokeSelectionTest`). All exit 0.
