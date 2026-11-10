## ADR 658 — Log carbs reads the pump's wall clock from the carb log

**Context.** Log carbs took its "now", and the day a picked time falls on, from
the browser's clock. The store keeps every record on the pump's wall clock
(`TIMEZONE_NAME`), and every stamp the server writes is read from that clock
(ADR 443). A browser in another zone logged an entry hours off, sometimes on
another day, and the carb log is what the analysis reads to exclude meals and
basal minutes.

The server could stamp a "now" entry itself, but the lock's Log carbs (§2.5,
2026-10-25) draws the entry's mark on its day at its time the moment Save is
pressed, and its Retry sends the same grams and time again. Both need the
wall-clock time before the write is sent.

**Decision.**

1. `GET /api/carbs` serves `now`, `wall_clock_now()` to the second, beside the
   entries. The carb log over an empty span serves only that clock.
2. Each time Log carbs opens, the live app reads that clock afresh, with a read
   of its own. The difference between the served time and the browser's instant
   is taken as that answer arrives, never later, and Save reads now as the
   browser's instant plus that difference. Save stamps the entry's date and,
   unless a time was picked, its time from it; Retry resends what Save stamped,
   and the mark draws at that time as Save is pressed.
3. An entry is never stamped from the browser's zone. Until the clock read
   answers, Save is held, as it is while no amount is typed. When it cannot be
   read, the Time row gives way to the lock's failed-read form, Unavailable with
   Retry, and Save stays held until a Retry reads it. No day read, remembered
   answer or earlier opening stands in for it: a page left open across a change
   of the pump's offset, or reloaded from remembered days, stamps from the clock
   read as that entry opened.
4. The entry's header is "Log carbs", as the lock draws it, and its Time row
   reads Now or the picked time; neither names a zone. The surfaces requirement
   that the header name the reader's local date and time described the retired
   desk's utility and is removed.

**Consequences.** An entry logged "now", or at a picked time today, is stored on
the pump's date and time whatever zone the browser runs in, and a skewed browser
clock is corrected by the same difference. Opening Log carbs costs one small
read, and Save waits for it; offline, Log carbs cannot save at all rather than
guess. The carb log's write path is unchanged: it stores the time it is sent.
