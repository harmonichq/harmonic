# Tasks — one dark theme (#304)

## 1. Retire Light in the shipped app and its generated extracts

- [x] Remove the boot-time class gate, the `dark` ref, `toggleDark`, `setDark`,
      `themeMenuOpen`, the footer Theme menu markup, the `watch(dark, …)` repaint
      hook, and every read or write of the `theme` localStorage key from
      `frontend/index.html`.
- [x] Merge the `html.dark` token block into `:root` in `frontend/index.html`
      so each token carries today's Dark value, and delete the light values;
      keep `color-scheme: dark`.
- [x] Collapse every `html.dark`-scoped rule in `frontend/index.html`,
      `frontend/theme.css`, `frontend/diagnose-workstation.css`, and
      `frontend/verify-workstation.css` into its base selector with the Dark
      declaration, and delete every `html:not(.dark)` rule and the light-only
      `--mk-warn` / `--mk-danger` and evergreen chrome-bar literals that only
      Light reached. Where a collapsed rule loses the specificity that let it
      outrank `diagnose-workstation.css`'s depth idiom, restore the order by
      selector, never by `!important`.
      Re-base the stylesheet byte pins in `frontend/index.test.js` to the
      collapsed base selectors and drop its two Light-preservation assertions.
- [x] Retire the harness theme select and `theme` URL parameter in
      `harness/index.html` and `harness/main.js`, and confirm the harness still
      resolves the app tokens.
- [x] Re-point `mockups/diagnose-evidence-canvas.exploration/generate.py` and
      `mockups/finding-evidence-routing.exploration/build.mjs` at the single
      `:root` block per ADR 304, update their corruption self-checks and
      `tests/test_evidence_canvas_generator.py`, and regenerate every committed
      output so both `--check` steps pass.
- [x] Reduce `scripts/screenshots.local.mjs` to a no-theme wrapper and re-base
      `scripts/screenshots.local.test.mjs` so it still fails closed on a wrapper
      that reintroduces theme switching.
- [x] Re-point `DESIGN.md`'s token-home paragraph and palette section at the
      single `:root` block and the shipped dark values, and confirm
      `sh docs/scope/304-one-theme-probe.sh app` exits 0.

- [x] Inline the Dark arm of every `colors.dark ? a : b` in
      `frontend/diagnose-evidence-charts.js` and drop the `dark` flag it reads
      from the document class, extending `frontend/diagnose-evidence-charts.test.js`
      to pin the Dark constants; remove the `dataset.theme` read in
      `frontend/verify-workstation.js` the same way.

## 2. Re-base the browser contracts to one theme

- [x] In `frontend/cockpit-shell.browser.test.mjs`,
      `frontend/diagnose-workstation.browser.test.mjs`, and
      `frontend/diagnose-canvas-composition.browser.test.mjs`, remove the theme
      option from the openers, the `['light','dark']` loops, the in-test Theme
      toggle, the Light fixed-point cascade test, and the `theme` localStorage
      writes; keep every Dark assertion byte-for-byte and re-base the
      theme-invariant geometry test to assert the Dark values directly.
- [x] Apply the same rule to `frontend/diagnose-workstation-behavior.replay.mjs`,
      `frontend/diagnose-event-comparison-behavior.replay.mjs`, and
      `frontend/verify-660-story-behavior.replay.mjs`.
- [x] Re-base `mockups/diagnose-event-comparison-support-audit.mjs` so its five
      scenarios keep their identities on the one theme (it commits no captures).
- [ ] Re-base `mockups/finding-evidence-routing.exploration/contrast-audit.mjs`
      and `harness.mjs` to one theme and regenerate their committed reports.
- [x] Retire cockpit S3 and S10 and Diagnose S117 in
      `mockups/cockpit-shell.behavior.md` and
      `mockups/finding-evidence-routing.behavior.md` with the ADR 304 sanction
      quoted on each entry, in the same commit as their replay functions go, so
      `frontend/diagnose-behavior-ledger-parity.test.js` stays green, re-basing
      that test's mutation fixtures (the `all issued` / `none` literals it
      rewrites) onto the post-retirement inventory so each case still asserts
      what it asserts today; amend the cross-theme wording of S1 and S11 and
      every story that names both themes.
- [x] Run the fast gate and all ten browser legs locally against the no-fetch
      server; require zero failures and no skipped assertion, and
      `sh docs/scope/304-one-theme-probe.sh contracts` exiting 0.

## 3. Identity evidence and the record
- [x] Serve the ticket base and the revision from two worktrees on distinct
      ports with the same synthetic database, and record a computed-style
      identity diff of the Dark surface across the gated states and viewports
      under `openspec/changes/dark-only-theme/evidence/`, with the exact commands
      and their complete output.
- [x] Update `mockups/INDEX.md` with the one-theme revision and its evidence
      path.
- [x] Tick each task above only when implemented and verified; run `/review` at
      Full depth and resolve every blocking finding before opening one pull
      request. Do not merge.
