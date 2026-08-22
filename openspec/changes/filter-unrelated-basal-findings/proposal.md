# Proposal — filter unrelated basal findings

## Why

Changing the Diagnose clock window can leave the previous findings projection
visible under the new range. A stale basal recommendation presented as though it
belongs to another clock window can mislead advisory insulin-setting review.

## What changes

- Treat a findings projection as renderable only when its loaded request key
  matches the current clock window.
- Show explicit range-only loading and unavailable states at ordinary queue,
  finding-detail, and current-setting parameter-detail depths, without rows,
  recommendations, support, staging controls, or counts from the previous
  projection.
- Preserve ticket 10's selected I:C history as the explicit bounded exception:
  it keeps the last coherent case/canvas pair during replacement and remains
  non-stageable.
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
`mockups/finding-evidence-routing.behavior.md`. Its issue-scoped browser probes
cover delayed, absent, superseded, failed, and recovered projections. The
sliced-projection probe proves that the settled slice retains its own matching
rows by reducing the reconciled synthetic population from seven whole-day
findings to three in 04:30–06:00. The probes' original concurrent S41–S43 labels
are historical; ticket 10's frozen story identities remain unchanged.
