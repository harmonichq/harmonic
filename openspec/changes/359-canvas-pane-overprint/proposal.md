# Stop the Diagnose canvas pane overprinting the findings queue (#359)

## Why

Between 761px and about 830px wide, Diagnose keeps its two-pane split but the
canvas pane's own furniture no longer fits the track it sits in. The pane
carries no overflow rule, so its header, chart and controls paint across the
pane boundary and over the left edge of every findings-queue row. Measured on
the committed synthetic payload at 768x1024: the canvas pane's right edge is
338px while its own minimum content is 402px wide, 41 visible descendants
extend past the boundary, and a hit test inside the first queue row returns a
chart canvas rather than the row. The rank number and the first word of every
row are covered, and the covered strip belongs to the canvas, not to the queue.

The band contains 768px, iPad portrait. The queue is how a wearer reads which
advisory finding comes first, so a queue whose ordering column is painted over
by another pane misreports the one thing it exists to report.

`mockups/finding-evidence-routing.behavior.md` (2026-08-19, issue #41) settles
the owner ruling this violates and asserts that the canvas header "stays one
line at every width the two-pane split can produce". The header does stay one
line here; the line is simply wider than its column, and nothing clips it.
`openspec/specs/surfaces/spec.md` requires that at phone or tablet width every
affected queue row still opens its existing finding details — at these widths
the leftmost strip of each row answers to the canvas instead.

Issue #302's triage recorded "the workstation's one stylesheet breakpoint is
760px; 768-1024 keep the two-pane layout" and deferred moving that breakpoint.
This change is where that deferral lands.

## What changes

- Diagnose stops forming a two-pane split at widths where the canvas pane
  cannot hold its own minimum content, so the whole dead band gets the narrow
  layout that already exists below the breakpoint.
- The canvas pane contains its content horizontally, so residual overflow at
  any width clips inside the canvas instead of painting over the inspector.
- A browser regression case fixes the band in place: at 761, 768, 800 and 830px
  the first findings-queue rows answer their own hit tests, and at the split
  widths above the new threshold nothing changes.
- The one border rule the Diagnose stylesheet shares with Verify is split
  rather than moved, so Diagnose keeps its horizontal seam wherever it stacks
  while Verify's copy stays exactly where it is, and the Verify replay gains one
  assertion that observes that carve-out instead of assuming it.
- The frozen behavior ledger records that the two-pane split now has a floor,
  which is what makes the 2026-08-19 one-line assertion true again.

## Risk contract

- **Must prevent:** any pane painting over its neighbour at any width; a
  breakpoint chosen by taste rather than measured content width; a change to
  Verify's rendering; a rectangle-based assertion standing in for a paint or
  hit-test assertion, since a clipped element still reports its unclipped box;
  any change to advisory analysis, staging verdicts, or served data.
- **Must recover:** nothing automatically.
- **Accepted failure:** viewports between the old and new thresholds lose the
  side-by-side split and get the existing narrow layout, including its
  touch-sized controls, on a desktop window that happens to be that narrow.
- **Unsupported:** verification against real pump data, a fetch-enabled server
  run, or any redesign of the narrow layout itself.
- **Evidence owed:** the new case failing first against the unchanged
  stylesheet for the right reason; the fast gate green with no browser present;
  the Diagnose workstation browser leg green; the Verify replay green at its own
  800px story, with that story now asserting the second pane's computed
  `border-top-width` and `border-left-width` so the carve-out is measured rather
  than assumed.

## Impact

Confined to the Diagnose stylesheet, its browser suite, the frozen behavior
ledger, and this OpenSpec record. No API, stored data, analyzer,
recommendation, safety predicate, staging verdict, or pump setting changes.
