# Proposal — QA E2E coverage eras

## Why

The committed QA database now supplies a dense showcase for supervised no-fetch
UI work, but it does not yet prove the basal, ISF, and I:C states that make an
advisory settings row actionable, held, blind, quiet, or historical. The current
catalog also exercises scenario and I:C-history producers without describing all
of their output row for row.

## What changes

- Append isolated basal, ISF, and I:C coverage eras to the generator-owned QA
  database while keeping the showcase era newest and app-visible.
- Expand the case expectation contract to compare exact analyzer rows, scoped and
  unscoped queue rows and required absences, support-floor evidence, and the
  analyzer-owned `asserts_move` verdict.
- Preserve each case as a runnable temporary store using the production analysis
  composition and record the measured size and runtime after concatenation.
- Keep this change active for the sibling behavioral-coverage phase and the final
  migration, retirement, and agent-guidance phase.

## Boundaries

This change adds manufactured fixture recipes, expectations, generator
invariants, and their tests. It does not alter production analyzers, safety
policy, findings projection, the fixed production windows, browser surfaces, or
the no-fetch server. It does not retire revise-e2e or migrate its remaining
consumers.
