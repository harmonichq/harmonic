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
