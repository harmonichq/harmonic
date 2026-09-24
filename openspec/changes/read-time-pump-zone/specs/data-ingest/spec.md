## ADDED Requirements

### Requirement: A fetch window ends no earlier than the pump's current date

The scheduled fetch's window, and `harmonic fetch --days N`'s, SHALL end no
earlier than the calendar date of the pump's wall clock at that fetch, whatever
zone the process runs in. It SHALL end on the later of that date and the current
UTC date, because the vendor request labels its end as a UTC day and nothing
records which day the vendor reads. It SHALL start the window length before its
end: 120 days for the scheduled fetch, N days for the command.

#### Scenario: A server a day ahead of the pump asks through the later date

- **GIVEN** the server process's calendar date is a day later than the pump's
- **WHEN** a scheduled fetch attempt runs
- **THEN** the pull is asked for a window ending on the later of the pump's
  current date and the UTC date
- **AND** starting 120 days before that end

#### Scenario: A server a day behind the pump still asks for the pump's day

- **GIVEN** the server process's calendar date is a day earlier than the pump's
- **WHEN** a scheduled fetch attempt runs
- **THEN** the pull is asked for a window ending no earlier than the pump's
  current date, so that day's records are requested

#### Scenario: The fetch command ends no earlier than the pump's day

- **GIVEN** the process's calendar date is a day earlier than the pump's
- **WHEN** `harmonic fetch --days 3` runs
- **THEN** the pull is asked for a window ending no earlier than the pump's
  current date and starting three days before that end

### Requirement: A fetch refuses an unknown time zone before any network call

A fetch SHALL refuse to run when `TIMEZONE_NAME` names no known time zone, as it
refuses when the variable is unset: before any import of the sync extra,
credential read or network call, with an error naming `TIMEZONE_NAME`.

#### Scenario: An unknown zone is refused before the login

- **GIVEN** `TIMEZONE_NAME` is set to a name no time-zone database knows
- **WHEN** a fetch runs
- **THEN** it raises an error naming `TIMEZONE_NAME` without reading credentials
  or contacting the vendor
