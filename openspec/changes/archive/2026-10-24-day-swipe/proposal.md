# Mock, lock and build the Day swipe that follows the finger (#619)

## Why

The 2026-10-23 phone-gesture amendment (#612, #613) records that a horizontal
swipe on the Day body steps to the previous or next day with data. It does not
say how the body moves. At #614's triage Connor chose a swipe in which the
body follows the finger and the adjacent day slides in from that side. That
is new motion the lock does not record, so, as #613 did for the row swipe,
this change mocks it on the real hook, amends the lock, and builds it in one
pull request that merges only after Connor says "locked" on it.

Today nothing on Day swipes except a Prompt (Not sure). The day changes only
through the header's month drop-down and, on desktop, the selected week's
ribbon. `useSwipe` (`frontend/ui/motion.ts`) moves one way: left, over a
reveal, never right of rest.

## What changes

- **A two-way form of the one swipe hook.** `useSwipe` gains a step form: the
  element follows the finger either way, a way with nowhere to go is
  resisted from rest, and a release commits by the row's rule mirrored to the
  way the finger went. A press that starts near either screen edge is left to
  the platform.
- **The adjacent day with data.** `day-model.ts` names the previous or next
  day with data from a day, through the day navigator, and says when the
  month holding it has to be read first.
- **Day steps by a swipe, on the phone.** Swiping the Day body left shows the
  next day with data coming in from the right; swiping right shows the
  previous one coming in from the left. Released past half the body's width,
  or on a flick, the day changes: the header names it, and its chart is the
  skeleton until its timeline lands. Otherwise the body eases back. At the
  first or last day with data the body is resisted and eases back. Only on
  Day itself: the Prompts keep their own swipe, and the desktop has none.
- **The mock.** A `Foundations/Motion` → Day swipe story replays the swipe on
  the shipped Day screen both ways, across a month boundary, and with reduced
  motion.
- **The amendment.** `docs/design/recommendations-redesign.md` gains a dated
  §2.5 amendment for the motion, and §1.3, §1.4 and §4.2 follow it.

## Not in this change

- The Queue's gestures (the open-card swipe, the closing card, the phone's
  Snooze): #614.
- The month drop-down and the desktop ribbon, which stay as they are, the
  visible ways to change day.
- Any engine, API or fixture change: the day navigator and the month read the
  Day screen already uses serve everything the step needs.

## Risk contract

- **Must prevent:** a step to a day without data, or past the first or last
  day with data; a step that lands on a different day from the one the body
  showed coming in; the header, chart and insulin bar naming different days
  after a step (silent incorrect success); a step on a vertical scroll, on a
  press that starts at a screen edge, on a pointer cancel, inside the
  Prompts, with the month or the Log carbs sheet open, or on desktop; motion
  that travels after release under reduced motion; an overshooting easing; a
  second swipe implementation in the tree; any change to the Queue row's or
  the Prompt's swipe behaviour; the amendment recording a decision Connor
  did not take, or a quotation he did not give.
- **Must recover:** a month read that fails leaves that way resisted, the day
  unchanged and the month drop-down's own Unavailable + Retry intact; a step
  to a day whose timeline is not served yet shows the chart's skeleton until
  it lands, and Unavailable if the read fails, as picking that day does
  today.
- **Accepted failure:** a way whose month read has not landed yet is
  resisted, so a swipe made the moment a day opens near a gap can bounce
  once.
- **Unsupported:** a swipe on desktop; stepping more than one day per swipe;
  stepping while a step is still sliding in.
- **Evidence owed:** story plays through the shipped Day screen for a step
  each way, a step across a month boundary inside the served weeks and one
  that reads the month, a short drag that eases back, a flick, the last day
  resisted, a vertical drag, an edge press, a pointer cancel, a swipe inside
  the Prompts that records Not sure and leaves the day, desktop with no
  swipe, and reduced motion; a contract-test assertion of the adjacent days on
  the showcase, including one reached through a month read; the replayable
  Motion story; the amendment text; the full pull-request gate once on the
  pushed commit.
