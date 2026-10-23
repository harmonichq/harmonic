# Queue and Day writes land at once, and none is lost (#610)

## Why

Snoozing four Pattern cards in a row left one snoozed. The app read the
guidance once and sent its generation with every snooze still in flight; the
first snooze advanced the input revision the generation carries, so the engine
refused the rest with 409, as it should. Each refusal replaced the one shared
"Not saved" bar, so all but the last were silent.

Restoring a snoozed card took 6 to 65 seconds to show on the home-lab host. A
Queue write forgot the Trial roster, which the engine keys on the input
revision and recomputes on demand, and the write waited for it and for the
Changes tab's detail before the Queue redrew.

The Day badge did not drop as Prompts were answered. The answer waited for the
Prompts and for every day visited this session to be read again, and each
day's model view recomputes after the engine's cache is cleared.

## What changes

- Queue writes (Snooze, Restore, Done, Undo, Focus) go to the engine one at a
  time, in the order made, each carrying the token of a guidance read made after
  the write before it was answered.
- A refused Queue write puts its item back and holds "Not saved" with Retry
  until Retry saves it; a later write that saves does not clear it, and Retry
  retries every refused write the bar holds. The writes in flight and the
  refused ones are kept by the live adapter, so a tab change neither brings
  back a card whose write is in flight nor loses a refusal.
- A Queue write redraws the Queue once the Queue's own answers are read again.
  It keeps the Trial roster the Queue holds and reads neither the roster nor
  Changes' detail. Changes draws its loading state, not its pre-write answer,
  until its own read after the write lands.
- A Prompt answer redraws the Day badge and the Lows and Rises counts once the
  Prompts are read again. It reads again only the day on screen, behind the
  Prompts; any other visited day is read again when next shown, with its
  loading state meanwhile.

The engine's refusal of a stale generation is unchanged. No server code
changes.

## Risk contract

- **Must prevent:** a Queue item shown snoozed, restored, Done or focused when
  the engine did not save it; a refused write that shows nothing; Changes
  drawing a pre-write roster as current after a Queue write; secret exposure.
- **Must recover:** a refused Queue write recovers through Retry, which reads
  the guidance afresh; a failed re-read after a write leaves the last coherent
  answer drawn and marked as today.
- **Accepted failure:** a Queue item whose write is in flight when the page
  reloads draws as served until the write's outcome is read; the write is not
  resumed after a reload.
- **Unsupported:** two browsers writing the same store at once (the engine's
  409 and Retry cover it, and nothing more); Changes' End, Log carbs and the
  grams edit keep today's re-reads.
- **Evidence owed:** a live-adapter test that fires two snoozes unawaited
  against a fake refusing a reused generation, both saved (failing first on
  today's code); a live-adapter test that a Queue write reads no roster before
  it resolves and Changes reads it after; a live-adapter test that a Prompt
  answer resolves after the Prompts and reads no off-screen day; a Queue story
  with two snoozes where the second is refused.
