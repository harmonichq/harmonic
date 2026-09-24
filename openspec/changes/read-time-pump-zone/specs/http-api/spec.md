## ADDED Requirements

### Requirement: The status read's fetch times are on the pump's wall clock

When `TIMEZONE_NAME` is set, the scheduled fetch SHALL stamp `last_attempt_at`
on every attempt, and `last_success_at` on a successful one, with the pump's
wall-clock time. That time SHALL be the current instant converted to
`TIMEZONE_NAME` through the same normalization every stored record takes, in
the stored `YYYY-MM-DD HH:MM:SS` form, whatever zone the server process runs in.
When `TIMEZONE_NAME` is unset, an attempt SHALL still be recorded without
raising, stamped with the process clock. The pull refuses there, so
`last_success_at` SHALL NOT advance. A stamp stored earlier SHALL NOT be
rewritten; the next attempt or success replaces it.

#### Scenario: A server running in another zone stamps the pump's time

- **GIVEN** the server process runs in a zone 25 hours ahead of `TIMEZONE_NAME`
- **WHEN** a scheduled fetch attempt succeeds
- **THEN** `/api/status` serves `last_success_at` and `last_attempt_at` equal to
  the pump's wall-clock time of the attempt, to the minute
- **AND** neither names the process zone's date or time

#### Scenario: A failed attempt stamps the pump's time and keeps the last success

- **GIVEN** the server process runs in a zone other than `TIMEZONE_NAME`
- **WHEN** a scheduled fetch attempt fails
- **THEN** `last_attempt_at` is the pump's wall-clock time of the attempt
- **AND** `last_success_at` keeps its earlier value

#### Scenario: An unset zone is recorded, not raised

- **GIVEN** `TIMEZONE_NAME` is unset
- **WHEN** a scheduled fetch attempt runs
- **THEN** the attempt is recorded with an error naming `TIMEZONE_NAME`
- **AND** the fetch loop keeps running
- **AND** `last_success_at` does not advance
