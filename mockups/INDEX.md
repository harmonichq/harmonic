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

The arrow runs backwards too. A lock that turns out not to describe its surface
is **retracted**: its manifest is deleted, its ★ header comes off, and the row
returns to `exploring` — the honest status, because nothing about the surface is
binding any more. There is no separate `retracted` status, since the point of
retracting is that the row now says exactly what an unlocked exploration says. A
retraction is recorded in the File column and in the surface's decision record,
so the next lock round reads why before it re-locks.

| Surface | Concept | Status | Issue | File |
|---|---|---|---|---|
| Finding → evidence routing (Diagnose + Verify) | One inspector as the sole steering wheel; findings are routers; the canvas is one chart surface that answers wherever the inspector stands, with `By clock` / `By event` as a projection over already-selected data | `shipped` | [#31](https://github.com/harmonichq/harmonic/issues/31) | shipped app: `frontend/diagnose-workstation.js` · frozen behaviour ledger: `mockups/finding-evidence-routing.behavior.md` · app-only replay: `frontend/diagnose-workstation-behavior.replay.mjs` · decision record: ADR 31 and the 2026-08-19 revise safe-start amendment in `openspec/changes/finding-evidence-routing/design.md` · historical exploration: `mockups/finding-evidence-routing.exploration/` (lock retracted in [#41](https://github.com/harmonichq/harmonic/issues/41); no lock manifest survives). |

**Explore** is deliberately absent from this ledger. It is the arbitrary-slicing
ambition, it has no surface yet, and the #31 exploration excludes it by name; it
earns a row when it becomes a real job and gets its own round.
