## ADDED Requirements

### Requirement: A fetch window ends on the pump's current day

The scheduled fetch's window, and `harmonic fetch --days N`'s, SHALL end on the
calendar date of the pump's wall clock at that fetch, whatever zone the process
runs in. It SHALL start the window length before that date: 120 days for the
scheduled fetch, N days for the command.

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

#### Scenario: The fetch command ends on the pump's day

- **GIVEN** the process's calendar date differs from the pump's
- **WHEN** `harmonic fetch --days 3` runs
- **THEN** the pull is asked for a window ending on the pump's current date and
  starting three days before it
