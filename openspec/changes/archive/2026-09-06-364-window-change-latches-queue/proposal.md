# Keep the Findings queue reachable when a window change leaves a drilled Finding behind (#364)

## Why

Drill into a Finding on Diagnose, then press a different window preset. If that
Finding has no inspectable member in the new window, the server answers the
case-file request `404 finding_unavailable` — its documented answer for "a valid
Finding with no attributed member in this projection/window". The workstation
treats that case-level answer as a failure of the *window's whole findings
generation*: it records the window key in `failedKey`, and every level then
short-circuits to

    Findings unavailable for 06:00–12:00. Choose another window to try again.

The reader cannot get out. Clicking the `Findings` breadcrumb pops the level but
repaints the same message with zero queue rows; Escape does nothing. Only
pressing a window preset again — even the same one — clears the flag, and the
queue then renders correctly, which is the proof that the window's rows were in
hand the whole time.

Reproduced on the qa-e2e showcase (port 8802, `24 h` → row `Over-treated low` →
`Morning`): the only failed request in the run is the case-file 404. The
preparation request for `06:00–12:00` returned 200, and re-pressing Morning
renders that window's real result, `No pattern or setting asserts a direction in
this window. Watching · 1 read`.

This violates the `surfaces` capability, requirement **"Diagnose renders Finding
case files without browser-owned policy"**, on two counts:

- "An active failed request preserves the last internally consistent queue,
  Inspector, and canvas while showing the structured error." The queue is not
  preserved; it is replaced by the failure message.
- "Initial load failure, queue-level refresh failure, case failure after refresh,
  and a valid unavailable selection remain distinct visible states." A case
  failure is rendered as the queue-level failure state, so two states the spec
  requires to stay distinct are collapsed into one.

The same requirement also settles what should happen instead: an `unavailable`
disposition "returns the case atomically to the queue only after findings
confirms the matching disposition". The new window's findings do confirm it — the
Finding is not among that window's rows.

## What changes

- The case-file leg of the window-change preparation handshake in
  `frontend/diagnose-workstation.js` stops marking the window's findings failed.
  A `finding_unavailable` answer for the drilled Finding adopts the new window's
  findings and returns the reader to that window's Findings queue. A failure of
  the preparation request itself is unchanged and still latches the window.
- One new executable story, `C58`, in the frozen behaviour ledger and its replay,
  proving the recovery through the built app. The ledger's issued count and both
  inventory ranges move with it, and so does the `initialIssued` literal in
  `frontend/diagnose-behavior-ledger-parity.test.js`, which pins that issued set
  so no ID can silently disappear or be renumbered.

## Impact

- Rendered surface: Diagnose only. No other screen, no backend, no analyzer, no
  projection, no staging verdict, no dose advice, and no fixture changes.
- No new copy is introduced. The existing `Findings unavailable for …` message
  keeps its meaning and its only remaining trigger — a failed preparation request
  — which live story `C54` pins verbatim.
- Live story `C55` already pins the sibling case: a window change out of a drill
  into a window where the Finding *is* available keeps the drill and settles the
  replacement pair. That behaviour is preserved unchanged.
- No decision record. The behaviour this change restores is already recorded — by
  the `surfaces` requirement above and by the request-and-recovery contract table
  in `openspec/changes/diagnose-finding-case-files/design.md`. This change makes
  the code obey them; it settles nothing new.
