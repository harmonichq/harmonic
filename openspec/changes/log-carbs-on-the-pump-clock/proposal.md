# Log carbs on the pump's wall clock

## Why

Log carbs stamped an entry with the browser's clock. When the browser runs in a
zone other than the pump's, an entry logged "now" was stored hours off, and could
land on another day, in the carb log the analysis reads to exclude meals and
basal minutes.

## What changes

- The carb log read serves `now`, the server's clock of record: the current
  instant on `TIMEZONE_NAME`'s wall clock.
- The app reads that clock each time Log carbs opens and stamps the entry from
  it: its "now", the day a picked time falls on, and so the day its mark is
  drawn on. Save waits for the clock; when it cannot be read, the entry shows
  Unavailable with Retry and never falls back to the browser's zone.
- The retired desk's requirement that the Log carbs header name the reader's
  local date and time is removed; the locked entry's header is "Log carbs".

## Impact

- `GET /api/carbs` gains one field; nothing it served before changes.
- The Day screen's Log carbs, through the live adapter.
