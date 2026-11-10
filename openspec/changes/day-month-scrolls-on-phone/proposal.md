# The phone's Day month scrolls inside itself

## Why

On a short phone, or for a month that spans six weeks, the Day month
drop-down ran past the bottom of the screen and over the tab bar: its last
week was cut off and no scrim was left to tap to close it (#649). The week rows
are locked at their height, and the room between the header and the tab bar
holds about four and a half of them on a 375 × 667 phone.

## What changes

- On phone the month drop-down ends at least a tap's strip of scrim above the
  tab bar, and the device's inset under it. Its weeks scroll inside it, under
  its name and ‹ ›, which stay put; it opens with the selected day's week in
  view. Tapping the strip closes it unchanged.
- This is the lock's one exception to "nothing scrolls inside a component"
  (§2.3 ban 6), chosen by the operator on 2026-11-10. The story check's nested
  scroll rule allows this one panel by name, with its reason, and nothing else.
- Desktop and tablet are unchanged: the popover never meets a tab bar, and its
  pane scrolls as the page.

## Impact

- The Day screen on phone, its stories, the lock doc's ban 6, §1.4 and §4.2
  DayRibbon, and the Storybook gate's nested-scroll rule and probes.
- The `surfaces` capability gains the requirement. No analyzer, cap, floor or
  staging predicate changes.
