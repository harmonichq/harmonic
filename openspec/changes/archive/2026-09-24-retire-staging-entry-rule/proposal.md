# Retire the dead staging-entry style (#39)

## Why

The Diagnose stylesheet still describes a `button.entry` row that the shipped
workstation cannot render. The unified findings queue retired the three
per-parameter level-one staging rows; live staging now happens only from each
item's detail level through `.stagebtn`.

Keeping the unreachable selector family makes the stylesheet and ADR 31 read as
though a second staging entry point still exists. It also preserves the class
collision that once expanded every evidence row until the rule was scoped to a
button.

## What changes

- Remove the unreachable `button.entry` selector family and its matching theme
  selector.
- Turn the existing compact evidence-row regression into a closed source
  inventory: the numeric `.entry` cell remains, no box rule may reach it, and no
  retired staging-entry selector may return.
- Record that the old level-one entry rows are retired while the live findings
  queue, parameter detail, `.stagebtn`, basal-lane shortcut, Plan draft, and
  evidence-table behavior remain unchanged.

## Risk contract

- **Must prevent:** changing any analyzer, safety predicate, recommendation,
  staging eligibility, Plan draft behavior, or rendered Diagnose state; weakening
  the compact evidence-cell regression; publishing real health data.
- **Must recover:** nothing automatically.
- **Accepted failure:** none; a source inventory that cannot prove both the dead
  selector's absence and the evidence cell's compact styling fails the change.
- **Unsupported:** restoring a second level-one staging route, redesigning the
  findings queue or parameter detail, renaming the evidence cell, or verifying
  against real pump data or a fetch-enabled server.
- **Evidence owed:** a test that fails on the ticket base for the retired selector
  inventory and passes after deletion; the complete frontend CI job; the
  existing S24 behavior contract remains unchanged and continues to assert zero
  per-parameter tier rows in CI.

Why: the change is presentation-only and unreachable at runtime, but it sits next
to the staging path for advisory insulin-dosing guidance.

Disposition: inline in this proposal and unchanged in the locked work order.

## Impact

Dead frontend CSS, its source-inventory regression, and decision records only.
No rendered surface, API, fixture, model, safety, stored-data, or Plan behavior
changes.
