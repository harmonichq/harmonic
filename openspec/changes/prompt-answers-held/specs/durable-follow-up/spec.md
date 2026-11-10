## MODIFIED Requirements

### Requirement: Local writes reconcile a stale follow-up frontier

After a committed carb or prompt write, and on startup when the retained
frontier revision is stale, the existing local reconciliation SHALL run without
changing immutable endings or admission policy. GET requests remain read-only.
A carb or prompt write SHALL invalidate cached reads as it commits, and SHALL
run its reconciliation after its response, never inside it. Reconciliations
SHALL never run two at once: writes committed while one runs SHALL be
reconciled by the next one after it, so a burst runs one reconciliation, plus
one more for each that a later write crosses (ADR 677). Each reconciliation
SHALL invalidate the
cached reads of follow-up state after it. If reconciliation fails after the
input commits, the write SHALL still be answered as saved, cached reads SHALL
still be invalidated, the failure SHALL be logged, and the frontier SHALL stay
behind until the next reconciliation.

#### Scenario: A committed input recovers a stale frontier

- **GIVEN** a synthetic stale frontier with either a live or expired retained
  Trial
- **WHEN** a carb or prompt write commits, or the app starts against it
- **THEN** local reconciliation preserves the original ending and current
  admission result
- **AND** a failed reconciliation still invalidates cache after the input write

#### Scenario: A burst of Prompt answers reconciles after its answers

- **GIVEN** a Prompt answer whose reconciliation is running
- **THEN** that answer was answered before its reconciliation finished
- **WHEN** two more answers are made
- **THEN** each is saved and answered without waiting for it
- **AND** one more reconciliation runs after it, for both, and leaves the
  frontier current
- **AND** a roster read while it ran, which answered the frontier as behind,
  is read again after it
