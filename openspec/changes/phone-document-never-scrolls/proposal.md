# On a phone the document never scrolls

## Why

On a phone in Firefox for Android the tab bar stopped staying on screen
(#682). Opening Log carbs, the Settings password sheet (Update) or the Changes
End sheet scrolled the whole document: each sheet rises from below the screen
and takes focus as it opens, so the browser scrolled the document by the
sheet's height (283, 262 and 189 px on a 390 × 844 phone) to reach the focused
control. The tab bar is the bottom of the screen's box, not pinned to the
viewport, so it went up with the document; Firefox for Android collapses its
address bar on a document scroll.

## What changes

- While the tab bar is drawn, the app's screen box clips what is drawn past
  it, so nothing in it can make the document scroll: a rising sheet, a hit
  area at its edge, any later overflow. Sheets rise and take focus as before.
- The rail layout (tablet, desktop, a phone on its side) is unchanged,
  including its overflow on a screen shorter than the rail, which the document
  still scrolls into reach. How that layout fits a short screen is left open.
- The browser smoke opens Log carbs and Update on a phone and fails if the
  document scrolled, or could have, in any frame of a rise; and on a short
  wide screen it fails if the rail's last item or the end of a pane cannot be
  brought on screen.
- No locked design changes.

## Impact

- The app shell's style, the browser smoke, and the `surfaces` capability,
  which gains the requirement. No analyzer, cap, floor or staging predicate
  changes.
