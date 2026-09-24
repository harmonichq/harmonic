# #425 design record

## ADR 425 — Day's recorded-day count is served, and loaded month reads merge by day

### Context

Day's rail count was the number of `has_data` rows across every loaded month
read (`frontend/day.js` `loadedDays()` → `dayFrame`), while the span beside it
came from `/api/status` (`earliest_data_day` / `latest_data_day`, from
`Store.cgm_day_bounds`). Each navigator read spans its month plus seven days
either side (`ciq_autotune/day_navigator.py` `_PAD_DAYS`), and `loadedDays()`
flattens the reads without merging, so every day in an overlap between two loaded
reads appears twice. The rail over-counted by the overlap and under-counted every
month not yet read; a month's head (`monthGrid`) over-counted by its neighbour's
overlapping week. The ribbon's `decorate`, the month cells and `step()` survived
the duplicates only because `find` takes the first match and a repeated date
cannot change the nearest earlier or later date.

### Decision

1. **The total is served.** `/api/status` serves `data_day_count`: the number of
   distinct pump-local wall-clock days (the date of the naive local reading time,
   bucketed as `cgm_day_bounds` buckets it) carrying at least one CGM reading
   with a glucose value. The Day rail prints it. It comes from the same status
   read as the first and last day, so the rail's count and span are always one
   coherent pair.
2. **The population is the calendar's.** A reading whose sensor reported HIGH or
   LOW is stored with no glucose value (`tandemsource_map._cgm_row`), and the
   navigator marks a day with no glucose value as no data (`has_data` requires a
   value). So a day holding only such readings is not counted, even though the
   issue's wording said "at least one CGM reading": the count must equal the
   number of recorded cells the reader can see. A spike against `Store` with one
   such day, one gap day and three glucose days counted 3, equal to the
   navigator's `has_data` days; counting any reading gave 4.
3. **Loaded reads merge to one row per day, at the one join.** `dayFrame`'s state
   carries the loaded month reads as the desk holds them (keyed by month) instead
   of a pre-joined row list, and joins them to one row per day before any reader
   sees them. The same join feeds recorded-day stepping. When two reads carry the
   same day, the read of the month that day belongs to supplies it; a padding row
   stands only while its own month is not loaded. That keeps each month's cells
   and head equal to its own read in either load order (spiked for both orders),
   and it removes the duplicate rows rather than relying on `find` to hide them —
   the next reader that counts or sums over the list would otherwise repeat this
   bug.
4. **The month head counts its merged rows.** It counts the joined rows inside the
   shown month that have data. The navigator's rows are the served per-day facts,
   so nothing is re-derived and no second count is served.
5. **No fallback.** The Python process serves the built shell and the API
   together (ADR 416), so a status read without `data_day_count` is not a state
   this desk meets; the rail does not fall back to counting loaded rows.

### Consequences

- The status read gains one query. It stays in the uncached cheap-read class the
  http-api spec names: on a synthetic three-year table (315k readings) the count
  measured about 20 ms, the same order as the existing first/last-day query
  (about 17 ms). Day reads status once per session; Diagnose reads it on arrival
  and on each retained return.
- Left as it is: the first and last day still bucket any reading, glucose value
  or not, so on a store whose edge day holds only HIGH/LOW readings the span can
  name a day the count does not include. That divergence predates this change and
  is not touched here.
- Left as it is: Day holds its status read for the session, so after an hourly
  fetch the count and span stay at the earlier read until reload, exactly as the
  span already does.

### Risk contract

- **Must prevent:** a count that silently disagrees with the days the calendar
  shows as recorded; any change to an analyzer, staging predicate, cap or floor.
- **Must recover:** none beyond the desk's existing read-failure frame.
- **Accepted failure:** after a fetch lands mid-session, the rail's count and
  span stay at the session's first status read until reload.
- **Unsupported:** a status response from a different build than the shell.
- **Evidence owed:** the served count through `/api/status` on a store with a gap
  day and a glucose-less day; the rail's count unchanged by paging and equal for
  one or two loaded reads; each month's head equal to its own recorded days with
  a neighbour loaded; the same facts in the served desk (S127 and the desk
  browser suite).
- **Why:** the count is display-only, but a count that reads as "your history"
  must be the history.
- **Disposition:** inline.
