# The Queue's writes draw at once (#629)

## Why

A snooze on the home-lab host takes about four seconds to be answered. The
card leaves the Queue at once, but the Snoozed count, the Snoozed row and the
"Snoozed until <date>" bar wait for the answer and the Queue's re-read, so for
those seconds the card is simply gone and nothing says where it went. Connor:
"It needs to be smooth and obvious to the user that it's entering the snoozed
queue", and then "all interactivity should use optimistic actions" (#628).
Restore, Done, Undo and Focus wait the same way: a restored item, a "Waiting
for pump" bar, an undone Done and a "Focus started" bar each appear only once
the engine has answered.

## What changes

- Each Queue write (Snooze, Restore, Done, Undo of a snooze or a Done, Focus)
  draws its written state the moment it is made: the Queue, the Snoozed list,
  the Snoozed count and the bar show the store as the write will leave it.
- A snooze's Until is the browser's now plus fourteen days while it is in
  flight, and the engine's served decision time plus fourteen days once
  answered. The two are the same date unless the browser's clock and the
  pump's zone fall on different days.
- When the engine answers, the screen draws its served answer, which matches
  what was drawn, with no visible change.
- A refused write reverts its move, with "Not saved" and Retry, as today.
- The live adapter, not the screen, holds each in-flight write's kind and the
  time it was made. The Queue model draws a held write by setting the served
  fields it writes (snoozed, decision time, waiting for the pump) and applying
  the one Queue order rule, which moves out of the adapter into a module both
  the adapter and the model import.

The engine is unchanged. No server code changes. Day's and Changes' writes
are #630.

## Risk contract

- **Must prevent:** Retry re-sending a write the person has since undone; a
  Queue item drawn snoozed, restored, Done, undone or
  focused after the engine refused it; a refused write that shows nothing; a
  second copy of the Queue order rule in the frontend; a Focus drawn on any
  card while a Focus is in flight; secret exposure.
- **Must recover:** a refused write reverts at once to the served state and
  holds "Not saved" with Retry until it saves or its item is gone (unchanged
  from #610).
- **Accepted failure:** an optimistic Until can read one day off the served
  one for the seconds the write is in flight, when the browser's clock and
  the pump's zone fall on different days; it then shows the served date. A
  write in flight when the page reloads draws as served after the reload, as
  today.
- **Unsupported:** two browsers writing the same store at once (the engine's
  409 and Retry cover it); Day's and Changes' writes (#630).
- **Evidence owed:** a live-adapter test that a held snooze reports its kind
  and time from the moment it is made, that the newest write per subject
  is reported while an older one settles, and that a held Focus survives a
  later snooze on its subject; a live-adapter test that a write refused after
  the person undid it holds no refusal and sends no undo, and that a Focus
  refused after a later Snooze stays held; a live-adapter test that a restored
  Pattern's case file is read at once and kept until its Restore is answered; a Queue story per write kind whose
  fake answers late, asserting the drawn state before the answer and the same
  state after it; the existing refused-write stories still passing.
