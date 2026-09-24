# A late background read no longer drops Diagnose focus (#441)

## Status

**Triage source for #441.** An ordinary ticket change. The desk's frozen
behavior ledger (`mockups/harmonic-v2-desktop.behavior.md`) and its replay stay
unchanged: this change brings the app back in line with a claim the ledger
already makes, so no story is amended and none is added.

## Why

Behaviour story S24 fails intermittently in the nightly ledger at 1280×720:
`Timed out after 30000 ms: S24; saw [ false ]; Expected values to be strictly
equal: false !== true`. The failing wait is the app arm's focus check. After ↓
then ↑ steps back to the first cohort member, that member's Occurrence row must
hold keyboard focus.

Triage reproduced the failure on demand. Pressing Diagnose starts background
reads that nothing on screen waits for: the Focus options read and the
guidance read it forces. When one lands, the desk renders again. Diagnose's
mount then re-seats its case file even though the case file is already seated.
Re-seating removes and re-inserts the subtree that holds focus, so the browser
drops focus to the page body. Nothing puts it back. The desk restores only a
focus target it placed itself, and the case file's own restoration runs only on
its own repaint, and only while focus is still on a row.

A reader is affected the same way, not just the replay. A Diagnose reader who
is stepping through Occurrences with ↑ and ↓ can lose their place whenever a
background read lands. The next Tab then starts at the top of the page. The
replay fails only when that landing falls in the few milliseconds between the
↑ repaint and the check, which is why it is rare and slow-runner dependent.

## What changes

- A render that finds the Diagnose case file already seated keeps it attached
  instead of removing and re-inserting it. Focus held inside the case file, its
  scroll and its selection survive a render the reader did not ask for.
- A cold seat, a return that re-seats a parked desk (ADR 414), the loading
  frame and both failed-read frames behave exactly as today.
- A fail-first test through the Diagnose destination's public mount pins that
  an in-place render never detaches the seated case file.

## Risk contract

- **Must prevent:** a render that drops the reader's focus from inside a seated
  Diagnose case file; any change to what Diagnose reads, when it re-reads, what
  a return shows, or any served verdict, staging predicate or safety gate; a
  silent false-green replay.
- **Must recover:** nothing automatically.
- **Accepted failure:** a render that replaces the case file itself (a cold seat,
  a re-read behind the loading frame, a failed-read frame) still moves focus
  the way it does today.
- **Unsupported:** focus retention on destinations other than Diagnose; proving
  scheduler timing by repetition alone.
- **Evidence owed:** the public-interface test above, red on the pre-change
  mount; the dependency-free frontend suite; S24 at 1280×720 passing ten
  consecutive replay runs; one replay of the stories that cross the Diagnose
  mount (re-press, failed frames, return, occurrence focus, cold arrival).

## Impact

One Diagnose destination module and its unit test. No served payload, API,
fixture, generated artifact, behavior-ledger story, replay story, analyzer,
staging predicate or safety floor changes. The visible desk is unchanged.
