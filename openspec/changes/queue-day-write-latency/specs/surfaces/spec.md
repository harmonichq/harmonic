## ADDED Requirements

### Requirement: Queue writes made in a burst each save on a fresh guidance read

The app SHALL send Queue writes (Snooze, Restore, Done, Undo and Focus) to the
engine one at a time, in the order the person made them. Each write SHALL carry
the generation and input revision of a guidance and Focus-list read made after
the write before it was answered. The app SHALL NOT reuse a token a previous
write has spent.

#### Scenario: Two snoozes fired without waiting both save

- **GIVEN** an engine that refuses a snooze whose generation an earlier write
  has advanced past
- **WHEN** the person snoozes two Queue items before the first is answered
- **THEN** the engine receives the two snoozes in order, each with a different
  generation, and both save

### Requirement: A refused Queue write stays visible until it saves

A refused or failed Queue write SHALL put its item back as it was and show the
transient bar "Not saved" with Retry. The bar SHALL stay while any refused
write is held; a later write that saves SHALL NOT replace it. Retry SHALL send
every held refused write again, in order, each on a fresh guidance read, and
the bar SHALL leave once none is held. The writes in flight and the refused
ones SHALL be kept by the live adapter, so an item whose write is in flight
stays out of its list, and a held refusal keeps its bar, across a tab change.

#### Scenario: The second of two snoozes is refused

- **WHEN** the person snoozes two items and the engine refuses the second
- **THEN** the first is in Snoozed, the second is back in the Queue, and the bar
  reads "Not saved" with Retry
- **WHEN** the person presses Retry and the engine saves it
- **THEN** both items are in Snoozed and the bar leaves

#### Scenario: A snooze in flight across a tab change

- **WHEN** the person snoozes an item, opens another tab and returns before the
  engine answers
- **THEN** the item is still out of the Queue until the engine answers

### Requirement: A Queue write redraws the Queue without waiting on Changes

A Queue write SHALL resolve once the Queue's own answers (the guidance, the
findings, the Focus list and the case files the Queue reads) are read again.
It SHALL keep the Trial roster the Queue holds and SHALL NOT read the roster or
the active change's detail before it resolves. Changes SHALL draw its loading
state, never the answer it held before the write, until its own read after the
write lands.

#### Scenario: A snooze reads no roster

- **WHEN** the person snoozes a Queue item
- **THEN** the Queue redraws without a Trial roster read
- **WHEN** the person then opens Changes
- **THEN** Changes draws its loading state, reads the roster, and draws it

### Requirement: A Prompt answer moves the Day badge when the Prompts land

A Prompt answer SHALL resolve once the Prompts are read again, so the Day badge
and the Lows and Rises counts move then. It SHALL read again only the day on
screen, after the Prompts. Every other day visited this session SHALL be read
again when it is next shown, drawing its loading state until then, never its
answer from before the Prompt answer.

#### Scenario: Answering a Prompt with three days visited

- **GIVEN** the person has shown three days this session
- **WHEN** the person answers a Prompt
- **THEN** the badge moves once the Prompts land, the day on screen is read
  again after them, and the other two days are not read
- **WHEN** the person shows one of the other two days
- **THEN** it draws its loading state, is read, and draws
