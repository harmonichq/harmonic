# Proposal — filter unrelated basal findings

## Why

Changing the Diagnose clock window can leave the previous findings projection
visible under the new range. A stale basal recommendation presented as though it
belongs to another clock window can mislead advisory insulin-setting review.

## What changes

- Treat a findings projection as renderable only when its loaded request key
  matches the current clock window.
- Show range-only counting and unavailable states at every inspector depth,
  without rows, recommendations, support, staging controls, or counts from the
  previous projection.
- Preserve the server-published row identity for parameter details so a settled
  projection can own the detail's presence or absence without browser-side time
  filtering.
- Keep late responses from replacing the newest window and allow a later window
  selection to recover after a failed request.

## Boundaries

This change does not alter findings membership, analyzer safety predicates,
whole-day queue policy, cache keys, window presets, chart geometry, ranking, or
Plan staging behavior. Membership remains server-owned under ADR 62.

## Evidence

The frozen behavior ledger is
`mockups/finding-evidence-routing.behavior.md`. Its built-app replay adds S41
for delayed, absent, and superseded projections and S42 for failure and recovery.
