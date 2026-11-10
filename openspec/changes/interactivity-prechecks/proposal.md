# Keyboard use and accessibility, checked on every story

## Why

The app had no systemic bar for keyboard use and accessibility: focus styles on
some components and scattered roles, with nothing to stop a new component from
shipping without them. A one-off sweep would decay as components land (#582).

## What changes

- The Storybook gate walks every story with the keyboard after its visual
  prechecks, and fails a story that breaks any of eight criteria: everything that
  responds to a tap is reachable by Tab; focus is visible; every control and
  graphic is named, and toggles expose their state; Tab follows reading order; a
  sheet or popover takes focus, keeps it, closes on Escape and returns focus to its
  trigger; a phone tap target is 44 px across; a status is announced; and the
  colour tokens hold their contrast, checked once.
- Every story passes them. The defects the walk found are fixed in the
  components, not exempted. The exemptions that remain are listed in the
  precheck's own allowlist, each with its reason.

## Impact

- The Storybook gate (`npm run test:ui`): its precheck rules and its story walk.
- Components whose keyboard or accessibility behaviour was fixed; their drawn
  look and the lock's tokens are unchanged.
- The `surfaces` capability gains the requirement.
