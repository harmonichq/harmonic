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
| Cockpit shell | Fixed clinical-instrument frame with a numbered Diagnose → Plan → Verify workflow, Day access, scope and quick Carb log entry above, and advisory/profile utilities below | `shipped` | [#49](https://github.com/harmonichq/harmonic/issues/49) | shipped app: `frontend/index.html` + `frontend/shell.css` + `frontend/theme.css` · frozen behavior ledger: `mockups/cockpit-shell.behavior.md` · app-only replay seam: `frontend/cockpit-shell.browser.test.mjs` · decision record: ADR 49 in `openspec/changes/chrome-bar-surface-states/design.md` |
| Finding → evidence routing (Diagnose + Verify) | One Findings pane as the sole steering wheel; server-published Event charts are discoverable at queue root; the canvas answers wherever the pane stands, with `By clock` / `By event` as projections over already-selected data | `shipped` | [#31](https://github.com/harmonichq/harmonic/issues/31), [#10](https://github.com/harmonichq/harmonic/issues/10), [#83](https://github.com/harmonichq/harmonic/issues/83), [#95](https://github.com/harmonichq/harmonic/issues/95) | shipped app: `frontend/diagnose-workstation.js` · frozen behaviour ledger: `mockups/finding-evidence-routing.behavior.md` · app-only replay: `frontend/diagnose-workstation-behavior.replay.mjs` · #95 keeps initial ALIGN absent until a factor's events are visible, with paired evidence at `openspec/changes/diagnose-align-hidden-render/evidence/` · decision record: ADR 31 and the 2026-08-19 revise safe-start amendment in `openspec/changes/finding-evidence-routing/design.md` · historical exploration: `mockups/finding-evidence-routing.exploration/` (lock retracted in [#41](https://github.com/harmonichq/harmonic/issues/41); no lock manifest survives) · revised in [#62](https://github.com/harmonichq/harmonic/issues/62): one server-owned clock window decides membership under both projections (ADR 62) · revised in [#10](https://github.com/harmonichq/harmonic/issues/10): non-actionable past-setting Watching rows, one coherent clock/event case file, bounded recovery, and issue-10 evidence at `openspec/changes/dose-stamped-information-findings/evidence/issue-10/` (ADR 22) · revised in [#83](https://github.com/harmonichq/harmonic/issues/83): root Filter composes Sift with All findings / Event charts, and direct event-chart entry reads the live projected row coordinate (ADR 83 in `openspec/changes/event-chart-discovery/design.md`) · revised in [#102](https://github.com/harmonichq/harmonic/issues/102): basal slot case files name nights of steady data · revised in [#103](https://github.com/harmonichq/harmonic/issues/103): non-asserting basal case-file heads use their own verdict wording (ADR 103 in `openspec/changes/basal-slot-head-state/design.md`) · revised in [#97](https://github.com/harmonichq/harmonic/issues/97): held, blind, and past-setting reads collapse behind Watching by default; the uncaused-highs footer is retired · revised in [#100](https://github.com/harmonichq/harmonic/issues/100): reader-driven drill-in focus lands on the opened detail and returns to its originating queue row. |

**Explore** is deliberately absent from this ledger. It is the arbitrary-slicing
ambition, it has no surface yet, and the #31 exploration excludes it by name; it
earns a row when it becomes a real job and gets its own round.
