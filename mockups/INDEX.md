# Surface ledger

One row per user-facing surface that has been through the `/ui-craft`
lock-then-build lifecycle. The ledger is read **first** by every lock round:
a `locked` row is binding precedent for adjacent surfaces, and for a `shipped`
row the running app — not the archived mockup markup — is ground truth for
chrome, tokens and component styling.

Status values: `exploring` (mockups in flight, nothing binding) → `locked`
(★ header + lock manifest exist; a build may not silently drift from them) →
`shipped` (the port landed; the app is now the source of truth, and the mock,
its screenshots and its manifest stay as the design record).

| Surface | Concept | Status | Issue | File |
|---|---|---|---|---|
| Finding → evidence routing (Diagnose + Verify) | One inspector as the sole steering wheel; findings are routers; the canvas is one chart surface that answers wherever the inspector stands, with `By clock` / `By event` as a projection over already-selected data | `locked` | [#31](https://github.com/harmonichq/harmonic/issues/31) | mock: `mockups/finding-evidence-routing.exploration/` (`index.html` carries the ★ LOCKED header) · manifest: `mockups/finding-evidence-routing.lock.md` · decision record: ADR 31 in `openspec/changes/finding-evidence-routing/design.md` |

**Explore** is deliberately absent from this ledger. It is the arbitrary-slicing
ambition, it has no surface yet, and the #31 lock excludes it by name; it earns
a row when it becomes a real job and gets its own round.
