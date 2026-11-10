# On a phone the document never scrolls

## Why

On a phone in Firefox for Android the tab bar stopped staying on screen
(#682). Opening Log carbs or the Settings password sheet scrolled the whole
document: each sheet rises from below the screen, and since #673 it takes
focus as it opens, so the browser scrolled the document by the sheet's height
(283 px on a 390 × 844 phone) to reach the focused field. The tab bar is the
bottom of the screen's box, not pinned to the viewport, so it went up with the
document; Firefox for Android collapses its address bar on a document scroll.

## What changes

- The app's screen box is the viewport and clips what is drawn past it, so
  nothing in it can make the document scroll: a rising sheet, a hit area at
  its edge, any later overflow. Sheets rise and take focus as before.
- The Advisory notice, which shares that box, scrolls as its own page on a
  screen too short for it.
- The browser smoke opens Log carbs on a phone and fails if the document
  scrolled, or could have, in any frame of the sheet's rise.
- No locked design changes; desktop and tablet are unchanged.

## Impact

- The app shell's style, the Advisory notice, the browser smoke, and the
  `surfaces` capability, which gains the requirement. No analyzer, cap, floor
  or staging predicate changes.
