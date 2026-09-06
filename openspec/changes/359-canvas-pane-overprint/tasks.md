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
- [ ] Keep Verify out of it by SPLITTING the one `.vw`-affecting rule in the
      widened block, `:is(.dw, .vw) .panes > .pane + .pane`
      (`frontend/diagnose-workstation.css:1699`) — do not pin it at 760px. Its
      `border-top` is the stacked layout's only horizontal divider, so pinning
      it would leave the newly stacked 761-831px band with no seam between the
      panes it has just stacked (measured on the unchanged tree: the second
      Diagnose pane computes `border-top-width` `1px` at 760px and `0px` at 761,
      800, 830, 831, 832 and 900px). Move a `.dw .panes > .pane + .pane` copy
      into the widened block so Diagnose keeps its seam wherever it stacks, and
      leave a `.vw`-only copy of the same declarations, verbatim, in its own
      `@media (max-width: 760px)` block. Verify has its own 900px stacking
      breakpoint in `frontend/verify-workstation.css` and is not otherwise part
      of this change.
- [ ] Carry the declarations across verbatim, including the `border-left: 0`.
      That half is inert — `frontend/theme.css:150` restates `border-left: 1px
      solid var(--wk-rule)` for the identical selector at identical specificity
      and loads later (`frontend/index.html:1344` against `:23`), and the
      measured `border-left-width` is `1px` at every width on both screens — so
      do not describe this rule as a "border-left to border-top flip", and do
      not clean the inert half up here: that would be a second, unrelated edit
      to the Verify-facing copy.
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
- [ ] Add one assertion to the Verify replay's S7 story
      (`frontend/verify-660-story-behavior.replay.mjs:225-239`, which already
      runs at 800px): the second `.panes > .pane` must compute
      `border-top-width` `0px` and `border-left-width` `1px`. S7's existing
      assertions — the inspector's box sits below the canvas pane's, and
      `.main-content` scrolls — hold whether or not the shared rule was widened,
      because Verify's own 900px breakpoint already stacked it, so without this
      the carve-out is asserted and never observed. Both values are the measured
      behaviour of the unchanged tree; the assertion pins them, it does not
      change them.
- [ ] The Verify replay passes 8 of 8 stories, S7 included, with that assertion
      in place.
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
