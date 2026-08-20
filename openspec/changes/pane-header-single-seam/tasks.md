# Tasks — Pane header single seam (#59)

## 1. Pin the regression

- [x] Extend the existing Cockpit shell browser gate to compare the canvas and
      inspector header rectangles on populated Diagnose and Verify.
- [x] Exercise both existing desktop viewports and both themes, and observe the
      assertion fail on the pre-fix CSS because the bottom borders differ by one
      CSS pixel.

## 2. Restore the shared role

- [x] Correct the pane-header role in `frontend/theme.css` so sibling headers
      have one rendered height and their bottom borders meet the vertical pane
      divider at one coordinate.
- [x] Preserve header content, hover/readout swaps, pane geometry, responsive
      behavior (including Verify's stacking), Diagnose's existing narrow layout,
      and every data or advisory path.

## 3. Verify the shipped surfaces

- [x] Run the dependency-free frontend gate and the Cockpit shell browser leg.
- [x] Run the remaining repository fast gates required by `AGENTS.md`.
- [x] Capture before/after light and dark evidence for Diagnose and Verify from
      the running app or the app-only fixture harness; do not use real pump data.
- [x] Finish this change record before opening one draft pull request. Do not
      merge.
