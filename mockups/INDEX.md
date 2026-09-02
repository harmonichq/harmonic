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
| Finding → evidence routing (Diagnose + Verify) | One Findings pane as the sole steering wheel; server-published Event charts are discoverable at queue root; the canvas answers wherever the pane stands, with `By clock` / `By event` as projections over already-selected data | `shipped` | [#31](https://github.com/harmonichq/harmonic/issues/31), [#10](https://github.com/harmonichq/harmonic/issues/10), [#83](https://github.com/harmonichq/harmonic/issues/83), [#95](https://github.com/harmonichq/harmonic/issues/95), [#106](https://github.com/harmonichq/harmonic/issues/106), [#101](https://github.com/harmonichq/harmonic/issues/101), [#105](https://github.com/harmonichq/harmonic/issues/105) | shipped app: `frontend/diagnose-workstation.js` · frozen behaviour ledger: `mockups/finding-evidence-routing.behavior.md` · app-only replay: `frontend/diagnose-workstation-behavior.replay.mjs` · #95 keeps initial ALIGN absent until a factor's events are visible, with paired evidence at `openspec/changes/diagnose-align-hidden-render/evidence/` · decision record: ADR 31 and the 2026-08-19 revise safe-start amendment in `openspec/changes/finding-evidence-routing/design.md` · historical exploration: `mockups/finding-evidence-routing.exploration/` (lock retracted in [#41](https://github.com/harmonichq/harmonic/issues/41); no lock manifest survives) · revised in [#62](https://github.com/harmonichq/harmonic/issues/62): one server-owned clock window decides membership under both projections (ADR 62) · revised in [#10](https://github.com/harmonichq/harmonic/issues/10): non-actionable past-setting Watching rows, one coherent clock/event case file, bounded recovery, and issue-10 evidence at `openspec/changes/dose-stamped-information-findings/evidence/issue-10/` (ADR 22) · revised in [#83](https://github.com/harmonichq/harmonic/issues/83): root Filter composes Sift with All findings / Event charts, and direct event-chart entry reads the live projected row coordinate (ADR 83 in `openspec/changes/event-chart-discovery/design.md`) · revised in [#102](https://github.com/harmonichq/harmonic/issues/102): basal slot case files name nights of steady data · revised in [#103](https://github.com/harmonichq/harmonic/issues/103): non-asserting basal case-file heads use their own verdict wording (ADR 103 in `openspec/changes/basal-slot-head-state/design.md`) · revised in [#97](https://github.com/harmonichq/harmonic/issues/97): held, blind, and past-setting reads collapse behind Watching by default; the uncaused-highs footer is retired · revised in [#100](https://github.com/harmonichq/harmonic/issues/100): reader-driven drill-in focus lands on the opened detail and returns to its originating queue row · revised in [#96](https://github.com/harmonichq/harmonic/issues/96): Align reconciles in place so keyboard focus survives projection changes · revised in [#106](https://github.com/harmonichq/harmonic/issues/106): ALIGN begins at the inspector edge, with paired evidence at `openspec/changes/diagnose-align-inspector-edge/evidence/` · revised in [#101](https://github.com/harmonichq/harmonic/issues/101): Occurrences step vertically with Up/Down and restore the selected row's focus (ADR 101 in `openspec/changes/diagnose-occurrence-roster-keys/design.md`) · revised in [#105](https://github.com/harmonichq/harmonic/issues/105): PATH A measurement confirmed #101 already retains focus for direct in-place Occurrence selection; S81 guards the second rendered row · revised in [#104](https://github.com/harmonichq/harmonic/issues/104): the unreachable basal coverage-ribbon screen is retired, and findings-queue basal support reads “nights of steady data”. · revised in [#135](https://github.com/harmonichq/harmonic/issues/135): the glucose chart condenses to a full-width strip over a pinned evidence tile field with derived arrangements, per-chart alignment (global ALIGN retired), and Explore mode (ADR 135 ×2 in `openspec/changes/diagnose-evidence-canvas/design.md`; synthetic visual reference: `mockups/diagnose-evidence-canvas.exploration/`) · revised in [#294](https://github.com/harmonichq/harmonic/issues/294): a settings chart click (basal, ISF, I:C) resolves to the same findings row its queue row opens and takes that row's route, inheriting its clock-window release — basal and I:C release a drawn window, ISF does not; S21's lane-click exclusivity sentence is reconciled to name the drills that actually release (ADR 294 in `openspec/changes/one-settings-drill-down/design.md`) |

Issue [#232](https://github.com/harmonichq/harmonic/issues/232) revises the shipped
Finding → evidence routing surface so every registered evidence chart uses one
bounded fullscreen frame. Its synthetic Light/Dark, red/control before-and-after
evidence is stored under `openspec/changes/fullscreen-chart-containment/evidence/`.

Issue [#226](https://github.com/harmonichq/harmonic/issues/226) revises the shipped
Finding → evidence routing surface so a star keeps a live chart without changing
findings rank. A retained unranked chart sits after ranked charts and before the
existing Watching divider; paired synthetic Light/Dark evidence is stored under
`openspec/changes/star-means-keep/evidence/`, and ADR 226 is normative.

Issue [#255](https://github.com/harmonichq/harmonic/issues/255) revises the shipped
Dark Diagnose material hierarchy. Its behavior ledger and replay remain unchanged
at `mockups/finding-evidence-routing.behavior.md` and
`frontend/diagnose-workstation-behavior.replay.mjs`; synthetic visual evidence is
`mockups/diagnose-evidence-canvas.exploration/`, whose generated `index.html` binds
its Dark source extract to `frontend/index.html` and `frontend/theme.css`. Public
Dark/Light contract coverage lives in `frontend/diagnose-workstation.browser.test.mjs`,
`frontend/diagnose-canvas-composition.browser.test.mjs`, and
`frontend/cockpit-shell.browser.test.mjs`.

Issue [#294](https://github.com/harmonichq/harmonic/issues/294) revises the shipped
Finding → evidence routing surface so a settings evidence chart click (basal,
ISF, I:C) resolves to the findings row sharing its chart
identity and takes that row's own route, exactly like the behavioral branch
already did — never a second implementation of the parameter panel. The route
inherits its queue-row picker's clock-window release: basal and I:C
release a drawn window, ISF leaves it standing. S21's lane-click
exclusivity sentence is reconciled to name the drills that actually release
(ADR 294 in `openspec/changes/one-settings-drill-down/design.md`); a paired
synthetic before/after basal capture is stored under
`openspec/changes/one-settings-drill-down/evidence/`, with the carb-ratio and
correction-factor equivalents proven by the replay (S123, S124) rather than a
separate capture.

Issue [#304](https://github.com/harmonichq/harmonic/issues/304) revises the
shipped Cockpit shell and Finding → evidence routing surfaces so Harmonic ships
one theme. The footer Theme control, the `theme` localStorage key and the
boot-time class gate are gone, and every rule the light theme reached collapses
into its Dark declaration; the shipped Dark surface itself does not move.
Cockpit S3 (the Theme radio menu) and S10 (the ADR 49 hover, checked and focus
recipe, which the Theme rows were the only surface for) are retired, and
Diagnose S117 (the Dark → Light → Dark repaint round trip) with them — each for
want of a surface, not by assertion of a no-op. Cockpit S6 is amended rather
than retired: its desk/bar/control count of three grounds was a Light-only
truth, and on the shipped Dark surface the chrome bar keeps its own token set on
the desk's own ground, so the vocabulary is two grounds. Identity evidence — a
full `getComputedStyle` diff of the ticket base against the revision across the
gated Diagnose, Verify, Day and shell states at 1440×900, 1280×800 and 390×844,
over the generated synthetic database — is stored under
`openspec/changes/dark-only-theme/evidence/`, and reports no difference beyond
the removed Theme control, the boot-time gate that read the retired key, and the
footer utilities nav reflowing around the button's absent box (ADR 304 ×3 in
`openspec/changes/dark-only-theme/design.md`).

Issue [#317](https://github.com/harmonichq/harmonic/issues/317) finishes the
graphite palette on the running app, in an attended UI Craft revise round on
the shipped Cockpit shell and Finding → evidence routing surfaces, with three
operator rulings recorded as dated sanctions (ADR 317 in
`openspec/changes/graphite-palette/design.md`): high-glucose marks leave the
action orange for a gold of their own (`--high` `#e07f3f` → `#e2be4c`), so a
high reading never looks tappable; the Verify trial ribbon holds at 20%/20%,
the documented 32%/18% step-up retired as intent after both were rendered on
one synthetic Trial and told apart by a hair; and the chrome bar moves one step
up the ladder, from the desk to the well (`#0f0d0b` → `#14120f`), so the frame
reads as its own material where cards sit on the page directly. Cockpit S6 is
amended back to three grounds — desk, bar, control — with its gate pinning the
bar to the sanctioned literal and holding it off the desk. Palette-only
evidence — a full `getComputedStyle` diff of the ticket base against the
revision across shell, Diagnose, Verify, Day and Plan at three viewports over
the generated synthetic database, admitting a difference only through the
moved-token list and colour pairs the design record names, plus before/after
renders and the ribbon renders through the committed Trial opener — is stored
under `openspec/changes/graphite-palette/evidence/`.

**Explore** is deliberately absent from this ledger. It is the arbitrary-slicing
ambition, it has no surface yet, and the #31 exploration excludes it by name; it
earns a row when it becomes a real job and gets its own round.
