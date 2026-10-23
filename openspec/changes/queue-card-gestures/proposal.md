# Build the Queue's phone gestures: an open card's swipe and its collapse (#614)

## Why

#612 records four phone-gesture decisions Connor took on 2026-10-23, and #613
locked them as a dated §2.5 amendment to
`docs/design/recommendations-redesign.md` (merged in #616). This change builds
two of them on the locked Queue screen. The Day swipe is built separately by
#619: at this ticket's triage Connor chose a Day body that follows the finger,
which the lock does not yet record and which needs its own mock first.

On the phone today exactly one Queue card is always open: the screen opens the
selected item, or the top of the ranking when none is selected
(`QueueScreen.tsx`, `current = items.find(...) ?? items[0]`). The open card's
chevron is a decorative icon (`PatternCard`'s `ui-pcard__chevron` span), and a
Setting card has none. Snooze on an open card is a text action beneath Focus or
Done on both layouts; only a closed row swipes to Snooze (`useSwipe`, ADR 613).

## What changes

- **An open card swipes to Snooze.** On the phone the open Pattern, habit and
  Setting card swipes to Snooze as a row does: the same hook, the same commit
  rule, the same filled reveal, and the same exit (it slides off, closes up, and
  only then snoozes, with the bar and Undo). Its reveal runs the card's full
  height, its icon and label in the same 88 px column.
- **The phone has no Snooze text action.** The open card on the phone draws no
  Snooze beneath Focus or Done. Desktop keeps the text action and its shortcut
  S, and has no swipe. Connor kept this decision after the conflict with §1.4's
  "a swipe is a shortcut, never the only way" and WCAG 2.5.7 was raised; the
  §2.5 amendment records it, and this change does not reopen it.
- **The open card closes to its row.** On the phone the open card's chevron is a
  control: it closes the card back into its row, leaving nothing open, and
  tapping any row opens that item. A Setting card gains the chevron its Pattern
  sibling has. Closed is the screen's own state: a tab change opens the top card
  again.
- **The surfaces spec follows.** The active `recommendations-redesign`
  change's sentence "Every item SHALL offer Snooze, a text action beneath its
  primary" is rewritten for the phone's swipe, as #613's task 5.6 handed to
  this ticket. Two baseline requirements that name a Queue card's Snooze (a
  multi-cause Pattern's card, and the Focus button's "No button while a change
  is watched") are modified to say which Snooze each layout draws.

## Not in this change

- The Day swipe: #619.
- The lock document: #613 already amended it, and #619 amends it for the Day
  swipe's motion.
- The Prompt's Not sure swipe and its reveal: unchanged.
- The row swipe's rule, durations and easings (ADR 613): unchanged.
- Desktop: nothing changes there, beyond its stories asserting that Snooze stays.

## Risk contract

- **Must prevent:** a card swipe that snoozes an item other than the one whose
  card was swiped; a swipe that also presses the button it began over (Focus,
  Done, a multi-cause chart's drill-down); a tap on Focus or Done that no
  longer presses it; a phone open card that still draws a Snooze text action,
  or a desktop open card that does not; a second swipe implementation in the
  tree (the card takes the row's swipe, not a copy of it); a closed state that
  outlives a tab change, or that leaves a card drawn open; a vertical scroll of
  the card that swipes it; motion that travels under reduced motion; silent
  incorrect success: a card that leaves but is not snoozed, or is snoozed but
  stays drawn.
- **Must recover:** a snooze write the engine refuses after the card has left
  brings the item back through the live adapter's held writes (#610, `held()`
  and `retry()`), under the "Not saved" bar with Retry, as a refused row swipe
  does today.
- **Accepted failure:** on the phone, Snooze is reached only by a swipe
  (Connor's decision, recorded in §2.5 on 2026-10-23); a person who cannot drag
  has no Snooze on the phone.
- **Unsupported:** a swipe on a drill-down's cause card (it has no Snooze); a
  swipe right; a swipe on desktop; a swipe while the card is leaving; the
  closed state persisted anywhere beyond the mounted screen.
- **Evidence owed:** story plays through the shipped Queue for: an open
  card's swipe past half that leaves, then snoozes, with Undo restoring it open;
  a short drag on the open card that eases back without a snooze; a swipe begun
  over Done that neither presses Done nor snoozes short of the rule, then a tap
  on Done that presses it; a failed card-swipe write (the card back open at
  rest, Not saved, Retry); the card held mid-swipe; no Snooze text action on
  any phone open card and the text action on every desktop one; the chevron
  closing the card to its row with nothing open, and a row tap reopening it;
  the screen opening with nothing open; and the full pull-request gate once, on
  the pushed commit.
