# Preserve Diagnose context across theme changes (#230)

## Why

Changing the theme correctly repaints Diagnose charts from the new palette, but
the repaint remounts the workstation. That remount replaces the reader's active
clock window with the default window and replaces the spotlight and dock with
their opening arrangement.

A theme choice is a display preference. It must not move the reader away from
the evidence they were judging.

## What changes

- The existing Diagnose refresh interface repaints the mounted workstation from
  live theme tokens without rebuilding its reader-owned state.
- The frozen Diagnose behavior ledger records that a theme change preserves the
  active clock window, spotlight, and dock chart identities/order while chart
  ink changes with the palette.
- The existing S117 app-only replay proves the regression through the shipped
  surface against the committed synthetic data path.

## Risk contract

- **Must prevent:** silently changing the active clock window, spotlight, or
  dock chart identities/order during a theme change; a green regression that
  re-selects those values after switching themes; changes to advisory analysis,
  staging, safety rules, API behavior, or real patient data.
- **Must recover:** nothing automatically; the repaint is local and uses the
  already-mounted synthetic or user-loaded surface state.
- **Accepted failure:** missing browser prerequisites stop the browser replay
  loudly and require manual environment repair, matching the existing
  fail-closed gate.
- **Unsupported:** preserving Diagnose session state across navigation, reload,
  or process restart; changing theme appearance or chart semantics.
- **Evidence owed:** fail-first S117 evidence on the current implementation;
  exact pre/post identity for the active 24-hour window, spotlight, and dock
  chart order; changed event-chart palette ink; the full Diagnose behavior
  replay and repository fast gate.

## Impact

The shipped Diagnose mount seam, its frozen behavior ledger, replay, and this
change record only. No capability-spec baseline, server contract, analyzer,
staging predicate, or safety floor changes.
