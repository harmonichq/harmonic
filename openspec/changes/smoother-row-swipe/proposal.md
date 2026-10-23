# Lock the smoother row swipe and the phone-gesture amendment (#613)

## Why

#612 records four phone-gesture decisions Connor took on 2026-10-23, and asks
for a mock of the first, a smoother swipe, for him to replay and approve
before any screen changes. Today's swipe (`useSwipe`, `frontend/ui/motion.ts`)
follows the finger clamped to its reveal, commits past half the reveal
(44 px of an 88 px reveal), settles back with a CSS transition, and has no
exit: a committed snooze removes the row at once and the bar rises over the
gap. The one hook drives the Queue row's Snooze and the Prompt's Not sure.

This change is the lock half of #612 (the build half is #614). It builds the
smoother swipe in the library hook, which the shipped row and Prompt take at
once, shows it as the `Foundations/Motion` → Snooze swipe story for Connor's
replay, and writes the lock amendment for all four decisions. It merges only
after Connor says "locked" on its pull request.

## What changes

- **The hook.** A press becomes a swipe only once it has moved 10 px and more
  across than down; a press that goes down first is the page's scroll and
  never swipes. The row then tracks the finger one to one up to its reveal,
  and with resistance past it. A release commits when the finger has
  travelled half the row's width, or is moving left faster than 500 px/s
  having passed the reveal's start; otherwise the row eases back. Each kind of
  swipe still does what it does today when it commits.
- **The reveal shows the decision.** Once a release would commit, the reveal
  fills with the accent's tint; it empties again if the finger comes back.
- **A row leaves before it acts.** On a commit the Queue row slides off to the
  left, then its height closes so the rows below rise into its place, and only
  then is it snoozed and the bar rises. A Prompt keeps today's exit: the next
  prompt comes in.
- **Durations are the library's.** The slide-off takes the standard duration
  on a new accelerating easing that never overshoots; the close-up and the
  ease-back take the emphasized duration on the standard easing. Under reduced
  motion nothing travels: the slide-off is a fade of the fast duration, the
  close-up and the ease-back are instant.
- **The mock.** The Snooze swipe Motion story replays a cancel, a commit past
  half, a flick commit and Undo, on the shipped Queue, and with reduced motion
  on.
- **The amendment.** `docs/design/recommendations-redesign.md` gains a dated
  §2.5 amendment for all four of #612's decisions, the §1.4 rows, the §1.3
  states, the §2.1 easing token and the §4.2 component states, so #614 builds
  against a locked page.

## Not in this change

- Swiping an open card, removing the phone's Snooze text action, the lead
  card's collapse and the Day swipe: the amendment records them; #614 builds
  them.
- A two-way swipe: #614 adds it with the Day swipe.
- Desktop: it has no swipe, and nothing on it changes.

## Risk contract

- **Must prevent:** a swipe that commits without the reveal having shown it
  would (a release that commits must have drawn the filled reveal on the frame
  before it, unless it was a flick); a vertical scroll that swipes a row or a
  Prompt; a commit that fires its action twice, or fires it after Undo has
  already been pressed; a row that leaves but is not snoozed, or is snoozed
  but stays drawn (silent incorrect success); motion that travels under
  reduced motion; an overshooting easing; a second swipe implementation in the
  tree; the amendment recording a decision #612 does not, or a quotation
  Connor did not give.
- **Must recover:** a snooze write that fails after the row has left puts the
  row back at rest with Not saved + Retry in the bar, as a failed Snooze does
  today; a pointer cancel (the system takes the gesture) settles the row back
  without committing.
- **Accepted failure:** the commit now needs half the row's width or a flick,
  so a slow short drag that snoozed before (past 44 px) now eases back. The
  Prompt's Not sure swipe takes the same rule.
- **Unsupported:** a swipe right; a swipe on desktop; a swipe on a row while
  another row is leaving.
- **Evidence owed:** story plays through the shipped Queue and Day for a
  cancel, a slow commit past half, a flick commit, a vertical drag that does
  not swipe, the filled reveal before release, the slide-off and close-up
  ending before the bar rises, Undo, a failed snooze write, and reduced motion
  (no translation on any frame); the replayable Motion story; the amendment
  text; the full pull-request gate once on the pushed commit.
