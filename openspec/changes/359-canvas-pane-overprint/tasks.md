# Tasks — Stop the Diagnose canvas pane overprinting the findings queue (#359)

## 1. Freeze the red case

- [ ] Add one browser case to `frontend/diagnose-workstation.browser.test.mjs`,
      beside the existing `#341 · the overview keeps its full name at the split
      tablet width` case, that opens the app through the suite's own
      `openApp(browser, { state: 'typical', viewport, history: true, appSource:
      'fixture' })` at 761, 768, 800 and 830 x 1024 and asserts, for the first
      two `#level .qrow` rows at each width, that
      `document.elementFromPoint(rect.left + 6, rect.top + rect.height / 2)`
      returns the row or a descendant of it. Assert paint and hit ownership this
      way, never by comparing bounding rectangles: a clipped element still
      reports its unclipped box, so a rectangle assertion passes on the broken
      surface and fails on the fixed one.
- [ ] Extend the same case with the control widths 900 and 1024 x 1024, where
      the two-pane split must survive unchanged and the same rows must own their
      own hit points.
- [ ] Run the case against the unchanged stylesheet and record that it fails at
      761, 768 and 800 — the hit returns a canvas or a chart control, not the row
      — and passes at 830, 900 and 1024. This is the fail-first evidence.

## 2. Stop the split forming where it cannot fit

- [ ] Measure the canvas pane's own minimum content width in the running
      fixture app (`.canvas-pane` `scrollWidth` while the split is engaged;
      triage measured 402px on the committed payload) and derive the smallest
      viewport width at which the split can hold it beside the fixed
      `var(--side, 430px)` inspector column. Record the measured numbers.
- [ ] Raise the Diagnose stacking breakpoint at
      `frontend/diagnose-workstation.css:1677` from `@media (max-width: 760px)`
      to that measured threshold, so the whole former dead band gets the
      existing narrow layout rather than an unusable split.
- [ ] Keep Verify out of it: the widened block contains exactly one
      `.vw`-affecting rule, `:is(.dw, .vw) .panes > .pane + .pane` (the
      border-left to border-top flip). It must keep its existing 760px bound, so
      Verify renders identically at every width. Verify has its own 900px
      stacking breakpoint in `frontend/verify-workstation.css` and is not part
      of this change.
- [ ] Contain the canvas pane horizontally at every width so residual overflow
      clips inside the canvas instead of painting across the pane boundary.
      Prefer `overflow-x: clip` over `overflow-x: hidden`: `hidden` on one axis
      forces the other axis to `auto` and would give the pane a vertical
      scrollport it does not have today. Triage measured two visibly spilling
      elements at the first split width above the threshold, so this rule is
      earned by observed paint, not added as a precaution.
- [ ] Change nothing else in the stylesheet: no new pane widths, no
      `var(--side)` change, no narrow-layout redesign, no touch-target or
      typography edits.

## 3. Prove it

- [ ] The new case passes at all six widths, and the workstation browser leg
      reports one more passing test than its 60-test baseline with zero
      failures.
- [ ] The Verify replay passes 8 of 8 stories, which includes its own S7 story
      at 800px — the width most exposed to a mistake in the Verify carve-out
      above.
- [ ] The fast gate is green with no browser present and no Playwright
      environment set, proving the regression case cannot leak into it.

## 4. Record

- [ ] Amend `mockups/finding-evidence-routing.behavior.md` with one dated
      amendment for issue #359: the two-pane split now has a width floor, which
      is what makes the 2026-08-19 "stays one line at every width the two-pane
      split can produce" assertion true rather than vacuous, and the narrow
      layout below that floor is the existing one. Do not add a
      `mockups/INDEX.md` row: the surface already has one and this change
      asserts no new concept.
- [ ] Record the shipped threshold and the measurement it came from in this
      change's `design.md` under the existing `## ADR 359` heading.
- [ ] Stop on the ticket branch with the work committed and the verification
      output recorded. This ticket is a child of the Diagnose QA sweep (#350):
      the sweep coordinator merges this branch into `qa/diagnose-sweep` and
      opens the single pull request. Do not push, do not open a pull request,
      do not merge.
