# Pane header single seam (#59)

## Why

Diagnose and Verify place a canvas beside an inspector, but the two pane-header
bottom rules miss each other by one CSS pixel. The shared theme already says
those headers have one height so the divider reads as a single seam; the shipped
geometry does not satisfy that rule.

The defect is visual, but it appears at the main junction between the evidence
canvas and the text used to judge it. A clean, continuous rule keeps those two
reads legible as one instrument instead of two misregistered panels.

## What changes

- The shared pane-header role gives the canvas and inspector one rendered height
  whenever they are side by side, on Diagnose and Verify alike.
- A rendered browser regression checks both surfaces at the repository's existing
  desktop viewports and in both themes.
- Existing header content, live readout swaps, pane widths, Verify's responsive
  stacking, Diagnose's existing narrow layout, and all advisory-analysis behavior
  stay unchanged.

## Risk contract

- **Must prevent:** moving any analysis, safety, staging, Plan, or data behavior;
  fixing one surface while leaving its sibling misaligned; a green test that
  never mounted both populated workstations.
- **Must recover:** nothing automatically.
- **Accepted failure:** below Verify's existing stacking breakpoint its panes
  remain vertically stacked, so there is no side-by-side seam to align. Diagnose
  has no corresponding stacking contract and its narrow layout is out of scope.
- **Unsupported:** verification against real pump data or through a normal
  fetch-enabled server run.
- **Evidence owed:** before-fix failure and after-fix equality of the two header
  border coordinates on populated Diagnose and Verify, at both existing desktop
  browser-gate viewports and in light and dark themes; the existing frontend and
  browser gates remain green.

## Impact

Shared frontend chrome and its rendered regression only. No baseline capability
spec changes: the surfaces' behavior and server contracts do not change.
