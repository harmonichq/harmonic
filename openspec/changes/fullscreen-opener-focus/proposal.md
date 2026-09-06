# Restore the one-chart fullscreen opener's focus (#365)

## Why

The Diagnose behavior ledger holds All charts and one-chart fullscreen to one
rule: close and Escape "restore the exact prior shell reading position, window,
selected finding, and opener focus"
(`mockups/finding-evidence-routing.behavior.md:3211-3213`). The All charts half
of that rule ships and is proven twice over — replay story S116, and the `#341`
browser assertion that dismissal leaves focus on the Charts control.

The one-chart fullscreen half was never implemented. Dismissal repaints the
canvas and returns without focusing anything, and the repaint destroys the
tile's Full control, so the reader's place is simply gone. Measured on both
generated QA databases, after Escape and after the header Close control the
focused element is the document body, or whatever the reader had tabbed to in
the meantime — never the Full control that opened the state.

A reader working the keyboard therefore loses their position every time they
expand a chart and come back, on a surface whose whole job is to be read
carefully.

## What changes

- Dismissing one-chart fullscreen restores focus to the Full control of the
  chart that was expanded, after the repaint that re-creates that control, in
  the same idiom the All charts state already uses for its own opener.
- Both dismissal paths inherit the fix from one place: the header Close control
  and the Escape key already route through the single dismissal seam.
- A browser regression proves both dismissal paths land focus on the expanded
  chart's own Full control, beside the existing fullscreen dismissal test.

## Impact

- Diagnose only. No analyzer, projection, safety verdict, staging predicate,
  ranking, fixture, generated artifact or dose advice changes, and nothing moves
  on screen.
- The behavior ledger and its replay are unchanged. This implements a rule the
  ledger already states; it adds no story and retires none.
- Deliberately out of scope, having been measured rather than assumed: entering
  fullscreen leaves focus on the document body, and a Tab from there reaches the
  application footer. The shipped All charts state, which the ledger records as
  conformant, behaves identically on open, and neither the ledger nor the
  surfaces specification asks a temporary state to take focus when it opens.
  Changing that is a behavior change owed by both states together, and belongs
  to its own ticket.
