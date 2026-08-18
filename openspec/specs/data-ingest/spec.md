# Data Ingest

## Purpose

This capability fetches a user's pump event log from Tandem Source, maps the typed events into normalized rows, and persists them into the local store through idempotent upserts. It owns the live pull boundary and pagination; reconstructing insulin-on-board from the stored bolus log belongs to a separate capability.

## Requirements

### Requirement: Long request windows are split and fetched as sequential ≤31-day chunks

Tandem Source rejects event-log requests spanning more than 31 days, so the ingest capability tiles any longer span into adjacent ≤31-day windows. Each window is fetched, mapped, and upserted in sequence. If an early window succeeds but a later one fails, a `PartialFetchError` is raised carrying the counts of rows persisted before the failure and the window that failed, so a retry can resume instead of discarding the partial pull.

### Requirement: Events are keyed on the pump's monotonic sequence number, not timestamp, for idempotency

Every event the pump emits carries a stable sequence number set once by the pump. The store uses this as the natural key so that re-pulling an overlapping window merges with existing rows instead of creating jittered duplicates. The pump's event timestamp drifts slightly between fetches (the vendor's decoder re-decodes it a few seconds differently each time), so keying on the timestamp would insert parallel rows on re-pull and double the recorded insulin — reconstructed IOB would collapse, and fasting-window measurements would shift by hours. The sequence number is monotonic and identical across all pulls of the same event, making it the only reliable deduplication key.

### Requirement: Pump event timestamps arrive as UTC and must be converted; CGM timestamps arrive as local wall-clock and must not be converted

The pump feed (basal, bolus, IOB events) carries `eventTimestamp` as a tz-aware UTC instant. These timestamps must be converted to the configured local timezone before storage. The CGM feed carries `egvTimestamp` as a count of seconds since the 2008 Tandem epoch, which decodes to the pump's local wall-clock time — the same reading the vendor's own UI displays at that wall-clock instant. This is already in local time and must be stored as a naive string without tz conversion. Tagging the local CGM timestamp as UTC and converting it would shift every reading by the configured timezone offset, sliding hours of data incorrectly through the analysis window.

### Requirement: A configured timezone is mandatory; a fetch refuses to run without it

Every basal profile is a wall-clock schedule (00:00, 00:30, etc.), so the analysis model requires all timestamps to be anchored to a consistent local wall-clock. The configured `TIMEZONE_NAME` sets this anchor. A fetch raises before making any network requests if `TIMEZONE_NAME` is not set, preventing the silent corruption that occurred when a full-history pull ran from a checkout with no `.env` — all tz-aware events stored at UTC wall time instead of local, shifting the entire history by the pump's offset and doubling the reconstructed insulin as phantoms.

### Requirement: The CGM source is the `LidCgmData*` family, not `LidBgReadingTaken`

The dense continuous-glucose series (~288 readings per day) comes from `LidCgmDataGxb`, `LidCgmDataG7`, or `LidCgmDataFsl2` events, each keyed by its `egvTimestamp` (the reading's true 5-minute-spaced time). The `LidBgReadingTaken` event fires only ~8 times per day and is retained only as a reference ground-truth for validating the model's reconstructed insulin-on-board; it is not used as a data source for the model.

### Requirement: No dense insulin-on-board series exists in this feed; bolus-only IOB must be reconstructed

Tandem Source has no dense, continuous IOB telemetry (the old event-based IOB series no longer exists). The model reconstructs insulin-on-board solely from the bolus log, excluding basal — bolus-only gives a clean ~0 baseline and avoids the bias of total IOB. Sparse IOB readings that ride on pump events (reference ground-truth only) are stored but the model does not depend on them.

