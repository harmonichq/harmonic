# #443 The fetch's read time is on the pump's wall clock

## Status

**Triage source for #443.** An ordinary ticket change: backend only. No
rendered surface's source changes, and the desk's frozen behavior ledger and
replay are untouched.

## Why

Day's header and Episode Log print when the store last took data ("read …").
That time is the fetch status's `last_success_at`, which the hourly fetch
stamps with the server process's own clock. The shipped container sets no
process zone, so it runs in UTC, while `TIMEZONE_NAME` names the pump's zone,
the wall clock every record is stored in. In the documented container deploy,
the read time is therefore UTC wall time printed as local time. Since #427 made
Day's "viewed" stamp the reader's local clock, a read and a view in the same
minute no longer fold into one stamp there. West of UTC, the read can also look
later than the view.

The same attempt takes its window's last day from the process calendar. East of
UTC, a UTC container asks for data only up to yesterday on the pump's calendar
until UTC midnight.

## What changes

- Each scheduled fetch attempt takes the current time once, on the pump's wall
  clock. It converts the current instant through the same normalization every
  stored record takes, so the result does not depend on the zone the server
  process runs in.
- The attempt stamps `last_attempt_at`, and on success `last_success_at`, with
  that time. `/api/status` serves both, and the Day desk reads the second
  unchanged.
- The fetch window ends on that time's calendar date, the pump's day, and starts
  the usual 120 days earlier.
- When `TIMEZONE_NAME` is unset, the attempt still records the pull's refusal
  without raising, stamped with the process clock. A local `harmonic serve`
  needs no zone to start. The pull refuses before any network call, so
  `last_success_at` cannot advance there.
- Stamps already stored are not rewritten. The next attempt replaces
  `last_attempt_at`, and the next success replaces `last_success_at`.

## Not in this change

No entrypoint, image or compose change: the container keeps its UTC process
zone. The server's other stamps keep the process clock: a pump read's capture
time, the time a Plan is recorded or a Focus pinned, a change record's ending
and confirmation times, and guidance and carb-log fallbacks. They are compared
with one another, so they move together or not at all (see design.md, "What
stays on the process clock"). No analyzer, classifier, staging predicate, cap,
floor, served field name or frontend source changes.
