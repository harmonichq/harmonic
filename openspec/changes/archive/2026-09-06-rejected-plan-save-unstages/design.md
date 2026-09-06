# Design — a rejected Plan save leaves nothing staged

## ADR 358 — Only an explicit refusal unstages the Diagnose surface

**Ruling.** The Diagnose workstation undoes a staged change when, and only when,
its `callbacks.stage(...)` explicitly reports that the draft save was refused.
An absent callback, and a callback that returns without reporting a refusal,
both count as success and undo nothing.

### Context

`createDiagnoseWorkstation` is mounted twice with different staging callbacks.
The app shell (`frontend/index.html`) passes `diagnoseStage`, which writes the
reactive Plan draft and persists it through `PUT /api/plan`. The dev-only
component harness (`harness/stories.js`) passes `stage: () => {}` — there is no
draft, no server and nothing to refuse, and staging in that mount must keep
working. The frozen behaviour replay's S71 probe wraps the real callback and
forwards its return value, so it inherits whichever convention the production
callback uses.

A "revert unless the callback confirms success" rule would therefore break the
harness mount and any future mount that stages without persisting, turning a
missing return value into a silent unstage. A "revert only on an explicit
refusal" rule fails in the opposite direction — a callback that forgets to
report a refusal leaves the old lie in place — but that failure is in one
place, the shell's own stage entry point, which the browser regression test
covers directly.

### Decision

The refusal is a value the shell's staging callback returns, and the workstation
acts on that value alone. The workstation neither inspects the response, nor
re-derives what was saved, nor reads the Plan draft: the shell owns the draft
and the server owns the verdict, which is the same division the safety rules
already require for staging eligibility.

### Consequences

The workstation's staging callback contract gains a return value, so a mount
that wants a refusal honoured must report one. The shell's `savePlanDraft` gains
an outcome for the same reason; its existing callers, which stage from the Plan
screen rather than from Diagnose, ignore that outcome and are unchanged.

## ADR 358 — A staging action entered while the previous save is unanswered is dropped

**Ruling.** `stageAndSettle` admits one Diagnose staging action at a time. Its
`saveInFlight` guard closes only after the action has optimistically painted and
reopens in `finally`, whether the save is accepted, refused, or throws. A staging
action entered while the previous save is unanswered is dropped.

### Context

The shell restores the Plan draft from the checkpoint captured for the save that
was issued. If a second Diagnose action entered during the first save, its save
would capture the first action's optimistic draft. In the reviewed refusal
sequence, the corrupt checkpoint is also the newest one, so a draft-generation
stamp with a "newest wins" rule restores the item refused twice. Correct restoration
under overlap would instead need a last-accepted-draft restore point and a ruling
for mixed accept/refuse outcomes.

### Decision

Prevent overlapping Diagnose staging saves. This is the smaller change: it leaves
the optimistic paint intact while ensuring the next staging action cannot create a
checkpoint from an unanswered save.

### Consequences

The guard covers Diagnose's own staging only. `setTab`, `removeChip` in
`frontend/index.html`, and deliverable hand-edits remain ungated, so removing a
chip on Plan while a Diagnose save is in flight can be restored by that save's
refused checkpoint. That end state is locally coherent; reload divergence remains
#354's declared non-goal.

No fetch in `frontend/data.js` carries a timeout. A hung PUT therefore holds the
guard without a cue. That is a network pathology and is not addressed here.
