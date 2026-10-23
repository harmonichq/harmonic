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

### Requirement: A refused Queue write stays visible until it saves or its item is gone

A refused or failed Queue write SHALL put its item back as it was and be held
as refused. While any refused write is held, the transient bar SHALL read "Not
saved" with Retry, outranking every other bar the Queue shows. Retry SHALL send
every held refused write again, in order, each on a fresh guidance read. A held
refusal SHALL be dropped when its write saves, or when the engine answers that
its subject is no longer served (404). The writes in flight and the refused
ones SHALL be kept by the live adapter, not the screen, so an item whose write
is in flight stays out of its list, and a held refusal keeps its bar, across a
tab change.

#### Scenario: The second of two snoozes is refused

- **WHEN** the person snoozes two items and the engine refuses the second
- **THEN** the first is snoozed, the second is back in the Queue, and the bar
  reads "Not saved" with Retry
- **WHEN** the person presses Retry and the engine saves it
- **THEN** both are snoozed and the bar leaves

#### Scenario: A snooze in flight across a tab change

- **WHEN** the person snoozes an item, opens another tab and returns before the
  engine answers
- **THEN** the item is still out of the Queue until the engine answers

#### Scenario: A refusal whose item is gone

- **GIVEN** a held refused snooze whose subject a sync has since removed
- **WHEN** the person presses Retry and the engine answers 404
- **THEN** the refusal is dropped and the bar leaves

### Requirement: A Queue write redraws the Queue without waiting on Changes

A Queue write SHALL resolve once the Queue's own answers (the guidance, the
findings, the Focus list and the case files the Queue reads) are read again.
It SHALL keep the Trial roster the Queue holds and SHALL NOT read the roster or
the active change's detail before it resolves. It SHALL drop Changes' answer,
from the page and from the answers the browser remembers, so Changes draws its
loading state, never the answer it held before the write, until its own read
after the write lands, after a reload too.

#### Scenario: A snooze reads no roster

- **WHEN** the person snoozes a Queue item
- **THEN** the Queue redraws without a Trial roster read
- **WHEN** the person then opens Changes, in the same page or after a reload
- **THEN** Changes draws its loading state, reads the roster, and draws it

### Requirement: A Prompt answer moves the Day badge when the Prompts land

A Prompt answer SHALL resolve once the Prompts are read again, so the Day badge
and the Lows and Rises counts move then. The live adapter SHALL hold the day on
screen as the day it last read for the Day screen. The answer SHALL be followed
by a read of that day alone. Every other day visited this session SHALL be
dropped and read again when it is next shown, drawing its loading state until
then, never its answer from before the Prompt answer.

#### Scenario: Answering a Prompt with three days visited

- **GIVEN** the person has shown three days this session
- **WHEN** the person answers a Prompt
- **THEN** the badge moves once the Prompts land, the day on screen is read
  again after them, and the other two days are not read
- **WHEN** the person shows one of the other two days
- **THEN** it draws its loading state, is read, and draws

## MODIFIED Requirements

### Requirement: A Focus is started from its own cause and announced

Every Pattern, habit and cause card's Focus action SHALL read "Focus". A
cause card's Focus SHALL start a Focus on that cause's lever under the
Pattern, and the write SHALL name that lever; a single-cause Pattern's and a
habit's Focus SHALL be sent as before. A started Focus SHALL show the transient
bar "Focus started" with the text action "Changes", which opens the Changes
tab, unless a refused Queue write is held, whose "Not saved" bar outranks it;
a refused or failed one SHALL put the card back with "Not saved" and
Retry. While a cause is the Pattern's active Focus, the Pattern's Queue card
SHALL show the caption "Focus" over that cause's served title in the button's
place, and the cause's card SHALL show the Focus pill in its button's place;
when no served cause names the watched lever, the Queue card SHALL show the
Focus pill.

#### Scenario: Focus on the second cause watches it

- **GIVEN** the `pattern-meal-two-causes` drill-down, where Carb undercount is
  the Pattern's first member and Late bolus is served first
- **WHEN** the person presses Focus on Late bolus
- **THEN** a Focus starts on Late bolus under Highs after meals, and the bar
  reads "Focus started" with Changes
- **AND** the Late bolus card shows the Focus pill, and the Queue card shows
  "Focus" over Late bolus

#### Scenario: Changes opens from the bar

- **WHEN** the person taps Changes in the "Focus started" bar
- **THEN** the Changes tab opens on that Focus

#### Scenario: A failed Focus is not saved

- **WHEN** a cause's Focus write fails
- **THEN** its card shows its Focus button again, and the bar reads "Not
  saved" with Retry

### Requirement: The snooze bar names its date in one phrase

The transient bar after a snooze SHALL read "Snoozed until <date>", the date
fourteen days after the engine's served decision time, with Undo, unless a
refused Queue write is held, whose "Not saved" bar outranks it.

#### Scenario: Snoozing shows the date

- **WHEN** the person snoozes a Queue item
- **THEN** the bar reads "Snoozed until" and the served date, with Undo

#### Scenario: A held refusal outranks the snooze bar

- **GIVEN** a held refused Queue write
- **WHEN** the person snoozes another item and it saves
- **THEN** the bar still reads "Not saved" with Retry, and the item is in
  Snoozed
