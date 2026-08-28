# Tasks — Preserve Diagnose context across theme changes (#230)

## 1. Freeze the regression

- [x] Amend S117 in the Diagnose behavior ledger and app-only replay so the
      story selects the 24-hour window and a non-default spotlight before the
      theme change, then reads the same controls and chart identities without
      calling a helper that re-establishes scope.
- [x] Run the amended S117 against the pre-change app and observe it fail because
      the window and spotlight reset while palette ink still changes.

## 2. Repaint without remounting

- [x] Give the boot instance one private, generally named repaint capability;
      keep the public Day repaint wrapper and make theme refresh delegate to the
      same live painter without reconstructing boot-owned window, spotlight,
      dock, or request state.
- [x] Keep full reconstruction for fresh payloads, explicit state changes, and
      error recovery; do not introduce a second Diagnose renderer or persist
      session-only state across navigation.

## 3. Verify the shipped surface

- [x] Run the full Diagnose behavior replay against the built app on the exact
      no-fetch synthetic server and report every story.
- [x] Capture before/after synthetic evidence for a 24-hour window with a
      non-default spotlight across both theme directions, confirming only the
      palette changes.
- [x] Run the repository fast gate and all documented drift checks, then finish
      this record before opening one pull request. Do not merge.
