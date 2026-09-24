## ADDED Requirements

### Requirement: Changes and carb-utility Day links name their return target by identity

A contextual Day entry that Changes or a carb utility writes SHALL name its
return target by an identity its origin owns, and SHALL carry no CSS selector: a
supporting date of the active change or of a change record by that date, a Log
carbs entry by its served id, and a Carb questions prompt by its detector and
anchor time. A utility's identity SHALL ride the entry's routing subject, beside
its unchanged printed title. The desk's address SHALL carry no return-focus key,
and an address that carries one SHALL be read without it.

On return, the origin SHALL resolve the identity to its own control. Changes
SHALL put focus on that date's supporting-date control once the change's content
has rendered, once per arrival, on the desktop; the narrow desk SHALL keep
focusing its sheet toggle. The reopened utility SHALL put focus on that item's own
Open Day control. When the identity matches nothing the origin shows, focus SHALL
land on the origin's heading. An identity read from the address SHALL NOT become
selector text unless it is a well-formed date or the identity of an item the
utility serves.

#### Scenario: A supporting date returns to its own control

- **GIVEN** Changes shows the active change's evidence with its contributing dates
- **WHEN** the reader opens one date in Day and then presses Return to Changes
- **THEN** the Day address names that date and carries no CSS selector and no
  return-focus key
- **AND** once the change's evidence has rendered again, focus is on that date's
  control

#### Scenario: A change record's date returns to that record

- **GIVEN** a change record is open in Changes with its contributing dates
- **WHEN** the reader opens one date in Day and returns
- **THEN** the Day address names that date and that record and carries no CSS
  selector
- **AND** the same record is open and focus is on that date's control

#### Scenario: A utility's Day link names its item

- **WHEN** the reader opens a Log carbs entry, or a Carb questions prompt, in Day
- **THEN** the Day address names the entry by its id, or the prompt by its
  detector and anchor time, and carries no CSS selector
- **AND** Day's "Opened from" still prints the utility's own label for that moment

#### Scenario: A utility return lands on the control the reader pressed

- **GIVEN** the reader opened Day from a utility item
- **WHEN** the reader returns
- **THEN** the utility is open again and focus is on that item's own Open Day
  control
- **AND** when that item is no longer served, focus is on the utility's heading

#### Scenario: An older or crafted address cannot hand the page a selector

- **GIVEN** a Day address that carries a return-focus key, or a date or subject
  that is not an identity the origin serves
- **WHEN** the reader returns from Day
- **THEN** no part of that value is used as a selector
- **AND** focus lands on the origin's own control for a matching identity, or on
  its heading

### Requirement: A carb utility's Day return keeps the desk it returns to

A carb utility's Day return SHALL hand the destination the utility was opened
over no context, and SHALL reopen the utility over it. A return into a retained
Diagnose SHALL be a retained return: exactly one status read and no guidance or
evidence read, with the drilled case, the chosen window and the reading pane's
scroll as the reader left them. The Diagnose address SHALL then name the
retained case and SHALL carry no utility title, no return origin and no
selector. A utility opened over Day SHALL return into Day as a direct entry.

#### Scenario: Carb questions over a drilled case

- **GIVEN** the reader drilled a Finding's case in Diagnose and opened Carb
  questions over it
- **WHEN** the reader opens a prompt in Day, closes the utility and presses
  Return to Carb questions
- **THEN** exactly one status read is issued and nothing else
- **AND** the drilled case and the pressed window are unchanged, Carb questions
  is open over them, and the address names that case with no utility title,
  return origin or selector

#### Scenario: A utility over Day returns into Day

- **GIVEN** the reader opened Log carbs over Day and opened one of its entries in
  Day
- **WHEN** the reader returns
- **THEN** Day shows the day it was on, offers no "Opened from" return, and Log
  carbs is open over it

### Requirement: The Log carbs header names the reader's local date and time

The Log carbs utility's header SHALL name the reader's local wall-clock date and
time, both taken from one local wall-clock reading.

#### Scenario: A local evening keeps its own date

- **GIVEN** the reader's local time is 22:45 on Jun 29 while the UTC date is
  already Jun 30
- **WHEN** the Log carbs utility opens
- **THEN** its header reads `at Jun 29 · 22:45`
- **AND** it names neither the UTC date nor the UTC time

## MODIFIED Requirements

### Requirement: Day names the subject it was opened from by its served name

Every contextual Day entry SHALL carry a display `title` beside its routing
subject: the served finding title for a Diagnose occurrence, the setting name
and half-hour range for a basal slot (such as `Basal · 03:00–03:30`), the title
the record's own nameplate
shows for a Changes record or the active change, and the utility's existing
label for a utility moment. The title SHALL ride the address with the other
entry fields, so a reload or Back keeps it. Day's "Opened from" SHALL print the
title and SHALL NOT print the routing subject. An entry whose address carries no
title SHALL name the destination it returns to instead. The title SHALL NOT
change the entry's routing subject, occurrence, window, lever or return; a
utility moment's routing subject is the identity of the item it came from.

#### Scenario: A Diagnose occurrence names its finding

- **GIVEN** a Diagnose case whose served case file names its finding
- **WHEN** the reader opens Day from one of its occurrences
- **THEN** "Opened from" shows that served finding title
- **AND** no `pattern:`, `finding:` or `basal:` text appears in the Day desk
- **AND** the return holds the same occurrence and puts focus on the same control
  as before

#### Scenario: A basal slot names its setting and time

- **GIVEN** a basal slot selected in Diagnose with no case drilled
- **WHEN** the reader opens Day from it
- **THEN** "Opened from" names the basal setting and the slot's half-hour range, such as `Basal · 03:00–03:30`

#### Scenario: The name survives the address

- **GIVEN** a contextual Day entry that carries a title
- **WHEN** the address is serialized and parsed again
- **THEN** the parsed entry carries the same title and the same subject

#### Scenario: An address without a name names the way back

- **GIVEN** a contextual Day address that carries a subject but no title
- **WHEN** Day renders it
- **THEN** "Opened from" names the destination it returns to
- **AND** the subject is not printed
