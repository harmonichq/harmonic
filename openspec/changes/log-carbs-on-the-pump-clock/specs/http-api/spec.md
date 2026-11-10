## ADDED Requirements

### Requirement: The carb log read serves the pump's wall clock

`GET /api/carbs` SHALL serve `now` beside its entries: the server's clock of
record, the current instant on `TIMEZONE_NAME`'s wall clock, to the second,
whatever zone the server process runs in, and SHALL serve it over an empty span
too. A client that stamps a carb entry's time SHALL stamp it from that clock,
never from its own zone, so an entry logged now is stored at the pump's date and
time.

#### Scenario: An entry logged now lands on the pump's date and time

- **GIVEN** the server process runs in a zone 25 hours ahead of `TIMEZONE_NAME`
- **WHEN** a client reads the carb log and posts an entry at the `now` it serves
- **THEN** `now` is the pump's wall-clock time, to the minute
- **AND** the carb log lists the entry at that date and time
