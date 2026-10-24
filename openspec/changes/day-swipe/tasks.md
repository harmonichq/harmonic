## 0. Base

- [x] 0.1 Per ui-craft `revise` §1, render the before shots from this branch's base at 390x844: Storybook `Screens/Day` Default (phone) and PickDayPhone, and `Foundations/Motion` → Snooze swipe (mid-drag and just after release), the last as proof the row's swipe is unchanged after 1.x

## 1. The hook (`frontend/ui/motion.ts`, ADR 619)

- [x] 1.1 The interface ADR 619 states: `useSwipe(reveal, { held, onCommit, leaves, step })` with `step?: { can, onStep }`, returning today's fields plus `peek`; without `step` nothing the hook does changes
- [x] 1.2 Two-way tracking: one to one in a way whose `can` is true, `RESISTANCE` from rest in a way whose `can` is false; `can` latched when the axis is decided
- [x] 1.3 The mirrored commit predicate: half the element's width that way, or a flick over 500 px/s that way having travelled `STEP_FLICK_MIN`, and `can` true both when the axis was decided and at release; `pointercancel` never commits
- [x] 1.4 `EDGE`: a press within it of the Day screen root's left or right edge never becomes a step swipe
- [x] 1.5 The commit: element and neighbour travel to rest, then `onStep(way)` with the hook at rest in the same update; presses ignored while it slides; under `--ui-motion-move: 0` the step is at once and the ease-back instant
- [x] 1.6 Update the file's header comment for the step form, in its idiom
  - `EDGE` and `STEP_FLICK_MIN` keep their defaults (24 px, 48 px) until Connor approves values in the replay; the approved values are written here and in 6.1 after his "locked".

## 2. The adjacent day (`frontend/ui/day-model.ts`, ADR 619)

- [x] 2.1 `adjacentDay(iso, way)`: the nearest served day with `has_data` that way across the served month, its padding and every read month; `{ read: month }` when the walk leaves the served days inside `monthSpan()`; `null` otherwise

## 3. The Day screen (`DayScreen.tsx`, `DayScreen.css`, `shared.css`)

- [x] 3.1 Bind the step form on the phone Day body only where ADR 619 says, with `can` from `adjacentDay` and `onStep` selecting that day (so `onDay` reads it, as a pick does)
- [x] 3.2 Read ahead: on each selected day, read the month each way's `adjacentDay` names through `readMonth`, and redraw when it lands
- [x] 3.3 Inside the body, a track (`.ui-dayscreen__track`) holding the day content and, on the `peek` side, the neighbour's (insulin bar and chart, or the skeleton); the hook's style goes on the track, never on the `.ui-push` body; `touch-action: pan-y` on the body; the track's transitions on the existing motion tokens, multiplied by `--ui-motion-move`, none while dragging
- [x] 3.4 Update the screen's header comment for the swipe, in its idiom

## 4. The story driver and the stories

- [x] 4.1 `frontend/ui/gesture.ts`: an optional start fraction on `swipe`, `hold` and `scrollThenSwipe` (default 0.7), the signatures otherwise unchanged
- [x] 4.2 `Foundations/Motion` → Day swipe (`frontend/ui/Motion.stories.tsx`): on the phone Day screen with the story month reader, replays a short drag that eases back, a slow swipe left to the next day, a flick right back, a swipe right across May 1 into April 30, a swipe right from April 24 that reads April, and a swipe left on the latest day that is resisted; the Reduced motion story's picker reaches it; a play presses Replay and waits for its last step, so the gate runs the replay
- [x] 4.3 `Screens/Day`: SwipeNextPhone, SwipePreviousPhone (header, chart source and insulin bar all name the stepped-to day; the skeleton where its timeline is not served), SwipeMonthPhone (May 1 to April 30 inside the served weeks), SwipeReadMonthPhone (April 24 reads April through the month reader, then steps), SwipeLastDayPhone (resisted: the body moves less than the finger, the day unchanged), SwipeShortPhone, SwipeFlickPhone, SwipeEdgePhone (a press at the left edge and one at the right: nothing moves), SwipeScrollPhone, SwipeCancelPhone, SwipeReducedPhone (from the first frame after pointerup the track sits at rest and stays there, no frame showing an intermediate translate, and the day changes in place), SwipeDesktop (the same drag moves nothing)
- [x] 4.4 `Screens/Day` PromptSwipePhone also asserts the header's day is unchanged after its swipe
- [x] 4.5 `npm run test:ui` clean for every story above and for the `Screens/Queue` swipe stories and `Foundations/Motion` → Snooze swipe; `UI_STORY=<id part>` while iterating

## 5. The contract test

- [x] 5.1 `frontend/ui/app/live.contract.test.mjs`, the showcase: `adjacentDay` of the latest day with data each way, and of the served navigator's first day toward the earlier month, which names a month to read; after `live.readMonth` of that month, the day it then returns. Literal values read once from the showcase's served answers

## 6. The amendment (`docs/design/recommendations-redesign.md`)

Quote only words Connor wrote on #612, #614, #619 or this change's pull request, or that the coordinating session relays as his verbatim words; otherwise cite the issue and date without quotation marks. Never edit an earlier dated amendment.

- [x] 6.1 §2.5, one new amendment dated the day it is written, headed for the Day swipe (#619), refining the 2026-10-23 amendment's part 4: the body follows the finger both ways and the adjacent day with data comes in beside it; the mirrored commit rule; the flick's minimum travel and the edge width as approved; the resistance where no further day exists; the commit's slide on the standard duration and easing, the ease-back on the emphasized; reduced motion changes the day in place; phone only, not in the Prompts; the month drop-down the visible equivalent
- [x] 6.2 §1.4: the Day-swipe row rewritten for 6.1, citing it
- [x] 6.3 §1.3: the Day row's "stepping to the next or previous day (skeleton)" gains "mid-swipe, the adjacent day beside it", citing 6.1
- [x] 6.4 §4.2: DayChart (17) gains its mid-swipe state (the next or previous day beside it, or its skeleton), citing 6.1
- [ ] 6.5 The status list at the top: a line for this amendment, written once Connor says "locked", quoting him
- [x] 6.6 `openspec/changes/recommendations-redesign/` is not edited here

## 7. Verify and evidence

- [x] 7.1 Run each complete suite of the pull-request gate once, on the commit that will be pushed
- [x] 7.2 Attach to the pull request: before/after frames for 0.1's stories; a screen recording or frame strip of the Day swipe replay and of it under reduced motion; the precheck output; the base SHA. Ask Connor to replay `Foundations/Motion` → Day swipe and say "locked"; 6.5 and the approved values in 1.6 and 6.1 land after his word, in the same pull request
