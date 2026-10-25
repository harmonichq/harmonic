## ADDED Requirements

### Requirement: A Queue write draws its written state before the engine answers

The moment a Queue write is made, the Queue SHALL draw the store as the write
will leave it, before the engine answers. A Snooze SHALL take its item out of
the Queue, add its row to the Snoozed list, add one to the Snoozed count, and
raise "Snoozed until <date>" with Undo. A Restore, or an Undo of a snooze,
SHALL take its row out of the Snoozed list, take one from the Snoozed count,
and return the item to the Queue at its served priority. A Done SHALL take its
card out of the Queue and raise "Waiting for pump" with Undo. An Undo of a
Done SHALL return the card to the Queue. A Focus SHALL draw its card pinned,
raise "Focus started" with Changes, and draw no Focus on any other card. The
live adapter SHALL hold each write in flight with its kind and the time it was
made. A restored Pattern's card SHALL draw the whole-card skeleton while its
case file, read when the Restore is made, is in flight, and its row SHALL draw
as served. The Queue model SHALL draw a held write by setting the served fields that
write writes and applying the one Queue order rule. It SHALL NOT derive an
item's rank or its admission. When the engine answers, the Queue SHALL draw
its served answer. A refused write SHALL return its item to the served state
with "Not saved" and Retry.

#### Scenario: A snooze is in Snoozed before the engine answers

- **GIVEN** the Queue with an engine that has not yet answered a snooze
- **WHEN** the person snoozes an item, by its Snooze, by S on desktop, or by a
  swipe on the phone
- **THEN** the item leaves the Queue with the locked exit motion, the Snoozed
  count is one more, the item's row is in the Snoozed list with its Until,
  and the bar reads "Snoozed until <date>" with Undo
- **WHEN** the engine saves it
- **THEN** the Queue, the Snoozed list, the count and the bar read as they did

#### Scenario: A restore is back in the Queue before the engine answers

- **GIVEN** the Snoozed list with an engine that has not yet answered a
  restore
- **WHEN** the person presses Restore on a row
- **THEN** the row leaves the Snoozed list, the count is one less, and the item
  is in the Queue at its served priority

#### Scenario: Done and its Undo before the engine answers

- **GIVEN** a Setting card with an engine that has not yet answered
- **WHEN** the person presses Done
- **THEN** the card leaves the Queue and the bar reads "Waiting for pump" with
  Undo
- **WHEN** the person presses Undo before the engine answers
- **THEN** the card is back in the Queue and the bar has left

#### Scenario: A Focus before the engine answers

- **GIVEN** a Pattern card with an engine that has not yet answered a Focus
- **WHEN** the person presses Focus
- **THEN** the card carries the Focus pill, the bar reads "Focus started" with
  Changes, and no other card draws Focus

#### Scenario: A refused snooze reverts

- **GIVEN** a snooze drawn in Snoozed before the engine answers
- **WHEN** the engine refuses it
- **THEN** the item is back in the Queue, its row has left the Snoozed list,
  the count is as served, and the bar reads "Not saved" with Retry

## MODIFIED Requirements

### Requirement: The snooze bar names its date in one phrase

The transient bar after a snooze SHALL read "Snoozed until <date>" with Undo,
unless a refused Queue write is held, whose "Not saved" bar outranks it. While
the snooze is in flight the date SHALL be fourteen days after the browser's
clock when the snooze was made. Once the engine answers, it SHALL be fourteen
days after the engine's served decision time. A snoozed row's Until SHALL read
the same date.

#### Scenario: Snoozing shows the date

- **WHEN** the person snoozes a Queue item
- **THEN** the bar reads "Snoozed until" and the date fourteen days on, with
  Undo
- **WHEN** the engine saves it
- **THEN** the bar reads the served date

#### Scenario: A held refusal outranks the snooze bar

- **GIVEN** a held refused Queue write
- **WHEN** the person snoozes another item and it saves
- **THEN** the bar still reads "Not saved" with Retry, and the item is in
  Snoozed

### Requirement: A refused Queue write stays visible until it saves or its item is gone

A refused or failed Queue write SHALL put its item back as it was and be held
as refused. While any refused write is held, the transient bar SHALL read "Not
saved" with Retry, outranking every other bar the Queue shows. Retry SHALL send
every held refused write again, in order, each on a fresh guidance read. A held
refusal SHALL be dropped when its write saves, or when the engine answers that
its subject is no longer served (404). A refused Snooze SHALL NOT be held
when the person made a Restore on its subject after it, nor a refused Done when
the person made its Undo after it; any other later write SHALL leave a refusal
held. A Retry's re-send SHALL NOT count as a later write. A Restore, or an
Undo of a Done, whose subject's earlier Snooze or Done was refused SHALL NOT be
sent, since there is nothing left to undo. The writes in flight and the
refused ones SHALL be kept by the live adapter, not the screen, so an item
whose write is in flight is drawn as that write will leave it, and a held
refusal keeps its bar, across a tab change.

#### Scenario: The second of two snoozes is refused

- **WHEN** the person snoozes two items and the engine refuses the second
- **THEN** the first is snoozed, the second is back in the Queue, and the bar
  reads "Not saved" with Retry
- **WHEN** the person presses Retry and the engine saves it
- **THEN** both are snoozed and the bar leaves

#### Scenario: A refused Done that Retry saves shows its own bar

- **GIVEN** a held refused Done, and no other refused Queue write
- **WHEN** the person presses Retry and the engine saves it
- **THEN** the bar reads "Waiting for pump" with Undo, as on a first save
- **AND** a refused Focus that Retry saves likewise shows "Focus started" with
  Changes

#### Scenario: A snooze in flight across a tab change

- **WHEN** the person snoozes an item, opens another tab and returns before the
  engine answers
- **THEN** the item is still in Snoozed, not the Queue, until the engine
  answers

#### Scenario: A refusal whose item is gone

- **GIVEN** a held refused snooze whose subject a sync has since removed
- **WHEN** the person presses Retry and the engine answers 404
- **THEN** the refusal is dropped and the bar leaves

#### Scenario: An Undo made while its write is in flight outlives that write's refusal

- **GIVEN** a snooze in flight, and the person has pressed Undo
- **WHEN** the engine refuses the snooze
- **THEN** no refusal is held, the restore is not sent, the item is in the
  Queue as served, and no "Not saved" bar shows
- **AND** a Done refused after its Undo was pressed likewise leaves no refusal
  and no "Waiting for pump"

#### Scenario: A refused Focus outlives a later Snooze

- **GIVEN** on desktop, a Focus in flight on a Pattern card, and the person has
  pressed its Snooze
- **WHEN** the engine refuses the Focus and saves the snooze
- **THEN** the item is in Snoozed and the bar reads "Not saved" with Retry
