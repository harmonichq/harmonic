# Findings crumb focus-return disposition

Date: 2026-09-05

The merged workstation run failed once because the test focused the **Findings**
crumb while the drilled case file still showed its asynchronous opening state,
then sent Enter in a separate action. The pending case-file response repainted
the breadcrumb between those actions, removing the focused button and leaving
focus on `BODY`; no crumb activation occurred, so no return-row focus event was
expected.

This is an existing test-setup race, not a phase-2 runtime regression:

- The failing current probe recorded the breadcrumb repaint and focus loss
  before Enter could activate it (`focus-current.txt`, iteration 7).
- The same test and the relevant `requestCase`, breadcrumb repaint, and pending
  focus lifecycle are present in the pre-phase-2 checkout. Its 8/8 probe pass
  shows only that the race did not win in that sample.
- The existing observable settled condition is the rendered case header at
  `#level .inner .who`, which replaces the visible “Opening case file…” state.

The browser test now waits for that served case header before focusing the
breadcrumb. It retains keyboard activation and the exact
`finding:carb_undercount` returned-row focus assertion. No production file was
changed.

Results:

- Focused test: 1/1 passed — `focus-return-settled-focused.txt`
- Complete Diagnose workstation browser suite: 60/60 passed —
  `diagnose-workstation-browser-focus-settled.txt`
