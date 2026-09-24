## ADDED Requirements

### Requirement: The status read's fetch times are on the pump's wall clock

The scheduled fetch SHALL stamp `last_attempt_at` on every attempt, and
`last_success_at` on a successful one, with the server's clock of record: the
current instant on `TIMEZONE_NAME`'s wall clock, whatever zone the server process
runs in. When `TIMEZONE_NAME` is unset, an attempt SHALL still be recorded
without raising. The pull refuses there, so `last_success_at` SHALL NOT advance.
A stamp stored earlier SHALL NOT be rewritten; the next attempt or success
replaces it.

#### Scenario: A server running in another zone stamps the pump's time

- **GIVEN** the server process runs in a zone 25 hours ahead of `TIMEZONE_NAME`
- **WHEN** a scheduled fetch attempt succeeds
- **THEN** `/api/status` serves `last_success_at` and `last_attempt_at` equal to
  the pump's wall-clock time of the attempt, to the minute

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

#### Scenario: An unknown zone is recorded on the process clock, not raised

- **GIVEN** `TIMEZONE_NAME` names no known time zone
- **WHEN** a scheduled fetch attempt runs
- **THEN** the attempt is recorded with an error naming `TIMEZONE_NAME`, and
  `last_attempt_at` is the process clock's time
- **AND** the fetch loop keeps running
- **AND** `last_success_at` does not advance

### Requirement: Every stamp the server writes is on the pump's wall clock

Every time the server stamps SHALL be read from one clock: the current instant
converted to `TIMEZONE_NAME` through the same conversion every stored record
takes, whatever zone the server process runs in. This covers:

- a pump read's capture time;
- a recorded Plan's decision and withdrawal times;
- a Focus pin;
- a change record's ending, observation and confirmation times;
- a reassessment time;
- a guidance set-aside time;
- a Plan draft's saved time, which keeps its sub-second precision;
- a carb-log entry's and a prompt answer's recorded time;
- an analysis time.

When `TIMEZONE_NAME` is unset or names no known time zone, that clock SHALL be
the process clock. A data-time anchor, the latest record instant, is not a stamp
and is unchanged.

#### Scenario: A pump read, a Plan and a Focus pin name the pump's time

- **GIVEN** the server process runs in a zone 25 hours ahead of `TIMEZONE_NAME`
- **WHEN** a pump read is captured, a Plan is recorded and a Focus is pinned
- **THEN** `/api/pump-settings` serves `fetched_at`, the Plan history serves
  `applied_at`, and the Focus serves `pinned_at`, each equal to the pump's
  wall-clock time of that write, to the minute

#### Scenario: A saved draft keeps its sub-second time on the pump's clock

- **GIVEN** the server process runs in a zone other than `TIMEZONE_NAME`
- **WHEN** a Plan draft is saved
- **THEN** its `updated_at` is the pump's wall-clock time, to the microsecond

#### Scenario: An unset zone uses the process clock

- **GIVEN** `TIMEZONE_NAME` is unset
- **WHEN** a Focus is pinned
- **THEN** the pin succeeds and `pinned_at` is the process clock's time

### Requirement: A floored stamp never sorts before the latest capture, Plan or Focus pin

A pump read's capture time, a recorded Plan's time and every follow-up write's
time (a Focus pin, a withdrawal, an ending, a reconciliation) SHALL be later than
the latest capture, Plan or Focus pin already stored. When the clock reads no
later than that stamp, the new stamp SHALL be one second after it. Stored stamps
SHALL NOT be rewritten.

#### Scenario: A profile switch read after the clock steps back is recorded forward

- **GIVEN** a pump read stored with the server's clock 7 hours ahead of its
  current reading
- **WHEN** a later read shows a profile switch that moves correction factor from
  30 to 40, and the store is reconciled
- **THEN** the later read sorts after the earlier one and is served as the pump's
  current settings
- **AND** exactly one Trial is recorded, from 30 to 40, at the later read

#### Scenario: A Plan recorded after the clock steps back is the pending Plan

- **GIVEN** a Plan recorded and withdrawn with the server's clock 7 hours ahead
  of its current reading
- **WHEN** a new Plan is recorded
- **THEN** the Plan history lists the new Plan first
- **AND** guidance serves it as the pending Plan

#### Scenario: A Focus ended after the clock steps back ends after its pin

- **GIVEN** a Focus pinned with the server's clock 7 hours ahead of its current
  reading
- **WHEN** the Focus is resolved
- **THEN** its saved ending is effective after its pin
