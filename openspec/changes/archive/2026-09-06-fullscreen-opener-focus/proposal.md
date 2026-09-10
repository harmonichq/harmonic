# Restore one-chart fullscreen's keyboard focus (#365)

## Why

The Diagnose behavior ledger states one rule for reader-driven navigation —
"Reader-driven navigation now lands keyboard focus on the opened detail
container and returns it to the originating queue row when the reader comes
back. Repaints that do not navigate keep focus where the reader left it"
(`mockups/finding-evidence-routing.behavior.md:2249-2251`) — and one rule for the
two temporary viewport states: close and Escape "restore the exact prior shell
reading position, window, selected finding, and opener focus" (`:3211-3213`).

Expanding one chart is reader-driven navigation: the Full control's handler
drills through `showChartInspector` into `drillFinding`. It honors neither rule.

On the way in, the navigation does ask for the opened container — it sets a
pending focus of the inspector level and applies it at the end of the repaint.
But entering fullscreen has just marked that inspector inert, so the focus call
lands on nothing and the reader is left on the document body. The navigation asks
for the opened container and is handed the one it just hid.

On the way back, dismissal repaints and returns without focusing anything, and
the repaint destroys the tile's Full control, so the opener is simply gone.
Measured on the generated QA database, after Escape and after the header Close
control the focused element is the document body.

The All charts state is held to the same dismissal sentence and ships it, proven
twice over — replay story S116, and the `#341` browser assertion that dismissal
leaves focus on the Charts control. Its own on-open behavior settles nothing
here: opening All charts is not navigation, because its control only raises the
catalog flag and repaints, so the ledger's second sentence governs it and leaving
focus in place is conformant. One-chart fullscreen is unlike it on exactly that
point, because its Full control drills.

A reader working the keyboard therefore loses their place twice over every time
they expand a chart, on a surface whose whole job is to be read carefully.

## What changes

- Entering one-chart fullscreen lands keyboard focus on the expanded chart's own
  container — the single focal tile that fullscreen paints — instead of on the
  inspector the state has just made inert.
- Dismissing one-chart fullscreen restores focus to the Full control of the chart
  that was expanded, after the repaint that re-creates that control, in the same
  idiom the All charts state already uses for its own opener.
- Each side has one seam, so every route inherits its fix: one Full control
  handler opens the state, and the header Close control and the Escape key both
  route through one dismissal function.
- A browser regression proves both sides from both opener contexts — expanding
  from the stage tile, and expanding from a cell of an open All charts catalog,
  which dismissal repaints back into and where the opener is that cell's own
  control.

## Impact

- Diagnose only. No analyzer, projection, safety verdict, staging predicate,
  ranking, fixture, generated artifact or dose advice changes.
- The behavior ledger and its replay are unchanged. This implements rules the
  ledger already states; it adds no story and retires none. The frozen replay is
  a verification leg for this change, not an artifact it may edit.
- Deliberately out of scope, having been measured rather than assumed: from
  either temporary state a Tab reaches the application footer. Both states mark
  the underlying Diagnose controls inert identically, neither the ledger nor the
  surfaces specification asks a temporary state to confine the Tab ring, and the
  shipped All charts state — which the ledger records as conformant — behaves the
  same way. Changing that is a behavior change owed by both states together, and
  belongs to its own ticket.
