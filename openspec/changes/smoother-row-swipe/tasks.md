## 0. Base

- [x] 0.1 Per ui-craft `revise` §1, render the before shots from this branch's base: Storybook `Foundations/Motion` → Snooze swipe (frames mid-drag and just after release), `Screens/Queue` SwipeSnoozeUndoPhone and `Screens/Day` PromptSwipePhone, at 390x844

## 1. The hook (`frontend/ui/motion.ts`, ADR 613)

- [x] 1.1 Axis lock at 10 px: across first makes the press a swipe; down first leaves it to the page for the rest of the press
- [ ] 1.2 Tracking one to one to the reveal, resistance past it at the fraction the mock settles; never right of rest
  - Built with `RESISTANCE = 0.3` in `frontend/ui/motion.ts`, the default the replay shows; ticked once Connor approves the value in the replay, with 5.1's.
- [x] 1.0 The interface ADR 613 states: `useSwipe(reveal, { held, onCommit, leaves })` returning `{ revealed, filled, dragging, open, leaving, style, bind, exit }`
- [x] 1.3 One would-commit predicate (half the element's width of finger travel, or a leftward velocity over the last 100 ms above 500 px/s having travelled the reveal's full width), read both for `filled` while dragging and at release; `pointercancel` settles back and never commits
- [x] 1.4 The row's exit: hold the element, slide it off, close its height, then call the action; `[data-closing]` and `aria-hidden` while it leaves; the action at once where nothing transitions; presses ignored while it leaves; the hook back at rest in the same update that calls the action, so a row the action does not remove is drawn at rest
- [x] 1.5 The Prompt's caller keeps no exit: its action at release, as today
- [x] 1.6 Update the file's header comment for the new behaviour, in its idiom

## 2. Tokens and CSS

- [x] 2.1 `frontend/ui/tokens.css`: `--ui-ease-accelerate: cubic-bezier(.3, 0, 1, 1)` beside the two easings
- [x] 2.2 `frontend/ui/shared.css` `.ui-swipe-settle`: the ease-back on `--ui-motion-emphasized`; the slide-off and close-up, each multiplied by `--ui-motion-move` so reduced motion fades and closes at once
- [x] 2.3 `QueueRow.css` and `PromptCard.css`: the reveal spans from the element's trailing edge to the right edge, its icon and label in its right-hand 88 px (96 px) column; its filled state (`--primary` at 18%, icon and label in the accent, over the fast duration)

## 3. Callers

- [x] 3.1 `QueueRow.tsx` and `PromptCard.tsx` take the hook's new return (the fill, the leaving state) with no other change to what they print

## 4. The story driver and the stories

- [x] 4.1 `frontend/ui/gesture.ts`: `swipe` keeps its signature and takes an optional pace, so a play can drag slowly or flick, and a vertical-first variant for the scroll case
- [x] 4.2 `Foundations/Motion` → Snooze swipe (`frontend/ui/Motion.stories.tsx`): replays a short drag that eases back, a slow drag past half, Undo, and a flick; the Reduced motion story's picker reaches it; a play presses Replay and waits for the bar and then its Undo, so the gate runs the replay
- [x] 4.3 `Screens/Queue` SwipeSnoozeUndoPhone: drags past half (not 64 px); asserts the reveal filled before release, no bar until the row has gone, Undo restores the row
- [x] 4.4 `Screens/Queue`: SwipeFlickPhone (a flick short of half snoozes), SwipeScrollPhone (vertical first: nothing moves, no reveal), SwipeNotSavedPhone (a snooze write that fails once: the row back at rest, Not saved + Retry), SwipeCancelPhone (a `pointercancel` past half: no bar, the row at rest), SwipeNoopPhone (a row the fixture does not snooze: after the action the row is drawn at rest, no `[data-closing]` left), SwipeReducedPhone (`[data-motion-reduce]`: after pointerup the row's translate never changes, and it fades)
- [x] 4.5 `Screens/Day` PromptSwipePhone: drags past half the card's width; a short drag eases back without recording; a flick short of half records Not sure; a vertical-first drag records nothing
- [x] 4.6 `npm run test:ui` clean for every story above; `UI_STORY=<id part>` while iterating

## 5. The amendment (`docs/design/recommendations-redesign.md`)

Quote only words Connor wrote on #612, on this change's pull request, or that the coordinating session relays to this one as his verbatim words; otherwise cite "#612, 2026-10-23" without quotation marks. Never edit an earlier dated amendment.

- [ ] 5.1 §2.5, one amendment dated 2026-10-23 with four parts: (1) the smoother swipe as ADR 613 sets it, with the resistance fraction approved in the replay, and `--ui-ease-accelerate` as a third easing beside the 2026-10-13 motion amendment's two; (2) an open Pattern, Setting or habit card swipes to Snooze as a row does, sized for the card, and the phone has no Snooze text action (desktop keeps it, with S), recorded as the operator's decision after the conflict with §1.4's "a swipe is a shortcut, never the only way" and WCAG 2.5.7 was raised, superseding the 2026-10-13 "Snooze has a visible control on the phone"; (3) on the phone the open card's chevron closes it to its row, leaving nothing open, and tapping the row reopens it, the closed state the screen's alone and gone on a tab change; (4) a horizontal swipe on the Day body steps to the previous or next day with data, the skeleton while it loads, across month boundaries through the day navigator, the screen's edges left to the platform, and the month drop-down the visible equivalent on both layouts
  - Written, with the resistance fraction stated as pending (the mock shows 0.3); ticked once Connor approves the value and says "locked", when it lands in the same amendment.
- [x] 5.2 §1.4: the row-swipe row rewritten for 5.1 (1); new rows for 5.1 (2), (3) and (4) with their desktop equivalents; the closing paragraph names the phone's Snooze as the one swipe with no visible equivalent, citing the amendment
- [x] 5.3 §1.3: Queue gains "lead card closed (nothing open)" and "a card mid-swipe"; Day gains "stepping to the next or previous day (skeleton)"
- [x] 5.4 §4.2: QueueRow (the filled reveal; leaving), PromptCard (the filled reveal), PatternCard, SettingCard and HabitCard (phone: the swipe, no Snooze text action; the chevron a control), each as 5.1 states it
- [ ] 5.5 The status list at the top: a line for this amendment, built by #614, written once Connor says "locked", quoting him
- [x] 5.6 The active change's surfaces spec (`openspec/changes/recommendations-redesign/specs/surfaces/spec.md`) is not edited here: #614 changes its Snooze sentence when it builds

## 6. Verify and evidence

- [ ] 6.1 Run each complete suite of the pull-request gate once, on the commit that will be pushed
- [ ] 6.2 Attach to the pull request: before/after frames for 0.1's stories; a screen recording or frame strip of the Snooze swipe replay (cancel, slow commit, flick, Undo) and of it under reduced motion; the precheck output; the base SHA. Ask Connor to replay `Foundations/Motion` → Snooze swipe and say "locked"; 5.5 and the resistance value in 5.1 land after his word, in the same pull request
