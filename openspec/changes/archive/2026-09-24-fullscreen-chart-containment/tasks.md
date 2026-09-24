# Tasks — Diagnose fullscreen chart containment (#232)

## 1. Freeze the base behavior and red case

- [x] Run the frozen workstation and event-comparison replays against the safe
      synthetic app source and inventory mount, resize, theme, dismissal, and
      disposal behavior.
- [x] Add a fail-first browser assertion for the committed Carb undercount case at
      2084×450, proving the current frame escape and plot/key overlap.
- [x] Establish the four-family matrix at 2084×450 and 2084×742 before production
      edits.

## 2. Centralize the fullscreen frame

- [x] Make the workstation own fullscreen bounds, overflow, resize observation,
      theme repaint, replacement, disposal, and dismissal restoration.
- [x] Return an observer-free mount record from `renderEventSurface`; retain
      caller-owned observation for any real non-fullscreen compatibility caller.
- [x] Remove event-comparison-specific fullscreen height and overflow authority
      without adding a parallel composition or speculative module.

## 3. Preserve chart behavior and restoration

- [x] Keep basal, ISF, and carb-ratio registry options unchanged.
- [x] Preserve the response comparison's served cohort key, selected occurrence,
      selected trace/mark, accessible label, and Left/Right keyboard cursor.
- [x] Prove Back/Escape restores the exact prior Spotlight, chart dock, pins,
      selection, and arrangement for every family.

## 4. Record and verify the revision

- [x] Amend `mockups/finding-evidence-routing.behavior.md` and `mockups/INDEX.md`.
- [x] Capture synthetic same-fixture Light/Dark before-and-after evidence for all
      four families at the red and control viewports.
- [x] Run the complete fast gate and drift checks plus the affected workstation,
      composition, behavior-replay, and support-audit browser legs declared in
      `AGENTS.md`; all must exit zero with nonzero story counts.
- [x] Open a pull request for human review and stop without merging.
