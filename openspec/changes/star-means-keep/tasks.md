# Tasks — Star means keep (#226)

## 1. Freeze and fail first

- [x] Re-run the frozen Diagnose workstation replay against the exact safe
      synthetic app source and inventory star, rank, window-change, divider,
      spotlight, keyboard, and accessible-name behavior.
- [x] Amend the frozen behavior ledger and add an app-only story that fails on
      the current pin-first order before production edits.
- [x] Rewrite the focused layout and composition assertions so the current
      implementation fails for ranked reorder and retained-star placement.

## 2. Change semantics through the existing interfaces

- [x] Make `placeSeats` and `dockOrder` preserve candidate/rank order instead of
      sorting stars first; do not add a second membership or ordering module.
- [x] Keep `seatableChartIds` as the one source that appends live unranked stars
      after ranked findings.
- [x] Paint that retained group ahead of the Watching divider and keep spotlight
      selection independent from star state.
- [x] Replace left-most and pin/unpin user copy with keep/release language while
      preserving the star glyph, unlimited stars, and keyboard path.

## 3. Record and verify the revision

- [x] Update the baseline surface requirement, frozen behavior ledger, surface
      ledger, and historical ADR 215 references; keep ADR 226 as the normative
      decision.
- [x] Capture paired synthetic Light/Dark before-and-after evidence for a ranked
      star and an unranked retained star at desktop and narrow viewports.
- [x] Run the full fast gate plus the affected Diagnose composition and
      workstation browser/replay gates from `AGENTS.md`; every command must exit
      zero and every browser/replay leg must report a nonzero count.
- [x] Open one pull request for human review and stop without merging.
