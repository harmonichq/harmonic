# #443 The server stamps on the pump's wall clock

## Status

**Triage source for #443.** An ordinary ticket change, widened by the release
coordinator's rulings (Q3 delegation, 2026-09-23). It is backend work plus one
unreachable-branch removal in the desk. The desk's frozen behavior ledger and
replay are untouched.

## Why

Day's header and Episode Log print when the store last took data ("read …").
The hourly fetch stamps that time with the server process's clock. The shipped
container sets no process zone, so it runs in UTC, while `TIMEZONE_NAME` names
the pump's zone, the wall clock every record is stored in. In the documented
container deploy, the read time is therefore UTC wall time printed as local
time. Since #427 made Day's "viewed" stamp the reader's local clock, a read and
a view in the same minute no longer fold into one stamp.

The same fault runs through every stamp the server writes. It dates pump reads
("Captured", "On pump since", and the time a detected change starts), recorded
Plans, Focus pins, change-record endings, draft and set-aside times, and the
analysis date, all on the process clock. Those stamps are compared with record
times and with one another, so in a container they sit hours off the records
they are judged against. The fetch window's last day also comes from the process
calendar. East of UTC, a UTC container therefore requests nothing from the
pump's current day until UTC midnight.

Moving these stamps is also a one-time backward step for a container west of
UTC. Reproduced on base, such a step writes three durable wrong states:

- a Trial recorded in the wrong direction;
- a just-recorded Plan served as superseded, with none pending;
- a Focus ending dated before its own pin.

## What changes

- One clock function, `wall_clock_now`, returns now on `TIMEZONE_NAME`'s wall
  clock through the same conversion every record takes. Every stamp the server
  writes calls it. With the variable unset, or naming no known zone, it reads the
  process clock, as today. A fetch refuses an unknown zone by name, before any
  network call, and the attempt is recorded.
- Three writes are never stamped before the latest stored pump-read capture,
  recorded Plan or Focus pin: the pump-read capture, the follow-up write (a Plan,
  withdrawal, Focus pin or ending) and the ingestion reconcile. A clock that
  stepped back therefore writes after those stamps, not before them.
- The fetch window, scheduled or `harmonic fetch --days`, ends on the later of
  the pump's current date and the UTC date.
- Day reads the fetch's success time alone. The removed fallback cannot fire.
- Stored stamps are not rewritten.

## Not in this change

- No entrypoint, image or compose change.
- No change to an analyzer, classifier, staging predicate, cap, floor or served
  field name.
- No data-time anchor (the latest record instant) changes.
- No rendered layout, copy or ledger story changes.
