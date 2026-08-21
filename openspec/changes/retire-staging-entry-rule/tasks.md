# Tasks — Retire the dead staging-entry style (#39)

## 1. Pin the closed inventory

- [x] Extend `frontend/diagnose-evidence-row-box.test.js` to inventory every CSS
      file under `frontend/` plus the app's inline style blocks, and fail while the
      `button.entry` selector family or the theme's `.entry .sub` selector remains.
- [x] Preserve the existing assertion that the shipped evidence painter emits an
      inline `.entry` glucose cell and that no box-producing selector reaches it.
- [x] Record the expected pre-deletion failure and restore the test before editing
      production CSS.

## 2. Remove only the retired rules

- [x] Delete the complete `button.entry` block and its descendant rules from
      `frontend/diagnose-workstation.css`.
- [x] Remove only the dead `.entry .sub` arm from the shared typography selector
      in `frontend/theme.css`; keep every live selector in that list unchanged.
- [x] Keep `.ev-row .entry`, `.stagebtn`, the unified findings queue, parameter
      detail levels, basal-lane navigation, and Plan staging behavior unchanged.

## 3. Verify and review

- [x] Run all four commands in `.github/workflows/ci.yml`'s `frontend` job
      exactly as committed; all tests pass and both drift checks report current.
- [x] Confirm the existing S24 app replay remains untouched and CI still owns its
      public assertion that level one renders zero per-parameter tier rows.
- [x] Update this record with red/green evidence, run `/review` at Targeted depth,
      and resolve every blocking finding before opening one pull request. Do not
      merge.

## Implementation evidence

- **Red:** `node --test frontend/diagnose-evidence-row-box.test.js` ran two
  tests with one pass and one expected failure. The failure enumerated the full
  `button.entry` selector family and the theme's `.entry .sub` arm; the existing
  compact evidence-cell assertion remained green.
- **Green:** the same focused command ran two tests with two passes after only
  the retired selectors were deleted. The sole shipped literal `entry` emitter
  remains the inline evidence glucose cell, and `.ev-row .entry` remains its
  sole production style owner. Targeted review then expanded the inventory from
  the two former owner files to every CSS file under `frontend/` plus the app's
  inline style blocks; the focused command remained green.
- **Frontend job:** `node --test 'frontend/**/*.test.js'` passed 375 tests with
  zero failures; `node --test scripts/screenshots.local.test.mjs` passed one
  test with zero failures; both committed `--check` commands reported their
  generated artifacts current. The test command required worktree write access
  so its fail-closed regressions could create and remove their own temporary
  fixture directories.
- **Frozen behavior:** `frontend/diagnose-workstation-behavior.replay.mjs` is
  byte-unchanged and continues to require zero `#level .entry` rows in S24.
