# Data Ingest

## Purpose

This capability fetches a user's pump event log from Tandem Source, maps the typed events into normalized rows, and persists them into the local store through idempotent upserts. It owns the live pull boundary and pagination; reconstructing insulin-on-board from the stored bolus log belongs to a separate capability.

## Requirements

### Requirement: Long request windows are split and fetched as sequential ≤31-day chunks

The system SHALL satisfy the following:

Tandem Source rejects event-log requests spanning more than 31 days, so the ingest capability tiles any longer span into adjacent ≤31-day windows. Each window is fetched, mapped, and upserted in sequence. If an early window succeeds but a later one fails, a `PartialFetchError` is raised carrying the counts of rows persisted before the failure and the window that failed, so a retry can resume instead of discarding the partial pull.

#### Scenario: Long request windows are split and fetched as sequential ≤31-day chunks

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Events are keyed on the pump's monotonic sequence number, not timestamp, for idempotency

The system SHALL satisfy the following:

Every event the pump emits carries a stable sequence number set once by the pump. The store uses this as the natural key so that re-pulling an overlapping window merges with existing rows instead of creating jittered duplicates. The pump's event timestamp drifts slightly between fetches (the vendor's decoder re-decodes it a few seconds differently each time), so keying on the timestamp would insert parallel rows on re-pull and double the recorded insulin — reconstructed IOB would collapse, and fasting-window measurements would shift by hours. The sequence number is monotonic and identical across all pulls of the same event, making it the only reliable deduplication key.

#### Scenario: Events are keyed on the pump's monotonic sequence number, not timestamp, for idempotency

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Pump event timestamps arrive as UTC and must be converted; CGM timestamps arrive as local wall-clock and must not be converted

The system SHALL satisfy the following:

The pump feed (basal, bolus, IOB events) carries `eventTimestamp` as a tz-aware UTC instant. These timestamps must be converted to the configured local timezone before storage. The CGM feed carries `egvTimestamp` as a count of seconds since the 2008 Tandem epoch, which decodes to the pump's local wall-clock time — the same reading the vendor's own UI displays at that wall-clock instant. This is already in local time and must be stored as a naive string without tz conversion. Tagging the local CGM timestamp as UTC and converting it would shift every reading by the configured timezone offset, sliding hours of data incorrectly through the analysis window.

#### Scenario: Pump event timestamps arrive as UTC and must be converted; CGM timestamps arrive as local wall-clock and must not be converted

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: A configured timezone is mandatory; a fetch refuses to run without it

The system SHALL satisfy the following:

Every basal profile is a wall-clock schedule (00:00, 00:30, etc.), so the analysis model requires all timestamps to be anchored to a consistent local wall-clock. The configured `TIMEZONE_NAME` sets this anchor. A fetch raises before making any network requests if `TIMEZONE_NAME` is not set, preventing the silent corruption that occurred when a full-history pull ran from a checkout with no `.env` — all tz-aware events stored at UTC wall time instead of local, shifting the entire history by the pump's offset and doubling the reconstructed insulin as phantoms.

#### Scenario: A configured timezone is mandatory; a fetch refuses to run without it

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: The CGM source is the `LidCgmData*` family, not `LidBgReadingTaken`

The system SHALL satisfy the following:

The dense continuous-glucose series (~288 readings per day) comes from `LidCgmDataGxb`, `LidCgmDataG7`, or `LidCgmDataFsl2` events, each keyed by its `egvTimestamp` (the reading's true 5-minute-spaced time). The `LidBgReadingTaken` event fires only ~8 times per day and is retained only as a reference ground-truth for validating the model's reconstructed insulin-on-board; it is not used as a data source for the model.

#### Scenario: The CGM source is the `LidCgmData*` family, not `LidBgReadingTaken`

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: No dense insulin-on-board series exists in this feed; bolus-only IOB must be reconstructed

The system SHALL satisfy the following:

Tandem Source has no dense, continuous IOB telemetry (the old event-based IOB series no longer exists). The model reconstructs insulin-on-board solely from the bolus log, excluding basal — bolus-only gives a clean ~0 baseline and avoids the bias of total IOB. Sparse IOB readings that ride on pump events (reference ground-truth only) are stored but the model does not depend on them.

#### Scenario: No dense insulin-on-board series exists in this feed; bolus-only IOB must be reconstructed

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

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

### Requirement: A fetch refuses an unloadable time zone before any network call

A fetch SHALL refuse to run when `TIMEZONE_NAME` loads no time zone (an unknown
name, a malformed name or a region name such as `America`), as it refuses when
the variable is unset: before any import of the sync extra,
credential read or network call, with an error naming `TIMEZONE_NAME`.

#### Scenario: An unloadable zone is refused before the login

- **GIVEN** `TIMEZONE_NAME` is set to a name that loads no time zone
- **WHEN** a fetch runs
- **THEN** it raises an error naming `TIMEZONE_NAME` without reading credentials
  or contacting the vendor
