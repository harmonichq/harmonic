## MODIFIED Requirements

### Requirement: The Focus button shows only where the engine would start one

Every Focus button on the Queue and the drill-down SHALL render only while
`GET /api/focus` serves `admission.focus_pin.available` as true. A Pattern
card's SHALL render only while the same answer lists that Pattern among its
`pinnable_patterns`, and a cause card's only while that Pattern's listed
`levers` include the cause (ADR 666): the list is the pin's own admission, so a
button is drawn exactly where a Focus would start. A habit card's SHALL render
as before. The card of the active Focus SHALL show its pill. Nothing SHALL
explain an absent button, and a cause card's head SHALL keep the button's
height in every state.

#### Scenario: No button while a change is watched

- **GIVEN** a store whose served admission is unavailable because a Focus is
  active
- **WHEN** the Queue and a drill-down render
- **THEN** no card offers Focus, the watched card shows its pill, and every
  other card shows its chart and, on the Queue, Snooze (on the phone, the
  card's swipe; on desktop, its text action)

#### Scenario: A Pattern that is not ready offers no Focus

- **GIVEN** the `pattern-correction-collapse` QA case, whose Lows after
  correcting highs is withheld, so the Focus list names no Pattern
- **WHEN** its Queue card and its drill-down render
- **THEN** neither the card nor any cause card offers Focus, and each cause
  card's head keeps the button's height

#### Scenario: A cause the engine will not focus has no button

- **GIVEN** a ready Lows after correcting highs whose Focus list names
  Correction on active insulin and not Correction stacking, whose one stacked
  pair is too few for the habit
- **WHEN** its drill-down renders
- **THEN** Correction on active insulin's card offers Focus and Correction
  stacking's card offers none, with its head at the same height

### Requirement: A refused Queue write stays visible until it saves or its item is gone

A refused or failed Queue write SHALL put its item back as it was and be held
as refused. While any refused write is held, the transient bar SHALL read "Not
saved" with Retry, outranking every other bar the Queue shows. Retry SHALL send
every held refused write again, in order, each on a fresh guidance read. A held
refusal SHALL be dropped when its write saves, or when the engine answers that
its subject is no longer served (404). A write the engine refused outright, with
a refusal that is not a conflict (a 4xx other than 409), SHALL be dropped when
the person makes any later write after the refusal, and when its Retry is
refused outright again, since sending it again cannot save it (ADR 666). A
refused write SHALL NOT be held when the person made its own Undo on its
subject after it: a Restore for a Snooze and a Snooze for a Restore, an Undo
for a Done and a Done for an Undo. A Done made after its refused Undo SHALL NOT
be sent. Any other later write SHALL leave a refused conflict or a failed write
held. A Retry's re-send SHALL NOT count as a later write. A Restore, or an Undo
of a Done, whose subject's earlier Snooze or Done was refused SHALL NOT be
sent, since there is nothing left to undo. The writes in flight and the refused
ones SHALL be kept by the live adapter, not the screen, so an item whose write
is in flight is drawn as that write will leave it, and a held refusal keeps its
bar, across a tab change.

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

#### Scenario: A Snooze after a refused Restore cancels its refusal

- **GIVEN** a Restore in flight, and the person has snoozed the item again
- **WHEN** the engine refuses the Restore and saves the snooze
- **THEN** the item is in Snoozed, no refusal is held, and Retry never
  restores it

#### Scenario: A write refused outright clears at the next write

- **GIVEN** a held Focus the engine refused outright (400, not ready), not as a
  conflict
- **WHEN** the person then snoozes another item and the engine saves it
- **THEN** the refusal is dropped and the bar reads "Snoozed until <date>" with
  Undo
- **AND** when instead the person presses Retry and the engine refuses it
  outright again, the refusal is dropped and the bar leaves
