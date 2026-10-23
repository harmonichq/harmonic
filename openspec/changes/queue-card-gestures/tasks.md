## 0. Base

- [ ] 0.1 Per ui-craft `revise` §1, render the before shots from this branch's base at 390x844: Storybook `Screens/Queue` PatternOpenPhone, SettingDetailPhone, HabitOpenPhone, SnoozeUndoPhone and MidSwipePhone, and `Foundations/Motion` → Transient bar

## 1. The shared swipe (ADR 614)

- [ ] 1.1 `frontend/ui/components/QueueRow/QueueRow.tsx`: extract the row's swipe wrapper into the exported `SnoozeSwipe` (the hook bound on the wrapper, the Snooze reveal, the moving element last); `QueueRow` renders it with no change to what a row prints or how it swipes
- [ ] 1.2 `QueueRow.css`: the reveal spans the moving element's full height, its icon and label centred in the 88 px column, for a row and a card alike; the card's rounded corners clip the reveal

## 2. The cards

- [ ] 2.1 `PatternCard.tsx`: `collapsible` becomes `onCollapse`; the chevron, drawn only with it, is an `icon` role button (44 px) named by the card's title, `aria-expanded="true"`, calling `onCollapse`
- [ ] 2.2 `SettingCard.tsx` and `.css`: the same `onCollapse` and chevron at the end of the title line
- [ ] 2.3 Both cards' header comments say the screen decides whether Snooze is drawn (ADR 614), in their idiom

## 3. The Queue screen (`frontend/ui/screens/Queue/QueueScreen.tsx`)

- [ ] 3.1 `closed` state, false at mount, and a `closed` story prop to start with it; on the phone no item is open while it is set
- [ ] 3.2 The chevron sets `closed`; a row tap clears it and opens that item; nothing else changes it
- [ ] 3.3 Phone: the open card is wrapped in `SnoozeSwipe`, held while `swiping` names it, committing the same snooze as the row's (story and live paths alike); no `onSnooze` reaches the phone card
- [ ] 3.4 Desktop: the card keeps `onSnooze` and S; no chevron, no swipe
- [ ] 3.5 The header comment describes the phone's card swipe, the absent Snooze text action and the closed state

## 4. Stories

- [ ] 4.1 `Screens/Queue` SnoozeUndoPhone: swipes the open card past half; asserts the reveal filled before release, no bar until the card has gone, Undo restores it open; its comment no longer claims a visible phone Snooze
- [ ] 4.2 `Screens/Queue` new stories: CardMidSwipePhone (the open card held over its reveal); CardSwipeCancelPhone (a short drag on the card eases back, no bar); CardSwipeOverDonePhone (a drag begun on Done, short of the rule, presses nothing and snoozes nothing; a tap on Done then shows "Waiting for pump"); CollapsePhone (the chevron leaves no card open, every row `aria-expanded="false"`; a row tap opens its card); ClosedPhone (`closed`: nothing open at mount)
- [ ] 4.3 `Screens/Queue` LiveSnoozeNotSavedPhone swipes the open card: once the refused write is held, the card is back with "Not saved", and Retry saves it; the Desktop twin keeps the text action
- [ ] 4.3a `Screens/Queue` TwoSnoozesSecondRefusedPhone and RetryOwnBarPhone (#610) swipe the open card where they press Snooze today; their Desktop twins keep the text action
- [ ] 4.4 `Screens/Queue` DoneUndoPhone, HabitOpenPhone, HabitPinnedPhone and the multi-cause card check assert no Snooze button on the phone and one on desktop; the multi-cause chart is reached by its element, not the title alone
- [ ] 4.5 `PatternCard`, `HabitCard` and `SettingCard` stories: the phone stories pass no `onSnooze` and press the chevron (`onCollapse` called once); the desktop stories keep Snooze and draw no chevron
- [ ] 4.6 `Foundations/Motion` → Transient bar swipes the open card instead of pressing Snooze
- [ ] 4.7 `npm run test:ui` clean for every story above; `UI_STORY=<id part>` while iterating

## 5. The spec

- [ ] 5.1 `openspec/changes/recommendations-redesign/specs/surfaces/spec.md`: the Queue requirement's Snooze sentence says Snooze is a text action beneath its primary on desktop (shortcut S), and on the phone the swipe of the item's row or open card, with no Snooze text action (§2.5, 2026-10-23); nothing else in that file changes
- [ ] 5.1a The change's MODIFIED deltas (a multi-cause Pattern's card; "No button while a change is watched") stand as written; nothing else in `openspec/specs` is edited by hand
- [ ] 5.2 `npx --yes @fission-ai/openspec@1.14.0 validate --all --strict` passes

## 6. Verify and evidence

- [ ] 6.1 Run each complete suite of the pull-request gate once, on the commit that will be pushed
- [ ] 6.2 Attach to the pull request: before/after frames for 0.1's stories plus CollapsePhone and CardMidSwipePhone; a frame strip of the open card's swipe (slow commit, Undo) and of it under reduced motion; the precheck output; the base SHA
