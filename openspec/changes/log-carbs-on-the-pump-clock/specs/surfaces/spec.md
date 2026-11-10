## ADDED Requirements

### Requirement: Log carbs stamps an entry on the pump's wall clock

Each time Log carbs opens, the app SHALL read the server's clock of record afresh
and SHALL stamp the entry's date, and its time unless one was picked, from that
clock as Save is pressed, never from the browser's zone. Save SHALL stay held
until that clock is read. When it cannot be read, the Time row SHALL show
Unavailable with Retry and Save SHALL stay held until a Retry reads it. The
entry's header SHALL read "Log carbs", and its Time row Now or the picked time.

#### Scenario: A browser in another zone logs on the pump's date and time

- **GIVEN** the pump's wall clock reads 05:06 on Mar 4 while the browser's zone
  reads another date and hour
- **WHEN** the reader opens Log carbs, types an amount and presses Save
- **THEN** the entry is sent at Mar 4 05:06

#### Scenario: Save waits for the clock

- **GIVEN** the reader opened Log carbs and typed an amount
- **WHEN** the clock read has not answered
- **THEN** Save is held
- **AND** once it answers, Save stamps the entry from the served clock

#### Scenario: A clock that cannot be read is never guessed

- **GIVEN** the clock read fails as Log carbs opens
- **THEN** the Time row shows Unavailable with Retry and Save is held
- **AND** after a Retry that reads it, Save stamps the entry from the served clock

## REMOVED Requirements

### Requirement: The Log carbs header names the reader's local date and time

**Reason**: It described the retired desk's Log carbs utility. The locked entry
(§4.2 LogCarbsEntry) is headed "Log carbs" and shows its time in the Time row,
and an entry's time is the pump's wall clock, never the reader's local zone
(ADR 658).

**Migration**: None. The header names no date or zone; the Time row reads Now or
the picked time, and Save stamps the pump's wall clock.
