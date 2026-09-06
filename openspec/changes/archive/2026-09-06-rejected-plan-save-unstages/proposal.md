# A rejected Plan save leaves nothing staged (#358)

## Why

Diagnose stages a change optimistically and never looks at what the server
said. The workstation's own staged set is mutated, the stage button repaints as
`Staged · Undo`, the shell's Plan draft gains the item and counts it in the step
badge, and the watch dock's staged-Plan input gains it too — all before
`PUT /api/plan` has answered, and nothing awaits or inspects that answer.

- Reproduced with `PUT /api/plan` routed to a synthetic 400, so the
  reproduction does not depend on #357's backend rejection. It reproduces on the
  one committed synthetic database this branch carries
  (`mockups/qa-e2e.synthetic/harmonic.sqlite`), on a basal slot — the finding
  `basal:180-240` — and not only on the all-day I:C block the ticket reports.
  After the refusal the stage control reads `Staged · Undo` with
  `data-staged="true"`, and the shell's reactive draft and the Plan step badge
  both count the refused item. Reloading shows an empty Plan: nothing was saved.
  The captured run is in `evidence/repro-358.base.stdout.txt`.
- **The watch dock's share of the defect is asserted in the browser suite, not
  in that capture.** `watchDockView` returns its `trial` branch whenever a Trial
  is watched and reaches the `plan` branch only when nothing is
  (`frontend/watched-change-dock.js`), and this database has a watched Trial —
  the capture prints `Trial · watching` unchanged on both sides, so a
  `Plan · staged` assertion there would be inert and the driver makes none. The
  cockpit-shell browser suite stubs `/api/outcomes/trend` empty, so nothing is
  watched and the dock's `Plan · staged` branch is reachable; that is where the
  regression test asserts it.
- The surface therefore tells the reader that an advisory dosing change is
  staged when the server refused to record it. On a failed write this app's
  standing rule is the opposite: preserve the last internally coherent state and
  make the failure visible, never present a falsely current one.
- Three call sites share the defect, not one: the basal slot, the I:C block and
  the ISF value handlers in `frontend/diagnose-workstation.js` all mutate their
  local staged state, call `callbacks.stage(...)` without awaiting it, and
  repaint. The shell's `diagnoseStage` mutates `planItems` before saving and its
  `savePlanDraft` swallows the failure into a toast, returning nothing.
- **The toast is already correct and is not this change.** `frontend/data.js`
  unwraps the server's `detail` into the thrown error, and the shell prints
  `Plan save failed: ` plus that detail verbatim — a synthetic detail string
  arrives on screen unaltered. The Python dict repr a reader sees today is
  authored by the backend (`ciq_autotune/store.py`, `{prov!r}`) and belongs to
  #357.

## What changes

- **The shell's draft save reports its outcome.** `savePlanDraft` returns
  whether the draft reached the server, keeping the existing failure toast and
  its verbatim server detail. Callers that ignore the result keep today's
  behaviour exactly.
- **Staging from Diagnose is undone when the save is refused.** `diagnoseStage`
  captures the Plan draft before it mutates it, awaits the save, and on a
  refusal restores exactly what it captured — including the single-family
  clearing it performed — so the Plan badge and the Plan screen agree with the
  server. It reports the refusal to its caller.
- **The workstation undoes its own staged state on a refusal.** Each of the
  three stage handlers awaits the staging callback and, when it explicitly
  refuses, restores the local staged state it had just changed and repaints, so
  the stage button, the watch dock and the Plan badge all say the same thing.
  An absent callback or a callback that reports nothing counts as success: the
  component harness mounts the workstation with a staging callback that returns
  nothing, and that mount must keep staging.
- **A browser regression test covers the whole path.** The cockpit shell gate
  serves the real app against stubbed API responses; the new test refuses the
  draft save and asserts that the button, the dock and the Plan badge all report
  nothing staged, and that the failure toast carries the server's detail
  unchanged.

## Boundaries

Frontend only. No analyzer, endpoint, payload or safety-predicate change, and no
frontend gate that re-derives a backend verdict: the surface reads the server's
answer, it does not judge stageability (`AGENTS.md`, "Safety invariants"). No
screen other than Diagnose changes, and the Plan screen's own editors (chip
removal, hand-edits, apply) keep today's behaviour. The `00:00–00:00` span the
dock prints for an all-day I:C block is #356. The backend rejection of that
block, and the dict repr inside its message, are #357. Reload forgetting a
staged change is #354. No pending or disabled state is added to the stage
button while the save is in flight.
