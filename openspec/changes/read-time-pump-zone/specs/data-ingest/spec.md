## ADDED Requirements

### Requirement: The scheduled fetch window ends on the pump's current day

The scheduled fetch's window SHALL end on the calendar date of the pump's
wall-clock time for that attempt, the same reading that stamps the attempt. It
SHALL start the configured window length (120 days) before that date, whatever
zone the server process runs in.

#### Scenario: A server a day ahead of the pump asks for the pump's day

- **GIVEN** the server process's calendar date is a day later than the pump's
- **WHEN** a scheduled fetch attempt runs
- **THEN** the pull is asked for a window ending on the pump's current date
- **AND** starting 120 days before it

#### Scenario: A server a day behind the pump still asks for the pump's day

- **GIVEN** the server process's calendar date is a day earlier than the pump's
- **WHEN** a scheduled fetch attempt runs
- **THEN** the pull is asked for a window ending on the pump's current date, so
  that day's records are requested
