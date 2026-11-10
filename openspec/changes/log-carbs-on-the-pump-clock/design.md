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
   entries. The Day screen reads the carbs with every day it shows, so the clock
   arrives with no request of its own.
2. The live adapter keeps how far that clock runs ahead of UTC, and the Day
   screen's Log carbs reads now as UTC plus that difference. Save stamps the
   entry's date and, unless a time was picked, its time from it; Retry resends
   what Save stamped.
3. Until a day's carbs have landed, the difference is the browser's own zone's,
   as before. The Day screen reads its day as it opens, so this is the first
   read's latency only.

**Consequences.** An entry logged "now", or at a picked time today, is stored on
the pump's date and time whatever zone the browser runs in, and a skewed browser
clock is corrected by the same difference. The carb log's write path is
unchanged: it stores the time it is sent.
