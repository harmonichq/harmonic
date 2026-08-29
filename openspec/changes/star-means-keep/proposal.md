# Star means keep in the Diagnose chart dock (#226)

## Why

The shipped Diagnose chart dock uses a star to sort a chart ahead of the
server-ranked findings. In daily use, starring the fourth chart makes the row
re-form under the reader even though the filmstrip contract says selection must
not move cells.

The reader's intent is retention, not priority: keep this chart available while
the selected window and findings rank change.

## What changes

- Keep ranked charts in server rank order whether or not they are starred.
- Retain an unranked starred chart after the ranked charts and before the
  Watching divider.
- Replace position-oriented star copy with keep-oriented copy.
- Amend the frozen Diagnose behavior ledger and app-only replay, preserving the
  unlimited-star, spotlight, fullscreen, explorer, stale-recovery, and chart
  rendering contracts.
- Record the decision as ADR 226 and mark the superseded ADR 215 ordering clauses
  as historical.

## Risk contract

- **Must prevent:** starring or unstarring a ranked chart reorders the ranked
  filmstrip; a starred chart silently disappears when its finding leaves rank;
  a retained unranked star crosses the Watching divider; browser evidence passes
  without exercising the changed story; patient data enters fixtures, logs, or
  committed evidence.
- **Must recover:** after a starred chart becomes unranked it remains reachable
  in the dock, and stopping retention returns it to the existing rank/Watching
  membership rules on the next reconciliation.
- **Accepted failure:** missing browser dependencies, vendored assets, fixtures,
  or the safe synthetic app source stop verification loudly and require a manual
  rerun after the dependency is restored.
- **Unsupported:** persistence across page reloads, a star cap, new chart kinds,
  changes to server findings rank, changes to the Watching register, a new dock
  layout, or any analyzer/API/staging behavior.
- **Evidence owed:** fail-first helper and built-app assertions for no ranked
  reorder, retention across a findings-window change, placement immediately after
  ranked charts and before the Watching divider, keep-oriented accessible copy,
  unchanged spotlight behavior, a nonzero app-only replay, and paired synthetic
  before/after renders in Light and Dark.

Why: the failure is a reader-visible loss of spatial continuity and access, not
an insulin-calculation change; targeted end-to-end evidence is proportionate.

Disposition: inline in ADR 226 and the work order.

## Impact

The change is confined to the shipped Diagnose frontend, its existing layout and
membership interfaces, browser contracts, frozen behavior record, surface ledger,
and OpenSpec surface record. It changes no recommendation, ranking calculation,
stored data, API, analyzer, safety predicate, staging verdict, or pump setting.
