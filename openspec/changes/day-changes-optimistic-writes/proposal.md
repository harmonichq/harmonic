# Day's and Changes' writes draw at once (#630)

## Why

#629 made every Queue action draw its result the moment it is made. Day and
Changes still wait on the home-lab host's few seconds. A Prompt answer moves
on to the next card at once, but the Day badge and the Lows and Rises counts
move only when the Prompts are read again. Log carbs holds its sheet open,
busy, until the save is answered. End leaves the active change on screen
until the engine has ended it. Connor: "all interactivity should use
optimistic actions" (#628).

## What changes

- **A Prompt answer moves the Day badge and the Lows and Rises counts at
  once**, on the Day screen, by the answers in flight.
- **Log carbs closes on Save.** The sheet (phone) or popover (desktop)
  closes, and the entry's mark draws on its day at once. If the save is
  refused, the mark leaves and the transient bar reads "Not saved" with
  Retry, which sends the same entry again (#628 Q6 A). The entry's "Saving"
  and "Not saved" states are retired. The bar already holds "Not saved" for
  every other write (§1.2).
- **End draws the ended screen at once.** The active change leaves, the
  screen draws what it will after End, and the Previous count goes up by one.
  In the Previous list, the ended change's row shows its served date and
  before → after at once, and its result pill only once the engine has saved
  it (#628 Q7 A).
- **The server still decides.** Each write's answer replaces the drawn state
  with no visible change, apart from the ended change's result pill, which
  appears when the engine saves it. A refusal reverts with "Not saved" and
  Retry.
- **The lock is amended** by a dated §2.5 entry (Log carbs' states, the ended
  change's Previous row before its result is saved). Mock stories go with it
  in the same pull request, which merges on the operator's "locked", as with
  #619.

The engine is unchanged. No server code changes.

## Risk contract

- **Must prevent:** a verdict (a Previous row's result pill) drawn before the
  engine saved it; a carb entry, an answer or an ended change drawn as saved
  after the engine refused it; a refused write that shows nothing; secret
  exposure.
- **Must recover:** a refused Log carbs, End or Prompt answer reverts at once
  to the served state, and the bar holds "Not saved" with Retry until Retry
  saves it.
- **Accepted failure:** these writes are held on their screen, not in the
  live adapter. A tab change while one is in flight draws the served state
  until its re-read lands, and another tab's Day badge moves only when the
  Prompts are read again. A Log carbs Retry after a save whose answer was
  lost can log the entry twice, as today: the carb log takes no request
  identity.
- **Unsupported:** two browsers writing at once; the grams edit after a Yes,
  which already draws at once and is unchanged.
- **Evidence owed:** a Day story whose fake answers late, asserting the badge
  and the counts moved before the answer and unchanged after it; a Day story
  in which Log carbs closes and its mark draws before the save answers, and
  one in which the save is refused (mark gone, "Not saved", and Retry sends
  the same grams and time); a Changes story whose End answers late, asserting
  the post-End screen and the Previous row without a result pill before the
  answer, and the pill after it; the existing Changes not-saved story still
  passing.
