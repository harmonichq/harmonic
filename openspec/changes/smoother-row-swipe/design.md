## ADR 613 — One hook, one commit rule, for the row and the Prompt

The Queue row and the Prompt share `useSwipe`. #612 decided a smoother swipe
for the row; giving the Prompt a second, older swipe would be two
implementations of one gesture. Both take the same tracking, axis lock,
resistance, filled reveal and commit rule. The exit differs by caller, and is
the hook's to sequence: the row's leaves (ADR 613, the row leaves before it
acts); the Prompt's has none, because its next prompt already comes in.

The interface: `useSwipe(reveal, { held, onCommit, leaves })` returns
`{ revealed, filled, dragging, open, leaving, style, bind, exit }`. `reveal`,
`held`, `onCommit` and `revealed`, `dragging`, `open`, `style`, `bind` keep
today's meanings, and a swipe with no `onCommit` still settles open over its
reveal. `leaves` (the row passes true; the Prompt omits it) makes a commit
leave before it acts. `filled` is the would-commit verdict while dragging.
`leaving` is true while the element leaves, and `exit` is spread on it as
`usePresence`'s is: a `data-closing` id unique to the hook, and `aria-hidden`.

## ADR 613 — The commit rule: half the row's width, or a flick

#612: "commit by velocity (about 500 px/s) or half the width". The width is
the swiping element's own (the row's, the Prompt card's). Travel is the
finger's, measured from the press, not the row's damped offset. Velocity is
the finger's over its last 100 ms of moves at release, and counts only once
the finger has travelled the reveal's full width (88 px on a row, 96 px on a
Prompt). A
finger moving right at release never commits. The would-commit verdict that
fills the reveal and the verdict at release are one predicate. A pointer
cancel (the system takes the gesture) settles back and never commits,
whatever the verdict.

## ADR 613 — Axis lock at 10 px, and the page keeps vertical

A press decides its axis once it has moved 10 px (today's slop is 8). More
across than down makes it a swipe for the rest of the press; more down than
across leaves it to the page for the rest of the press, and it never becomes a
swipe. `touch-action: pan-y` stays on the swiping element.

## ADR 613 — Resistance past the reveal

Up to the reveal's width the row's offset is the finger's travel; past it the
row moves a fraction of the further travel. The mock sets the fraction; the
value Connor approves is written into §2.5 with the amendment. The row is
never drawn right of rest. The reveal spans from the row's trailing edge to
the right edge, its icon and label in its right-hand 88 px (96 on a Prompt)
column, so no strip opens between the row and the reveal past its width.

## ADR 613 — The reveal fills with the accent's tint, not the accent

Ban 5 forbids an accent-filled control, and the reveal is not a control. Once a
release would commit, the reveal's ground becomes `--primary` at 18% and its
icon and label take the accent, the tab bar's active-indicator idiom (§2.2),
over the fast duration; below the threshold it is today's rail ground. Under
reduced motion the change is instant.

## ADR 613 — The row leaves before it acts

On a commit the hook holds the row: it slides off to the left (its full width)
over `--ui-motion-standard` on `--ui-ease-accelerate`, then its height closes
to 0 over `--ui-motion-emphasized` on `--ui-ease-standard`, and only when both
have ended does it call the row's action, so the screen snoozes it and the bar
rises as it does for Snooze today. In the same update that calls the action the
hook returns to rest: a snoozed row is removed in that update and never shows
again, and an action that does not remove the row (a failed write, a story
whose fixture snoozes another subject) leaves it drawn at rest. The leaving row carries the library's
`[data-closing]` marker and `aria-hidden`, so it has left for assistive tech
and the story runner waits for it. Where nothing transitions (outside a gated
screen) the action is called at once. The row ignores further presses while it
leaves.

## ADR 613 — One new token, `--ui-ease-accelerate`, a third easing

#612 names "standard-accelerate" for the slide-off; the library has only a
standard and an emphasized easing, both decelerating. `--ui-ease-accelerate`
is Material 3's standard-accelerate, `cubic-bezier(.3, 0, 1, 1)`, which never
overshoots. The 2026-10-13 motion amendment's "two easings" becomes three by
this change's dated amendment, which records the token; §2.1 lists no motion
token and gains none. The durations are the library's three: #612's "about 200 ms" is
`--ui-motion-standard` and its "about 250 ms" and "about 300 ms" are
`--ui-motion-emphasized` (280 ms), so no duration token is added.

## ADR 613 — Reduced motion

Nothing travels. A drag still follows the finger, since that is the person's
own movement, not the app's. At release nothing moves: a commit fades the row
out where the finger left it, over the fast duration, and closes its height at
once; a cancel returns it to rest at once.
