# Repair glucose chart legibility (#253)

## Why

The Diagnose glucose-by-time-of-day chart currently projects its clock-window
gates through the basal verdict strip and fades every basal cell outside the
selected window. That makes a time selection appear to change basal verdicts.

The basal verdict palette also collapses held, insufficient-evidence, and no-data
slots into nearly indistinguishable neutrals. In Dark, the clock-window scrim
further washes out chart bands, lines, labels, and values. The chart is advisory
evidence for insulin-setting decisions, so the state encoding and the evidence
under it must remain legible.

## What changes

- Clock-window gates and their interactive hit area stop at the glucose plot's
  x-axis. Window selection no longer changes basal-strip paint or opacity.
- Basal verdict cells use the shipped theme's semantic tokens and retain a
  non-color structural distinction for held, insufficient-evidence, and no-data
  states in Light and Dark.
- The window treatment and glucose marks are retuned against their actual
  composited backgrounds so bands, median, target range, labels, endpoint values,
  axes, and legend remain readable in both themes.
- The frozen Diagnose behavior ledger amends P14 and P43, and the app-only replay
  proves the new geometry and selection-independent basal rendering.
- Browser coverage measures the rendered/composited chart and basal-strip states,
  then records same-fixture before/after evidence at the affected desktop size in
  both themes.

## Risk contract

- **Must prevent:** a clock-window action changing the apparent basal verdict;
  gate visuals or hit zones entering the basal strip; indistinguishable basal
  states; unreadable advisory chart evidence; browser checks that pass on raw
  tokens while the composited pixels fail; changes to analyzer output, staging,
  safety rules, API behavior, or patient data.
- **Must recover:** nothing automatically; theme repaint and window interaction
  continue through the existing mounted Diagnose surface.
- **Accepted failure:** missing browser prerequisites, vendored assets, or the
  synthetic app source stop the replay and evidence capture loudly and require
  manual environment repair.
- **Unsupported:** redesigning the Diagnose layout, changing clock-window scope or
  dragging semantics, altering basal verdict meanings, recoloring other Harmonic
  surfaces, or using real health data for evidence.
- **Evidence owed:** fail-first geometry and basal-paint assertions; fail-first
  rendered/composited legibility checks in Light and Dark; the full Diagnose
  behavior replay; the complete fast gate and documented drift checks; synthetic
  before/after screenshots inspected at the reported desktop dimensions.

## Impact

The shipped Diagnose chart, its theme roles, frozen behavior ledger and replay,
browser gates, the `surfaces` capability specification, and this change record
only. No backend capability, analyzer, recommendation, safety predicate, staging
verdict, stored data, or pump setting changes.
