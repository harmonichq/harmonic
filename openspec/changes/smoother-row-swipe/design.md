## ADR 613 — One hook, one commit rule, for the row and the Prompt

The Queue row and the Prompt share `useSwipe`. #612 decided a smoother swipe
for the row; giving the Prompt a second, older swipe would be two
implementations of one gesture. Both take the same tracking, axis lock,
resistance, filled reveal and commit rule. The exit differs by caller, and is
the hook's to sequence: the row's leaves (ADR 613, the row leaves before it
acts); the Prompt's has none, because its next prompt already comes in.

## ADR 613 — The commit rule: half the row's width, or a flick

#612: "commit by velocity (about 500 px/s) or half the width". The width is
the swiping element's own (the row's, the Prompt card's). Travel is the
finger's, measured from the press, not the row's damped offset. Velocity is
the finger's over its last 100 ms of moves at release, and counts only once
the finger has passed the reveal's start (so a tap's jitter never flicks). A
finger moving right at release never commits. The would-commit verdict that
fills the reveal and the verdict at release are one predicate.

## ADR 613 — Axis lock at 10 px, and the page keeps vertical

A press decides its axis once it has moved 10 px (today's slop is 8). More
across than down makes it a swipe for the rest of the press; more down than
across leaves it to the page for the rest of the press, and it never becomes a
swipe. `touch-action: pan-y` stays on the swiping element.

## ADR 613 — Resistance past the reveal

Up to the reveal's width the row's offset is the finger's travel; past it the
row moves a fraction of the further travel. The mock sets the fraction; the
value Connor approves is written into §2.5 with the amendment. The row is
never drawn right of rest.

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
rises as it does for Snooze today. The leaving row carries the library's
`[data-closing]` marker and `aria-hidden`, so it has left for assistive tech
and the story runner waits for it. Where nothing transitions (outside a gated
screen) the action is called at once. The row ignores further presses while it
leaves.

## ADR 613 — One new token, `--ui-ease-accelerate`

#612 names "standard-accelerate" for the slide-off; the library has only a
standard and an emphasized easing, both decelerating. `--ui-ease-accelerate`
is Material 3's standard-accelerate, `cubic-bezier(.3, 0, 1, 1)`, which never
overshoots. The durations are the library's three: #612's "about 200 ms" is
`--ui-motion-standard` and its "about 250 ms" and "about 300 ms" are
`--ui-motion-emphasized` (280 ms), so no duration token is added.

## ADR 613 — Reduced motion

Nothing travels. A drag still follows the finger, since that is the person's
own movement, not the app's. A commit fades the row out over the fast
duration and closes its height at once; a cancel returns it at once.
