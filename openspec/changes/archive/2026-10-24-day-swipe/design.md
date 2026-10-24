## ADR 619 — The Day swipe is the one hook's step form

The ticket asks for a two-way form of `useSwipe`, not a second swipe. The
axis lock, the finger's travel and speed, the one would-commit predicate, the
resistance fraction and the pointer-cancel rule stay the row's (ADR 613); the
step form changes only which ways the element may travel and what a commit
does.

The interface: `useSwipe(reveal, { held, onCommit, leaves, step })`, where
`step?: { can: (way: -1 | 1) => boolean; onStep: (way: -1 | 1) => void }`.
`way` is the day's direction: `1` is the next day, reached by moving the
finger left; `-1` is the previous day, reached by moving it right. With
`step`, `reveal`, `held`, `onCommit` and `leaves` are unused (the Day screen
passes `0` and omits them), and the hook returns the same
`{ dragging, style, bind }` as today plus `peek: -1 | 1 | null`, the way the
element is drawn off rest (or sliding), so the caller draws that way's day
beside it. Without `step` the hook behaves exactly as it does today; the row's
and the Prompt's stories are the proof.

## ADR 619 — Following the finger, both ways

Once the axis is across, the element's offset is the finger's travel, one to
one, in a way whose `can` is true. In a way whose `can` is false the element
moves `RESISTANCE` (0.3) of the travel from rest, and a release there never
commits. `can` is latched when the axis is decided: a way whose `can` was false then stays resisted for the whole press, and a release commits only if `can` was true then and is still true at release, so a month read that lands mid-drag never commits to a day the body did not show.

## ADR 619 — The commit rule, mirrored

A release commits a way when the finger has travelled half the element's
width that way, or is moving that way faster than 500 px/s over its last
100 ms having travelled at least `STEP_FLICK_MIN` (48 px) that way, and that
way's `can` is true. The 48 px stands in for the reveal the row's flick
needs; the mock sets it and the amendment records the value Connor approves.
A finger moving against the way it travelled never commits. A pointer cancel
eases back and never commits.

## ADR 619 — The screen's edges are the platform's

A press that starts within `EDGE` (24 px) of the Day screen's left or right
edge never becomes a step swipe, so the system's back gesture keeps both
edges (§1.4). The edges are the Day screen root's box, which is the
viewport on a phone and the 390 px frame in a story, so a play and the replay
can press either edge. The mock sets the width; the amendment records the value
approved. This applies to the step form only: a row or a Prompt is inset from
the edge by the screen's own gutter.

## ADR 619 — The commit slides the neighbour in, then the day changes

On a commit the element and the neighbour beside it travel together until the
neighbour is at rest: over `--ui-motion-standard` on `--ui-ease-standard`,
the decelerating tween the library's entries use, which never overshoots.
Then the hook calls `onStep(way)` and is back at rest in the same update, so
the neighbour, now the selected day, is drawn where it already was. An
ease-back takes `--ui-motion-emphasized` on `--ui-ease-standard`, as a row's
does. Presses are ignored while a step slides. Under reduced motion
(`--ui-motion-move: 0`) the element follows the finger while it is down, as a
row does, and nothing travels after release: a commit changes the day in
place at once, and an ease-back is instant.

## ADR 619 — The adjacent day with data, through the navigator

`day-model.ts` gains `adjacentDay(iso, way): string | { read: string } | null`.
It walks the days the navigator serves (the served month with its week of
padding each side, then any month the Day screen has read) from `iso` in
`way`'s direction and returns the first with `has_data`. When it walks off the
served days without one, it returns `{ read: month }` for the next month in
that direction if that month lies inside the status's data span
(`monthSpan()`), and `null` otherwise. It does not read; it says what to read.

The Day screen reads ahead. Whenever the selected day changes, for each way
whose `adjacentDay` is `{ read }`, it calls the `readMonth` it already takes
for the month drop-down and redraws when the read lands, walking again (a gap
longer than a month reads the next month, bounded by the span). `can(way)` is
true only when `adjacentDay` returns a day. Without `readMonth` (a story that
passes none) a way that needs a read stays resisted. A failed read leaves that
way resisted until the selected day changes again; the drop-down's own
Unavailable + Retry is untouched.

## ADR 619 — Where the swipe lives

The step form binds the phone Day body (`.ui-dayscreen__body` in the day
view) and translates a track inside it, `.ui-dayscreen__track`, which holds
the day content and its neighbour. The body itself keeps `.ui-push` and its
drill-down transition untouched: that rule (`shared.css`, `[data-push] >
.ui-push`) transitions translate over the emphasized duration, which reduced
motion shortens to the fast duration rather than removing, so the swipe never
moves the `.ui-push` element. The track's transitions are the ones this ADR
sets, each multiplied by `--ui-motion-move`, and none while dragging. It binds
only when the layout is phone, the view is the day (not the Prompts),
the screen state is ready or stale, and neither the month nor the Log carbs
sheet is open. The neighbour drawn beside the day content is the same day content
for the adjacent day: its insulin bar and chart, or the chart's skeleton when
its timeline is not served, beside the same Lows and Rises rows, which are the
store's and not the day's. The body keeps `touch-action: pan-y`, so the page
still scrolls vertically.

## ADR 619 — Story driver

`gesture.ts`'s `swipe`, `hold` and `scrollThenSwipe` keep their signatures. A
positive `dx` already drags right. An optional start fraction (default 0.7, as
today) lets a play press within the edge band.
